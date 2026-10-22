/**
 * ============================================================================
 * DAY NIGHT MEDIA - PRODUCTION ENGINE BACKEND (GOOGLE APPS SCRIPT)
 * ============================================================================
 * Handles Google Drive Folders, Files (Upload/Delete/Move/Rename/Hide/Modify),
 * Client URLs, Custom Animations, and Real-Time DB Synchronization.
 * ============================================================================
 */

const MASTER_FOLDER_NAME = "Day Night Media Portal";
const DATA_FILE_NAME = "portal-data.json";
const ADMIN_PASSKEY = "DN@2026";

function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const action = params.action || "ping";

    // 1. Ping Health Check
    if (action === "ping") {
      const folder = getOrCreateMasterFolder();
      return jsonResponse({
        success: true,
        status: "connected",
        message: "Day Night Media Engine Online",
        folderName: folder.getName(),
        folderId: folder.getId(),
        timestamp: new Date().toISOString()
      });
    }

    // 2. Fetch specific client by slug or 4-digit code
    if (action === "getClientData") {
      const code = String(params.code || "").trim();
      const slug = String(params.slug || params.client || "").trim().toLowerCase();
      const data = loadData();

      const client = (data.clients || []).find(c => {
        if (slug && c.slug && c.slug.toLowerCase() === slug) return true;
        if (code && c.code === code) return true;
        return false;
      });

      if (!client) {
        return jsonResponse({ success: false, error: "Client not found" }, 404);
      }

      // Filter reels for this client (filter out hidden reels unless admin token provided)
      const isAdmin = String(params.passkey || "") === ADMIN_PASSKEY;
      const clientReels = (data.reels || []).filter(r => {
        if (r.c !== client.id) return false;
        if (!isAdmin && r.hidden === true) return false;
        return true;
      });

      return jsonResponse({
        success: true,
        settings: data.settings,
        client: client,
        reels: clientReels
      });
    }

    // 3. Full Database Export
    if (action === "getData") {
      const data = loadData();
      return jsonResponse({ success: true, data: data });
    }

    return jsonResponse({ success: false, error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() }, 500);
  }
}

function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (ex) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action || "ping";

    // 1. Ping
    if (action === "ping") {
      return jsonResponse({
        success: true,
        status: "connected",
        timestamp: new Date().toISOString()
      });
    }

    // 1B. Direct High-Capacity Resumable Video Upload Session Init (Supports 700MB - 5GB+)
    if (action === "initVideoUpload") {
      return jsonResponse(initVideoUpload(payload));
    }
    // 1C. Direct High-Capacity Resumable Video Upload Finalization
    if (action === "finalizeVideoUpload") {
      return jsonResponse(finalizeVideoUpload(payload));
    }

    // 2. Upload Video to Google Drive & Create Reel
    if (action === "uploadVideo") {
      const clientName = payload.clientName || "General";
      const branch = payload.branch || "";
      const album = payload.album || "";
      const title = payload.title || "Untitled Reel";
      const clientId = payload.clientId;
      const date = payload.date || new Date().toISOString().slice(0, 10);
      const year = (payload.year !== undefined && payload.year !== null && payload.year !== "") ? Number(payload.year) : Number(date.slice(0, 4));
      const month = (payload.month !== undefined && payload.month !== null && payload.month !== "") ? Number(payload.month) : (Number(date.slice(5, 7)) - 1);
      const dur = payload.dur || "0:30";
      const coverUrl = payload.coverUrl || "";
      const base64Data = payload.base64Data;
      const mimeType = payload.mimeType || "video/mp4";
      const filename = payload.filename || (title.replace(/[^a-z0-9]/gi, "_") + ".mp4");

      if (!base64Data) {
        return jsonResponse({ success: false, error: "No video file provided" }, 400);
      }

      const clientFolder = getClientFolder(clientName, branch);
      const cleanBase64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
      const blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), mimeType, filename);
      const file = clientFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      const fileId = file.getId();
      const viewUrl = "https://drive.google.com/file/d/" + fileId + "/view";
      const previewUrl = "https://drive.google.com/file/d/" + fileId + "/preview";
      const downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;

      // Specifically store video thumbnail file in Google Drive if base64 DataURL provided
      let finalCoverUrl = coverUrl;
      if (coverUrl && coverUrl.startsWith("data:image/")) {
        try {
          const thumbClean = coverUrl.includes(",") ? coverUrl.split(",")[1] : coverUrl;
          const thumbBlob = Utilities.newBlob(Utilities.base64Decode(thumbClean), "image/jpeg", filename.replace(/\.[^.]+$/, "") + "_thumb.jpg");
          const thumbFile = clientFolder.createFile(thumbBlob);
          thumbFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          finalCoverUrl = "https://drive.google.com/uc?export=view&id=" + thumbFile.getId();
        } catch(ex) {
          finalCoverUrl = coverUrl;
        }
      }

      const data = loadData();
      const newReel = {
        id: "r" + Date.now().toString(36),
        c: clientId,
        y: year,
        m: month,
        b: branch,
        album: album,
        title: title,
        date: date,
        url: viewUrl,
        fileId: fileId,
        dur: dur,
        coverUrl: finalCoverUrl,
        hidden: false,
        status: payload.status || "approved", // 'draft' | 'review' | 'approved'
        views: 0,
        downloads: 0,
        sample: false
      };

      if (!data.reels) data.reels = [];
      data.reels.push(newReel);
      saveData(data);

      return jsonResponse({
        success: true,
        message: "Video uploaded and reel published",
        reel: newReel,
        fileId: fileId,
        viewUrl: viewUrl,
        previewUrl: previewUrl,
        downloadUrl: downloadUrl
      });
    }

    // 3. Add Reel (via Link)
    if (action === "addReel") {
      const reel = payload.reel;
      if (!reel || !reel.title || !reel.url) {
        return jsonResponse({ success: false, error: "Incomplete reel data" }, 400);
      }
      const data = loadData();
      if (!data.reels) data.reels = [];
      if (!reel.id) reel.id = "r" + Date.now().toString(36);
      if (typeof reel.hidden === "undefined") reel.hidden = false;
      if (!reel.views) reel.views = 0;
      if (!reel.downloads) reel.downloads = 0;
      data.reels.push(reel);
      saveData(data);
      return jsonResponse({ success: true, reel: reel, message: "Reel saved" });
    }

    // 4. Modify / Edit Reel (Rename, Date, Branch, Album, Cover, Duration, Status)
    if (action === "modifyReel") {
      const reelUpdate = payload.reel;
      if (!reelUpdate || !reelUpdate.id) {
        return jsonResponse({ success: false, error: "Missing reel ID" }, 400);
      }
      const data = loadData();
      const idx = (data.reels || []).findIndex(r => r.id === reelUpdate.id);
      if (idx === -1) {
        return jsonResponse({ success: false, error: "Reel not found" }, 404);
      }

      // If fileId exists and title changed, rename file in Google Drive as well
      if (data.reels[idx].fileId && reelUpdate.title && reelUpdate.title !== data.reels[idx].title) {
        try {
          const file = DriveApp.getFileById(data.reels[idx].fileId);
          file.setName(reelUpdate.title.replace(/[^a-z0-9]/gi, "_") + ".mp4");
        } catch (ex) {
          // File rename failed silently
        }
      }

      data.reels[idx] = Object.assign({}, data.reels[idx], reelUpdate);
      saveData(data);
      return jsonResponse({ success: true, reel: data.reels[idx], message: "Reel updated" });
    }

    // 5. Delete Reel (and Drive file if fileId exists)
    if (action === "deleteReel") {
      const reelId = payload.id;
      const data = loadData();
      const reel = (data.reels || []).find(r => r.id === reelId);
      if (reel && reel.fileId) {
        try {
          const file = DriveApp.getFileById(reel.fileId);
          file.setTrashed(true);
        } catch (ex) {}
      }
      data.reels = (data.reels || []).filter(r => r.id !== reelId);
      saveData(data);
      return jsonResponse({ success: true, message: "Reel removed" });
    }

    // 6. Toggle Hide / Unhide Reel
    if (action === "toggleHideReel") {
      const reelId = payload.id;
      const data = loadData();
      const reel = (data.reels || []).find(r => r.id === reelId);
      if (reel) {
        reel.hidden = !reel.hidden;
        saveData(data);
        return jsonResponse({ success: true, hidden: reel.hidden, message: reel.hidden ? "Reel hidden from client" : "Reel visible to client" });
      }
      return jsonResponse({ success: false, error: "Reel not found" }, 404);
    }

    // 6B. Update Reel Approval Status
    if (action === "updateReelStatus") {
      const reelId = payload.id || payload.reelId;
      const status = payload.status || "approved";
      const data = loadData();
      const reel = (data.reels || []).find(r => r.id === reelId);
      if (reel) {
        reel.status = status;
        saveData(data);
        return jsonResponse({ success: true, status: reel.status, message: "Status updated to " + status });
      }
      return jsonResponse({ success: false, error: "Reel not found" }, 404);
    }

    // 7. Track Engagement (View / Download)
    if (action === "trackEvent") {
      const { reelId, type } = payload;
      const data = loadData();
      const reel = (data.reels || []).find(r => r.id === reelId);
      if (reel) {
        if (type === "view") reel.views = (reel.views || 0) + 1;
        if (type === "download") reel.downloads = (reel.downloads || 0) + 1;
        saveData(data);
        return jsonResponse({ success: true, views: reel.views, downloads: reel.downloads });
      }
      return jsonResponse({ success: false, error: "Reel not found" }, 404);
    }

    // 7B. Scan Drive Folder for Videos and return list with thumbnail URLs and publish status
    if (action === "scanDriveVideos") {
      const clientName = payload.clientName || "";
      const branch = payload.branch || "";
      const clientFolder = getClientFolder(clientName, branch);
      const files = clientFolder.getFiles();
      const videoList = [];
      const data = loadData();

      function processFile(file, folderName) {
        const mime = file.getMimeType();
        const name = file.getName();
        if (mime.startsWith("video/") || name.match(/\.(mp4|mov|webm|m4v|avi|mkv)$/i)) {
          try {
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          } catch(e) {}
          const fileId = file.getId();
          const viewUrl = "https://drive.google.com/file/d/" + fileId + "/view";
          const thumbUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000";
          const matchedReel = (data.reels || []).find(r => r.fileId === fileId || (r.url && r.url.includes(fileId)));

          videoList.push({
            fileId: fileId,
            name: name,
            title: name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
            folder: folderName || "",
            sizeBytes: file.getSize(),
            sizeMB: (file.getSize() / (1024 * 1024)).toFixed(1),
            dateCreated: file.getDateCreated().toISOString().slice(0, 10),
            viewUrl: viewUrl,
            thumbUrl: thumbUrl,
            isPublished: !!matchedReel,
            reelId: matchedReel ? matchedReel.id : null,
            hidden: matchedReel ? (matchedReel.hidden === true) : false
          });
        }
      }

      while (files.hasNext()) {
        processFile(files.next(), clientFolder.getName());
      }

      // Also scan subfolders (branches/albums)
      const subfolders = clientFolder.getFolders();
      while (subfolders.hasNext()) {
        const sub = subfolders.next();
        const subFiles = sub.getFiles();
        while (subFiles.hasNext()) {
          processFile(subFiles.next(), sub.getName());
        }
      }

      return jsonResponse({
        success: true,
        videos: videoList,
        folderName: clientFolder.getName(),
        folderId: clientFolder.getId()
      });
    }

    // 8. Create Drive Folder / Album
    if (action === "createFolder") {
      const { clientName, folderName } = payload;
      const master = getOrCreateMasterFolder();
      const reelsFolder = getSubfolder(master, "Reels");
      const clientFolder = getSubfolder(reelsFolder, clientName);
      const newFolder = clientFolder.createFolder(folderName);

      // Add album/folder to client record in DB
      const data = loadData();
      const client = (data.clients || []).find(c => c.name === clientName);
      if (client) {
        if (!client.albums) client.albums = [];
        if (!client.albums.includes(folderName)) client.albums.push(folderName);
        saveData(data);
      }

      return jsonResponse({
        success: true,
        folderId: newFolder.getId(),
        folderName: folderName,
        message: "Folder created in Google Drive"
      });
    }

    // 9. Rename Drive Folder / Album
    if (action === "renameFolder") {
      const { clientName, oldName, newName } = payload;
      const master = getOrCreateMasterFolder();
      const reelsFolder = getSubfolder(master, "Reels");
      const clientFolder = getSubfolder(reelsFolder, clientName);
      const iter = clientFolder.getFoldersByName(oldName);
      if (iter.hasNext()) {
        const folder = iter.next();
        folder.setName(newName);
      }

      const data = loadData();
      const client = (data.clients || []).find(c => c.name === clientName);
      if (client && client.albums) {
        const idx = client.albums.indexOf(oldName);
        if (idx !== -1) client.albums[idx] = newName;
      }
      // Update any reels referencing this album/branch
      (data.reels || []).forEach(r => {
        if (r.b === oldName) r.b = newName;
        if (r.album === oldName) r.album = newName;
      });
      saveData(data);
      return jsonResponse({ success: true, message: "Folder renamed" });
    }

    // 10. Save / Update Client
    if (action === "saveClient") {
      const client = payload.client;
      if (!client || !client.name || !client.code) {
        return jsonResponse({ success: false, error: "Incomplete client data" }, 400);
      }
      const data = loadData();
      if (!data.clients) data.clients = [];

      // Auto-assign slug if missing
      if (!client.slug) {
        client.slug = client.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      }
      if (!client.animStyle) {
        client.animStyle = "confetti"; // 'confetti' | 'pulse' | 'shimmer' | 'rings'
      }

      const idx = data.clients.findIndex(c => c.id === client.id);
      if (idx >= 0) {
        data.clients[idx] = Object.assign({}, data.clients[idx], client);
      } else {
        if (!client.id) client.id = "c" + Date.now().toString(36);
        data.clients.push(client);
      }
      saveData(data);
      return jsonResponse({ success: true, client: client, message: "Client saved" });
    }

    // 11. Delete Client
    if (action === "deleteClient") {
      const clientId = payload.id;
      const data = loadData();
      data.clients = (data.clients || []).filter(c => c.id !== clientId);
      data.reels = (data.reels || []).filter(r => r.c !== clientId);
      saveData(data);
      return jsonResponse({ success: true, message: "Client and reels deleted" });
    }

    // 12. Save Settings
    if (action === "saveSettings") {
      const data = loadData();
      data.settings = payload.settings;
      saveData(data);
      return jsonResponse({ success: true, settings: data.settings, message: "Settings saved" });
    }

    // 13. Sync Full Dataset
    if (action === "syncData") {
      if (payload.data) {
        saveData(payload.data);
        return jsonResponse({ success: true, message: "Database synchronized with Google Drive" });
      }
    }

    return jsonResponse({ success: false, error: "Invalid action" }, 400);
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() }, 500);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateMasterFolder() {
  const folders = DriveApp.getFoldersByName(MASTER_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(MASTER_FOLDER_NAME);
}

function getClientFolder(clientName, branch) {
  const master = getOrCreateMasterFolder();
  let reelsFolder = getSubfolder(master, "Reels");
  let clientFolder = getSubfolder(reelsFolder, clientName);
  if (!branch || branch === "Main") return clientFolder;
  return getSubfolder(clientFolder, branch);
}

function getSubfolder(parentFolder, name) {
  const iter = parentFolder.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(name);
}

function loadData() {
  const master = getOrCreateMasterFolder();
  const files = master.getFilesByName(DATA_FILE_NAME);
  if (files.hasNext()) {
    try {
      const content = files.next().getBlob().getDataAsString();
      return JSON.parse(content);
    } catch (e) {}
  }
  const defaultData = {
    settings: {
      agency: "Day Night Media",
      agencySub: "Production Company",
      slogan: "Creating impact that brands remember"
    },
    clients: [],
    reels: []
  };
  saveData(defaultData);
  return defaultData;
}

function saveData(dataObj) {
  const master = getOrCreateMasterFolder();
  const files = master.getFilesByName(DATA_FILE_NAME);
  const content = JSON.stringify(dataObj, null, 2);
  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    master.createFile(DATA_FILE_NAME, content, MimeType.PLAIN_TEXT);
  }
}

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

  var data = loadData();
  data.reels = data.reels || [];
  var existingIdx = data.reels.findIndex(function(r) { return r.id === newReel.id; });
  if (existingIdx !== -1) {
    data.reels[existingIdx] = newReel;
  } else {
    data.reels.unshift(newReel);
  }
  saveData(data);

  return {
    success: true,
    fileId: fileId,
    url: viewUrl,
    reel: newReel
  };
}
