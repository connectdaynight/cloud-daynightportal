# How to Upload 700 MB – 800 MB+ Videos via Google Apps Script

## Why Your Current Upload Stops at 25 MB – 50 MB
1. **Google Apps Script `doPost(e)` Hard Limit:** Google enforces a strict **50 MB maximum payload limit** on requests sent to `script.google.com`. Anything larger is rejected by Google's gateway before your script even runs.
2. **Browser Base64 Memory Crash:** Your current code uses `FileReader.readAsDataURL(file)`, which converts an 800 MB MP4 into a **1.1 GB text string in RAM**, crashing Chrome/Edge tabs.

## The Solution: Google Drive v3 Resumable Upload Session
Instead of pushing 800 MB *through* Google Apps Script, we use a **3-step handshake**:
1. **Step 1 (`initVideoUpload` in GAS):** Your browser sends a tiny 1 KB request to GAS. GAS creates/finds the client's folder, generates a temporary **Google Drive v3 Resumable Upload URL** (`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`), and passes your website's `Origin` header so Google Drive unlocks CORS for your browser.
2. **Step 2 (Direct Binary Stream from Browser to Google Drive):** Your browser streams the raw 800 MB MP4 file **directly from disk to Google's upload server** (`xhr.send(file)`) with **zero Base64 encoding** and **real-time MB/s progress**.
3. **Step 3 (`finalizeVideoUpload` in GAS):** Once the upload hits 100%, Google Drive returns the new `fileId`. Your browser sends that `fileId` back to GAS to set public streaming permissions and save the reel in your portal database.

---

## STEP 1: Add Resumable Upload Handlers to `gas/Code.gs`

Add these two helper functions to the bottom of your **`gas/Code.gs`** file, and wire `initVideoUpload` and `finalizeVideoUpload` inside your `doPost(e)` switch/if block.

### 1.1 Inside `doPost(e)` in `gas/Code.gs`

Add these two actions to your action router inside `doPost(e)`:

```javascript
    if (action === 'initVideoUpload') {
      return jsonResponse(initVideoUpload(payload));
    }
    if (action === 'finalizeVideoUpload') {
      return jsonResponse(finalizeVideoUpload(payload));
    }
```

### 1.2 Paste at the Bottom of `gas/Code.gs`

Paste these two functions at the very bottom of `gas/Code.gs` (after your existing functions):

```javascript
/**
 * STEP 1 OF LARGE UPLOAD (Supports 700MB - 5GB+):
 * Creates a Google Drive Resumable Upload Session URL with CORS unlocked for the portal origin.
 */
function initVideoUpload(payload) {
  // Ensure DriveApp & UrlFetchApp OAuth scopes are authorized
  DriveApp.getRootFolder();

  var clientName = payload.clientName || 'General';
  var subFolderName = payload.branch || payload.album || '';
  var filename = payload.filename || ('video_' + Date.now() + '.mp4');
  var mimeType = payload.mimeType || 'video/mp4';
  var fileSize = payload.fileSize || 0;
  var origin = payload.origin || '*';

  // Find or create: Day Night Media Portal / Reels / {ClientName} / {Branch or Album}
  var rootIter = DriveApp.getFoldersByName('Day Night Media Portal');
  var rootFolder = rootIter.hasNext() ? rootIter.next() : DriveApp.createFolder('Day Night Media Portal');

  var reelsIter = rootFolder.getFoldersByName('Reels');
  var reelsFolder = reelsIter.hasNext() ? reelsIter.next() : rootFolder.createFolder('Reels');

  var clientIter = reelsFolder.getFoldersByName(clientName);
  var targetFolder = clientIter.hasNext() ? clientIter.next() : reelsFolder.createFolder(clientName);

  if (subFolderName) {
    var subIter = targetFolder.getFoldersByName(subFolderName);
    targetFolder = subIter.hasNext() ? subIter.next() : targetFolder.createFolder(subFolderName);
  }

  var metadata = {
    name: filename,
    mimeType: mimeType,
    parents: [targetFolder.getId()]
  };

  var headers = {
    'Authorization': 'Bearer ' + ScriptApp.getOAuthToken(),
    'X-Upload-Content-Type': mimeType,
    'Origin': origin
  };
  if (fileSize > 0) {
    headers['X-Upload-Content-Length'] = String(fileSize);
  }

  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: headers,
    payload: JSON.stringify(metadata),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var resHeaders = res.getAllHeaders();
  var uploadUrl = resHeaders['Location'] || resHeaders['location'];

  if ((code === 200 || code === 201) && uploadUrl) {
    return {
      success: true,
      uploadUrl: uploadUrl,
      folderId: targetFolder.getId()
    };
  } else {
    return {
      success: false,
      error: 'Failed to initialize Drive resumable session (HTTP ' + code + '): ' + res.getContentText()
    };
  }
}

/**
 * STEP 3 OF LARGE UPLOAD:
 * Sets public sharing permissions on the uploaded file and saves the reel metadata.
 */
function finalizeVideoUpload(payload) {
  var fileId = payload.fileId;
  if (!fileId) return { success: false, error: 'Missing fileId' };

  try {
    var file = DriveApp.getFileById(fileId);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // Continue even if domain policy restricts link sharing
  }

  var viewUrl = 'https://drive.google.com/file/d/' + fileId + '/view';
  var driveThumb = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';

  var newReel = {
    id: payload.id || ('r' + Date.now().toString(36)),
    c: payload.clientId,
    type: 'reel',
    y: Number(payload.year) || new Date().getFullYear(),
    m: Number(payload.month) || 0,
    b: payload.branch || '',
    album: payload.album || '',
    title: payload.title || 'Untitled Reel',
    date: payload.date || new Date().toISOString().slice(0, 10),
    url: viewUrl,
    fileId: fileId,
    dur: payload.dur || '0:30',
    coverUrl: payload.coverUrl || driveThumb,
    hidden: false,
    status: payload.status || 'approved',
    views: 0,
    downloads: 0,
    sample: false,
    thumbnailGenerated: true
  };

  // If your Code.gs has a database save function (e.g. saveReel / addReel / getDb), save it here:
  if (typeof addReel === 'function') {
    try { addReel({ reel: newReel }); } catch (e) {}
  } else if (typeof saveReel === 'function') {
    try { saveReel({ reel: newReel }); } catch (e) {}
  }

  return {
    success: true,
    fileId: fileId,
    url: viewUrl,
    reel: newReel
  };
}
```

> **Important:** After adding this to `gas/Code.gs`, click **Deploy → Manage deployments → Edit (pencil icon) → Version: New version → Deploy** in Google Apps Script so the new endpoints go live and grant `UrlFetchApp` permission.

---

## STEP 2: Replace the 25 MB Limit in `admin.html` with 5 GB Direct Binary Streaming

In `admin.html`, inside `openUploadModal()`, replace the `MAX_DIRECT_BYTES = 25 * 1024 * 1024` and `FileReader` block with the direct binary uploader below.

**Old Code (`admin.html`):**

```javascript
          // --- MODE 2: DIRECT FILE UPLOAD ---
          const file = activeVideoFile || sc.querySelector('#f-file').files[0];
          if (!file) { toast('Please select an MP4 video file to upload', 'error'); return; }

          const MAX_DIRECT_BYTES = 25 * 1024 * 1024; // 25 MB max
          if (file.size > MAX_DIRECT_BYTES) {
            const mb = (file.size / (1024 * 1024)).toFixed(1);
            confirmModal(
              `Large Video File (${mb} MB)`,
              `Direct browser streaming is limited to 25 MB by Google Drive's gateway.<br><br>` +
              `<b>Your high-definition thumbnail is already captured!</b><br><br>` +
              `For production master files (${mb} MB):<br>` +
              `1. Upload directly into your Google Drive client folder.<br>` +
              `2. Switch to <b>Google Drive Link</b> tab and paste the link to publish instantly with zero wait time.`,
              () => { window.open('https://drive.google.com', '_blank'); },
              'Open Google Drive',
              false,
              'Switch to Link Mode'
            );
            return;
          }

          // Render Live Upload Progress UI in modal
          const modalBody = sc.querySelector('.modal-card, .sheet') || sc;
          modalBody.innerHTML = `
            <div class="live-upload-box">
              <div class="live-upload-header">
                <div class="live-upload-title">
                  <span class="sync-icon" style="color:var(--blue);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-3.95 11z"/></svg></span>
                  <span>Live Video Upload to Google Drive</span>
                </div>
                <div class="live-upload-pct" id="live-pct">0%</div>
              </div>

              <div class="live-prog-track">
                <div class="live-prog-bar" id="live-bar"></div>
              </div>

              <div class="live-upload-stats">
                <span id="live-bytes">Reading video file from disk...</span>
                <span id="live-speed">Calculating socket speed...</span>
              </div>

              <div class="live-upload-stages">
                <div class="live-stage-item done" id="stage-thumb">
                  <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span>High-definition video thumbnail generated</span>
                </div>
                <div class="live-stage-item active" id="stage-upload">
                  <span id="stage-upload-icon">→</span><span id="stage-upload-text">Streaming video payload to Google Drive...</span>
                </div>
                <div class="live-stage-item" id="stage-cloud">
                  <span id="stage-cloud-icon">○</span><span>Confirming Google Drive file ID</span>
                </div>
              </div>

              <div style="display:flex;justify-content:flex-end;margin-top:14px;">
                <button class="btn-portal" id="btn-cancel-upload" style="font-size:11px;padding:4px 10px;">Cancel Upload</button>
              </div>
            </div>`;

          const liveBar = sc.querySelector('#live-bar');
          const livePct = sc.querySelector('#live-pct');
          const liveBytes = sc.querySelector('#live-bytes');
          const liveSpeed = sc.querySelector('#live-speed');
          const stageUpload = sc.querySelector('#stage-upload');
          const stageCloud = sc.querySelector('#stage-cloud');
          const cancelBtn = sc.querySelector('#btn-cancel-upload');

          let currentXhr = null;
          let aborted = false;

          cancelBtn.onclick = () => {
            aborted = true;
            if (currentXhr) currentXhr.abort();
            sc.remove();
            toast('Upload cancelled', 'info');
          };

          const coverUrl = coverData || sc.querySelector('#f-cover')?.value.trim() || '';
          const cObj = (DATA.clients || []).find(x => x.id === clientId) || { name: 'General' };

          const reader = new FileReader();
          reader.onload = async () => {
            if (aborted) return;
            liveBytes.textContent = `0 MB of ${(file.size / (1024*1024)).toFixed(1)} MB transferred`;

            const tempReelId = 'r' + Date.now().toString(36);
            const blobUrl = URL.createObjectURL(file);
            const localReel = {
              id: tempReelId,
              c: clientId, y: year, m: month, b: branch, album,
              title, date, url: blobUrl, dur, coverUrl, hidden: false, status, views: 0, downloads: 0, sample: false,
              thumbnailGenerated: true
            };
            if (!DATA.reels) DATA.reels = [];
            DATA.reels.unshift(localReel);
            saveAndBroadcast(''); // immediate local registration

            try {
              const startTime = Date.now();
              const res = await gasApiWithProgress('uploadVideo', {
                clientName: cObj.name, clientId: clientId, branch, album, title, year, month, date, dur,
                coverUrl, status, filename: file.name, mimeType: file.type || 'video/mp4', base64Data: reader.result
              }, (prog, xhr) => {
                currentXhr = xhr;
                if (aborted) return;
                liveBar.style.width = prog.percent + '%';
                livePct.textContent = prog.percent + '%';
                const loadedMB = (prog.loaded / (1024*1024)).toFixed(1);
                const totalMB = (prog.total / (1024*1024)).toFixed(1);
                liveBytes.textContent = `${loadedMB} MB of ${totalMB} MB transferred`;

                const elapsedSec = (Date.now() - startTime) / 1000;
                if (elapsedSec > 0.4) {
                  const speed = (prog.loaded / (1024*1024) / elapsedSec).toFixed(1);
                  const remBytes = prog.total - prog.loaded;
                  const remSec = Math.max(1, Math.round(remBytes / (prog.loaded / elapsedSec)));
                  liveSpeed.textContent = `${speed} MB/s · ${remSec}s remaining`;
                }

                if (prog.percent >= 98) {
                  stageUpload.className = 'live-stage-item done';
                  sc.querySelector('#stage-upload-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                  stageCloud.className = 'live-stage-item active';
                  sc.querySelector('#stage-cloud-icon').textContent = '→';
                  liveSpeed.textContent = 'Finalizing Google Drive storage...';
                }
              });

              if (aborted) return;

              liveBar.style.width = '100%';
              livePct.textContent = '100%';
              stageCloud.className = 'live-stage-item done';
              sc.querySelector('#stage-cloud-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
              liveSpeed.textContent = 'Published successfully!';

              if (res && res.success && res.reel) {
                const idx = DATA.reels.findIndex(x => x.id === tempReelId);
                if (idx !== -1) DATA.reels[idx] = res.reel;
                else DATA.reels.unshift(res.reel);
                saveAndBroadcast('Video & thumbnail published to Google Drive!');
              } else {
                saveAndBroadcast('Video & thumbnail stored locally!');
                toast('Stored locally: ' + ((res && res.error) || 'Drive offline'), 'info');
              }

              setTimeout(() => sc.remove(), 700);
            } catch(err) {
              if (aborted) return;
              saveAndBroadcast('Video & thumbnail saved locally');
              toast('Stored locally (Drive sync: ' + err.message + ')', 'amber');
              setTimeout(() => sc.remove(), 700);
            }
          };
          reader.readAsDataURL(file);
```

**New Code (`admin.html`):**

```javascript
          // --- MODE 2: DIRECT HIGH-CAPACITY RESUMABLE UPLOAD (Supports 700MB - 5GB+) ---
          const file = activeVideoFile || sc.querySelector('#f-file').files[0];
          if (!file) { toast('Please select an MP4 video file to upload', 'error'); return; }

          const coverUrl = coverData || sc.querySelector('#f-cover')?.value.trim() || '';
          const cObj = (DATA.clients || []).find(x => x.id === clientId) || { name: 'General' };

          // Render Live Upload Progress UI in modal
          const modalBody = sc.querySelector('.modal-window') || sc;
          modalBody.innerHTML = `
            <div class="live-upload-box">
              <div class="live-upload-header">
                <div class="live-upload-title">
                  <span class="sync-icon" style="color:var(--blue);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-3.95 11z"/></svg></span>
                  <span>Direct Master Stream to Google Drive</span>
                </div>
                <div class="live-upload-pct" id="live-pct">0%</div>
              </div>

              <div class="live-prog-track">
                <div class="live-prog-bar" id="live-bar"></div>
              </div>

              <div class="live-upload-stats">
                <span id="live-bytes">Initializing Google Drive session (${(file.size / (1024*1024)).toFixed(1)} MB)...</span>
                <span id="live-speed">Connecting...</span>
              </div>

              <div class="live-upload-stages">
                <div class="live-stage-item done" id="stage-thumb">
                  <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span>High-definition video thumbnail generated</span>
                </div>
                <div class="live-stage-item active" id="stage-upload">
                  <span id="stage-upload-icon">→</span><span id="stage-upload-text">Streaming raw binary directly to Google Drive...</span>
                </div>
                <div class="live-stage-item" id="stage-cloud">
                  <span id="stage-cloud-icon">○</span><span>Confirming Google Drive file ID &amp; permissions</span>
                </div>
              </div>

              <div style="display:flex;justify-content:flex-end;margin-top:14px;">
                <button class="btn-portal" id="btn-cancel-upload" style="font-size:11px;padding:4px 10px;">Cancel Upload</button>
              </div>
            </div>`;

          const liveBar = sc.querySelector('#live-bar');
          const livePct = sc.querySelector('#live-pct');
          const liveBytes = sc.querySelector('#live-bytes');
          const liveSpeed = sc.querySelector('#live-speed');
          const stageUpload = sc.querySelector('#stage-upload');
          const stageCloud = sc.querySelector('#stage-cloud');
          const cancelBtn = sc.querySelector('#btn-cancel-upload');

          let currentXhr = null;
          let aborted = false;

          cancelBtn.onclick = () => {
            aborted = true;
            if (currentXhr) currentXhr.abort();
            sc.remove();
            toast('Upload cancelled', 'info');
          };

          (async () => {
            try {
              // 1. Request Resumable Upload URL from GAS
              const initRes = await api('initVideoUpload', {
                clientName: cObj.name,
                branch,
                album,
                filename: file.name,
                mimeType: file.type || 'video/mp4',
                fileSize: file.size,
                origin: window.location.origin
              });

              if (!initRes || !initRes.success || !initRes.uploadUrl) {
                throw new Error((initRes && initRes.error) || 'Could not initialize resumable Drive session');
              }

              if (aborted) return;

              // 2. Stream raw binary File directly to Google Drive (Zero Base64 / Zero RAM limit)
              const startTime = Date.now();
              const driveFileJson = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                currentXhr = xhr;
                xhr.open('PUT', initRes.uploadUrl, true);
                xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

                xhr.upload.onprogress = e => {
                  if (aborted || !e.lengthComputable) return;
                  const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
                  liveBar.style.width = pct + '%';
                  livePct.textContent = pct + '%';

                  const loadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
                  const totalMB = (e.total / (1024 * 1024)).toFixed(1);
                  liveBytes.textContent = `${loadedMB} MB of ${totalMB} MB transferred`;

                  const elapsedSec = (Date.now() - startTime) / 1000;
                  if (elapsedSec > 0.5 && e.loaded > 0) {
                    const speed = (e.loaded / (1024 * 1024) / elapsedSec).toFixed(1);
                    const remBytes = e.total - e.loaded;
                    const remSec = Math.max(1, Math.round(remBytes / (e.loaded / elapsedSec)));
                    const remMin = remSec >= 60 ? `${Math.floor(remSec / 60)}m ${remSec % 60}s` : `${remSec}s`;
                    liveSpeed.textContent = `${speed} MB/s · ${remMin} remaining`;
                  }
                };

                xhr.onload = () => {
                  if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                      resolve(JSON.parse(xhr.responseText));
                    } catch (err) {
                      reject(new Error('Invalid response from Google Drive upload'));
                    }
                  } else {
                    reject(new Error(`Google Drive upload returned HTTP ${xhr.status}`));
                  }
                };

                xhr.onerror = () => reject(new Error('Network error during direct Google Drive stream'));
                xhr.onabort = () => reject(new Error('Upload cancelled'));
                xhr.send(file);
              });

              if (aborted) return;

              // 3. Finalize permissions & save metadata via GAS
              stageUpload.className = 'live-stage-item done';
              sc.querySelector('#stage-upload-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
              stageCloud.className = 'live-stage-item active';
              sc.querySelector('#stage-cloud-icon').textContent = '→';
              liveSpeed.textContent = 'Finalizing Google Drive permissions...';

              const reelId = 'r' + Date.now().toString(36);
              const fileId = driveFileJson.id;
              const finalCover = coverUrl || `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;

              const finRes = await api('finalizeVideoUpload', {
                id: reelId,
                fileId,
                clientId,
                clientName: cObj.name,
                branch,
                album,
                title,
                year,
                month,
                date,
                dur,
                coverUrl: finalCover,
                status
              });

              const publishedReel = (finRes && finRes.reel) || {
                id: reelId,
                c: clientId,
                type: 'reel',
                y: year,
                m: month,
                b: branch,
                album,
                title,
                date,
                url: `https://drive.google.com/file/d/${fileId}/view`,
                fileId,
                dur,
                coverUrl: finalCover,
                hidden: false,
                status,
                views: 0,
                downloads: 0,
                sample: false,
                thumbnailGenerated: true
              };

              liveBar.style.width = '100%';
              livePct.textContent = '100%';
              stageCloud.className = 'live-stage-item done';
              sc.querySelector('#stage-cloud-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
              liveSpeed.textContent = 'Published successfully!';

              if (!DATA.reels) DATA.reels = [];
              DATA.reels.unshift(publishedReel);
              saveAndBroadcast('Video published to Google Drive!');
              setTimeout(() => sc.remove(), 600);
            } catch (err) {
              if (aborted) return;
              toast('Upload failed: ' + (err.message || 'Check GAS deployment'), 'error');
              setTimeout(() => sc.remove(), 1200);
            }
          })();
```

---

## STEP 3: Replace the 25 MB Limit in `index.html` & `day-night-client-portal.html`

In `index.html` (and `day-night-client-portal.html`), inside `openAdd()`, replace the `else` block that enforces `MAX_DIRECT_BYTES = 25 * 1024 * 1024` with the same direct binary stream logic:

**Old Code (`index.html` & `day-night-client-portal.html`):**

```javascript
            const file = activeVideoFile || sc.querySelector('#f-file').files[0];
            if (!file) { toast('Please choose an MP4 video file', 'amber'); return; }

            const MAX_DIRECT_BYTES = 25 * 1024 * 1024; // 25 MB max to prevent Chrome memory crash & GAS timeout
            if (file.size > MAX_DIRECT_BYTES) {
              const mb = (file.size / (1024 * 1024)).toFixed(1);
              confirmModal(
                `Large Production Video (${mb} MB)`,
                `Direct browser upload is optimized for reels up to 25 MB.<br><br>` +
                `<b>Your high-definition thumbnail is already captured!</b> For master video files (${mb} MB):<br><br>` +
                `1. Drop the file directly into Google Drive.<br>` +
                `2. Paste the file link into <b>Video Link</b> below to publish instantly without waiting for upload.`,
                () => {
                  tabLink.click();
                  window.open('https://drive.google.com', '_blank');
                },
                'Open Google Drive',
                false,
                'Paste Link Instead'
              );
              return;
            }

            const sheetEl = sc.querySelector('.sheet') || sc;
            sheetEl.innerHTML = `
              <div class="live-upload-box">
                <div class="live-upload-header">
                  <div class="live-upload-title">
                    <span class="sync-icon" style="color:var(--blue);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-3.95 11z"/></svg></span>
                    <span>Live Video Upload to Google Drive</span>
                  </div>
                  <div class="live-upload-pct" id="live-pct">0%</div>
                </div>

                <div class="live-prog-track">
                  <div class="live-prog-bar" id="live-bar"></div>
                </div>

                <div class="live-upload-stats">
                  <span id="live-bytes">Reading video file from disk...</span>
                  <span id="live-speed">Calculating socket speed...</span>
                </div>

                <div class="live-upload-stages">
                  <div class="live-stage-item done" id="stage-thumb">
                    <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span>High-definition video thumbnail generated</span>
                  </div>
                  <div class="live-stage-item active" id="stage-upload">
                    <span id="stage-upload-icon">→</span><span id="stage-upload-text">Streaming video payload to Google Drive...</span>
                  </div>
                  <div class="live-stage-item" id="stage-cloud">
                    <span id="stage-cloud-icon">○</span><span>Google Drive permissions &amp; edge replication</span>
                  </div>
                </div>

                <div style="display:flex;justify-content:flex-end;margin-top:6px;">
                  <button type="button" class="ghost" id="btn-cancel-upload" style="color:var(--red);">Cancel Upload</button>
                </div>
              </div>`;

            const liveBar = sc.querySelector('#live-bar');
            const livePct = sc.querySelector('#live-pct');
            const liveBytes = sc.querySelector('#live-bytes');
            const liveSpeed = sc.querySelector('#live-speed');
            const stageUpload = sc.querySelector('#stage-upload');
            const stageCloud = sc.querySelector('#stage-cloud');

            let aborted = false;
            let currentXhr = null;

            sc.querySelector('#btn-cancel-upload').onclick = () => {
              aborted = true;
              if (currentXhr) currentXhr.abort();
              sc.remove();
              toast('Upload cancelled by user', 'info');
            };

            const reader = new FileReader();
            reader.onload = async () => {
              if (aborted) return;
              liveBytes.textContent = `0 MB of ${(file.size / (1024*1024)).toFixed(1)} MB transferred`;

              const tempReelId = 'r' + Date.now().toString(36);
              const blobUrl = URL.createObjectURL(file);
              const localReel = {
                id: tempReelId,
                c: c.id, y: year, m: month, b: branch, album,
                title, date, url: blobUrl, dur, coverUrl, hidden: false, status, views: 0, downloads: 0, sample: false,
                thumbnailGenerated: true
              };
              if (!DATA.reels) DATA.reels = [];
              DATA.reels.unshift(localReel);
              persist(''); // immediate local registration

              try {
                const startTime = Date.now();
                const res = await gasApiWithProgress('uploadVideo', {
                  clientName: c.name, clientId: c.id, branch, album, title, year, month, date, dur,
                  coverUrl, status, filename: file.name, mimeType: file.type || 'video/mp4', base64Data: reader.result
                }, (prog, xhr) => {
                  currentXhr = xhr;
                  if (aborted) return;
                  liveBar.style.width = prog.percent + '%';
                  livePct.textContent = prog.percent + '%';
                  const loadedMB = (prog.loaded / (1024*1024)).toFixed(1);
                  const totalMB = (prog.total / (1024*1024)).toFixed(1);
                  liveBytes.textContent = `${loadedMB} MB of ${totalMB} MB transferred`;

                  const elapsedSec = (Date.now() - startTime) / 1000;
                  if (elapsedSec > 0.4) {
                    const speed = (prog.loaded / (1024*1024) / elapsedSec).toFixed(1);
                    const remBytes = prog.total - prog.loaded;
                    const remSec = Math.max(1, Math.round(remBytes / (prog.loaded / elapsedSec)));
                    liveSpeed.textContent = `${speed} MB/s · ${remSec}s remaining`;
                  }

                  if (prog.percent >= 98) {
                    stageUpload.className = 'live-stage-item done';
                    sc.querySelector('#stage-upload-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                    stageCloud.className = 'live-stage-item active';
                    sc.querySelector('#stage-cloud-icon').textContent = '→';
                    liveSpeed.textContent = 'Finalizing Google Drive storage...';
                  }
                });

                if (aborted) return;

                liveBar.style.width = '100%';
                livePct.textContent = '100%';
                stageCloud.className = 'live-stage-item done';
                sc.querySelector('#stage-cloud-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                liveSpeed.textContent = 'Published successfully!';

                if (res && res.success && res.reel) {
                  const idx = DATA.reels.findIndex(x => x.id === tempReelId);
                  if (idx !== -1) DATA.reels[idx] = res.reel;
                  else DATA.reels.unshift(res.reel);
                  persist('Video & thumbnail published to Google Drive!');
                } else {
                  persist('Video & thumbnail stored locally!');
                  toast('Stored locally: ' + ((res && res.error) || 'Drive offline'), 'info');
                }

                setTimeout(() => sc.remove(), 700);
              } catch(err) {
                if (aborted) return;
                persist('Video & thumbnail saved locally');
                toast('Stored locally (Drive sync: ' + err.message + ')', 'amber');
                setTimeout(() => sc.remove(), 700);
              }
            };
            reader.readAsDataURL(file);
```

**New Code (`index.html` & `day-night-client-portal.html`):**

```javascript
            const file = activeVideoFile || sc.querySelector('#f-file').files[0];
            if (!file) { toast('Please choose an MP4 video file', 'amber'); return; }

            const sheetEl = sc.querySelector('.sheet') || sc;
            sheetEl.innerHTML = `
              <div class="live-upload-box">
                <div class="live-upload-header">
                  <div class="live-upload-title">
                    <span class="sync-icon" style="color:var(--blue);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-3.95 11z"/></svg></span>
                    <span>Direct Master Stream to Google Drive</span>
                  </div>
                  <div class="live-upload-pct" id="live-pct">0%</div>
                </div>

                <div class="live-prog-track">
                  <div class="live-prog-bar" id="live-bar"></div>
                </div>

                <div class="live-upload-stats">
                  <span id="live-bytes">Initializing Google Drive session (${(file.size / (1024*1024)).toFixed(1)} MB)...</span>
                  <span id="live-speed">Connecting...</span>
                </div>

                <div class="live-upload-stages">
                  <div class="live-stage-item done" id="stage-thumb">
                    <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span>High-definition video thumbnail generated</span>
                  </div>
                  <div class="live-stage-item active" id="stage-upload">
                    <span id="stage-upload-icon">→</span><span id="stage-upload-text">Streaming raw binary directly to Google Drive...</span>
                  </div>
                  <div class="live-stage-item" id="stage-cloud">
                    <span id="stage-cloud-icon">○</span><span>Google Drive permissions &amp; edge replication</span>
                  </div>
                </div>

                <div style="display:flex;justify-content:flex-end;margin-top:6px;">
                  <button type="button" class="ghost" id="btn-cancel-upload" style="color:var(--red);">Cancel Upload</button>
                </div>
              </div>`;

            const liveBar = sc.querySelector('#live-bar');
            const livePct = sc.querySelector('#live-pct');
            const liveBytes = sc.querySelector('#live-bytes');
            const liveSpeed = sc.querySelector('#live-speed');
            const stageUpload = sc.querySelector('#stage-upload');
            const stageCloud = sc.querySelector('#stage-cloud');

            let aborted = false;
            let currentXhr = null;

            sc.querySelector('#btn-cancel-upload').onclick = () => {
              aborted = true;
              if (currentXhr) currentXhr.abort();
              sc.remove();
              toast('Upload cancelled by user', 'info');
            };

            (async () => {
              try {
                // 1. Request Resumable Upload Session URL from GAS
                const initRes = await gasApi('initVideoUpload', {
                  clientName: c.name,
                  branch,
                  album,
                  filename: file.name,
                  mimeType: file.type || 'video/mp4',
                  fileSize: file.size,
                  origin: window.location.origin
                });

                if (!initRes || !initRes.success || !initRes.uploadUrl) {
                  throw new Error((initRes && initRes.error) || 'Could not initialize resumable Drive session');
                }

                if (aborted) return;

                // 2. Stream raw binary File directly to Google Drive
                const startTime = Date.now();
                const driveFileJson = await new Promise((resolve, reject) => {
                  const xhr = new XMLHttpRequest();
                  currentXhr = xhr;
                  xhr.open('PUT', initRes.uploadUrl, true);
                  xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

                  xhr.upload.onprogress = e => {
                    if (aborted || !e.lengthComputable) return;
                    const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
                    liveBar.style.width = pct + '%';
                    livePct.textContent = pct + '%';

                    const loadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
                    const totalMB = (e.total / (1024 * 1024)).toFixed(1);
                    liveBytes.textContent = `${loadedMB} MB of ${totalMB} MB transferred`;

                    const elapsedSec = (Date.now() - startTime) / 1000;
                    if (elapsedSec > 0.5 && e.loaded > 0) {
                      const speed = (e.loaded / (1024 * 1024) / elapsedSec).toFixed(1);
                      const remBytes = e.total - e.loaded;
                      const remSec = Math.max(1, Math.round(remBytes / (e.loaded / elapsedSec)));
                      const remMin = remSec >= 60 ? `${Math.floor(remSec / 60)}m ${remSec % 60}s` : `${remSec}s`;
                      liveSpeed.textContent = `${speed} MB/s · ${remMin} remaining`;
                    }
                  };

                  xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                      try {
                        resolve(JSON.parse(xhr.responseText));
                      } catch (err) {
                        reject(new Error('Invalid response from Google Drive upload'));
                      }
                    } else {
                      reject(new Error(`Google Drive upload returned HTTP ${xhr.status}`));
                    }
                  };

                  xhr.onerror = () => reject(new Error('Network error during direct Google Drive stream'));
                  xhr.onabort = () => reject(new Error('Upload cancelled'));
                  xhr.send(file);
                });

                if (aborted) return;

                // 3. Finalize permissions & save metadata via GAS
                stageUpload.className = 'live-stage-item done';
                sc.querySelector('#stage-upload-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                stageCloud.className = 'live-stage-item active';
                sc.querySelector('#stage-cloud-icon').textContent = '→';
                liveSpeed.textContent = 'Finalizing Google Drive permissions...';

                const reelId = 'r' + Date.now().toString(36);
                const fileId = driveFileJson.id;
                const finalCover = coverUrl || `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;

                const finRes = await gasApi('finalizeVideoUpload', {
                  id: reelId,
                  fileId,
                  clientId: c.id,
                  clientName: c.name,
                  branch,
                  album,
                  title,
                  year,
                  month,
                  date,
                  dur,
                  coverUrl: finalCover,
                  status
                });

                const publishedReel = (finRes && finRes.reel) || {
                  id: reelId,
                  c: c.id,
                  type: 'reel',
                  y: year,
                  m: month,
                  b: branch,
                  album,
                  title,
                  date,
                  url: `https://drive.google.com/file/d/${fileId}/view`,
                  fileId,
                  dur,
                  coverUrl: finalCover,
                  hidden: false,
                  status,
                  views: 0,
                  downloads: 0,
                  sample: false,
                  thumbnailGenerated: true
                };

                liveBar.style.width = '100%';
                livePct.textContent = '100%';
                stageCloud.className = 'live-stage-item done';
                sc.querySelector('#stage-cloud-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                liveSpeed.textContent = 'Published successfully!';

                if (!DATA.reels) DATA.reels = [];
                DATA.reels.unshift(publishedReel);
                persist('Video published to Google Drive!');
                setTimeout(() => sc.remove(), 600);
              } catch (err) {
                if (aborted) return;
                toast('Upload failed: ' + (err.message || 'Check GAS deployment'), 'error');
                setTimeout(() => sc.remove(), 1200);
              }
            })();
```