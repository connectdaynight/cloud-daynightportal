const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);
    if (pathname === '/') pathname = '/index.html';

    // Mock API video streaming endpoint if requested locally
    if (pathname.startsWith('/api/video')) {
      const id = parsedUrl.searchParams.get('id');
      const v = parsedUrl.searchParams.get('v') || '3';
      const redirectUrl = `https://daynight-portal.pages.dev/api/video?id=${id}&v=${v}`;
      res.writeHead(302, { 'Location': redirectUrl });
      return res.end();
    }

    // Server-based API save endpoint for reel status and metadata
    if (pathname === '/api/save' || pathname === '/api/updateReelStatus') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Storage-Namespace');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          if (payload.reelId && payload.status) {
            // Update local portal-data files if present
            const pathsToUpdate = [
              path.join(ROOT, 'portal-data.json'),
              path.join(ROOT, 'Client Portal', 'DataDBs', 'portal-data.json')
            ];
            pathsToUpdate.forEach(fPath => {
              try {
                if (fs.existsSync(fPath)) {
                  const db = JSON.parse(fs.readFileSync(fPath, 'utf8'));
                  const reel = (db.reels || []).find(r => String(r.id).trim() === String(payload.reelId).trim());
                  if (reel) {
                    reel.status = payload.status;
                    db._updatedAt = Date.now();
                    fs.writeFileSync(fPath, JSON.stringify(db, null, 2), 'utf8');
                  }
                }
              } catch(_) {}
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, savedAt: Date.now(), status: payload.status }));
        } catch(err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    const filePath = path.join(ROOT, pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server Error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`Local test server running at http://localhost:${PORT}`);
});
