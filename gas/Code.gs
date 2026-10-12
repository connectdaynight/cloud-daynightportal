/**
 * ============================================================================
 * DAY NIGHT MEDIA - CLIENT PORTAL GOOGLE APPS SCRIPT BACKEND
 * ============================================================================
 * 
 * This script runs as a Google Apps Script Web App providing:
 * 1. Real-time REST API for Cloudflare Pages (doGet & doPost)
 * 2. Automated Google Drive Folder & Video Storage management
 * 3. Client & Reel metadata storage in Google Drive (portal-data.json)
 * 4. Zero CORS issues (handles text/plain JSON payloads & redirects)
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open Google Drive -> New -> More -> Google Apps Script
 * 2. Paste this entire file into Code.gs
 * 3. Click "Deploy" -> "New deployment"
 * 4. Select type: "Web app"
 * 5. Configuration:
 *    - Description: "Day Night Portal Backend"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (allows Cloudflare Pages to call it)
 * 6. Click "Deploy", authorize permissions, and copy the Web App URL!
 * 7. Paste that URL into the Admin Panel of your Day Night Client Portal.
 * ============================================================================
 */

// Configuration Constants
const MASTER_FOLDER_NAME = "Day Night Media Portal";
const DATA_FILE_NAME = "portal-data.json";
const ADMIN_PASSKEY = "DN@2026"; // Change to your preferred admin secret

/**
 * Handle GET requests
 * Endpoints:
 * - ?action=ping                   -> Connection health check
 * - ?action=getData                -> Get entire portal data
 * - ?action=getClientData&code=... -> Get data for specific 4-digit client PIN
 */
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const action = params.action || "ping";

    if (action === "ping") {
      const folder = getOrCreateMasterFolder();
      return jsonResponse({
        success: true,
        status: "connected",
        message: "Day Night Media Google Drive Engine is online",
        folderName: folder.getName(),
        folderId: folder.getId(),
        timestamp: new Date().toISOString()
      });
    }

    if (action === "getClientData") {
      const code = String(params.code || "").trim();
      if (!code) {
        return jsonResponse({ success: false, error: "Missing client code" }, 400);
      }
      const data = loadData();
      const client = (data.clients || []).find(c => c.code === code);
      if (!client) {
        return jsonResponse({ success: false, error: "Invalid client code" }, 404);
      }
      // Return settings, this client only, and their specific reels
      const clientReels = (data.reels || []).filter(r => r.c === client.id);
      return jsonResponse({
        success: true,
        settings: data.settings,
        client: client,
        reels: clientReels
      });
    }

    if (action === "getData") {
      const data = loadData();
      return jsonResponse({ success: true, data: data });
    }

    return jsonResponse({ success: false, error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() }, 500);
  }
}

/**
 * Handle POST requests
 * Endpoints:
 * - ping
 * - uploadVideo   (uploads MP4 chunk to Google Drive and registers reel)
 * - addReel       (registers Google Drive link reel)
 * - deleteReel    (removes reel record)
 * - saveClient    (creates/updates client)
 * - deleteClient  (removes client)
 * - saveSettings  (updates agency details)
 * - syncData      (overwrites complete dataset)
 */
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

    // 1. Connection Ping
    if (action === "ping") {
      const folder = getOrCreateMasterFolder();
      return jsonResponse({
        success: true,
        status: "connected",
        message: "Google Drive & Apps Script connected successfully",
        timestamp: new Date().toISOString()
      });
    }

    // 2. Upload Video directly to Google Drive
    if (action === "uploadVideo") {
      const clientName = payload.clientName || "General";
      const branch = payload.branch || "General";
      const title = payload.title || "Untitled Reel";
      const clientId = payload.clientId;
      const year = Number(payload.year) || new Date().getFullYear();
      const month = Number(payload.month) || new Date().getMonth();
      const date = payload.date || new Date().toISOString().slice(0, 10);
      const dur = payload.dur || "0:30";
      const base64Data = payload.base64Data;
      const mimeType = payload.mimeType || "video/mp4";
      const filename = payload.filename || (title.replace(/[^a-z0-9]/gi, "_") + ".mp4");

      if (!base64Data) {
        return jsonResponse({ success: false, error: "No video file data provided" }, 400);
      }

      // Find or create subfolder: Day Night Media Portal / Reels / {clientName} / {branch}
      const clientFolder = getClientFolder(clientName, branch);
      
      // Clean base64 header if present (data:video/mp4;base64,...)
      const cleanBase64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
      const decodedBytes = Utilities.base64Decode(cleanBase64);
      const blob = Utilities.newBlob(decodedBytes, mimeType, filename);
      
      const file = clientFolder.createFile(blob);
      // Make video viewable to anyone with link
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      const fileId = file.getId();
      const viewUrl = "https://drive.google.com/file/d/" + fileId + "/view";
      const previewUrl = "https://drive.google.com/file/d/" + fileId + "/preview";
      const downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;

      // Register new reel in database
      const data = loadData();
      const newReel = {
        id: "r" + Date.now().toString(36),
        c: clientId,
        y: year,
        m: month,
        b: branch,
        title: title,
        date: date,
        url: viewUrl,
        fileId: fileId,
        dur: dur,
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

    // 3. Add Reel (via link)
    if (action === "addReel") {
      const reel = payload.reel;
      if (!reel || !reel.title || !reel.url) {
        return jsonResponse({ success: false, error: "Incomplete reel data" }, 400);
      }
      const data = loadData();
      if (!data.reels) data.reels = [];
      if (!reel.id) reel.id = "r" + Date.now().toString(36);
      data.reels.push(reel);
      saveData(data);
      return jsonResponse({ success: true, reel: reel, message: "Reel saved" });
    }

    // 4. Delete Reel
    if (action === "deleteReel") {
      const reelId = payload.id;
      const data = loadData();
      data.reels = (data.reels || []).filter(r => r.id !== reelId);
      saveData(data);
      return jsonResponse({ success: true, message: "Reel removed" });
    }

    // 5. Save/Update Client
    if (action === "saveClient") {
      const client = payload.client;
      if (!client || !client.name || !client.code) {
        return jsonResponse({ success: false, error: "Incomplete client data" }, 400);
      }
      const data = loadData();
      if (!data.clients) data.clients = [];
      const idx = data.clients.findIndex(c => c.id === client.id);
      if (idx >= 0) {
        data.clients[idx] = client;
      } else {
        if (!client.id) client.id = "c" + Date.now().toString(36);
        data.clients.push(client);
      }
      saveData(data);
      return jsonResponse({ success: true, client: client, message: "Client saved" });
    }

    // 6. Delete Client
    if (action === "deleteClient") {
      const clientId = payload.id;
      const data = loadData();
      data.clients = (data.clients || []).filter(c => c.id !== clientId);
      data.reels = (data.reels || []).filter(r => r.c !== clientId);
      saveData(data);
      return jsonResponse({ success: true, message: "Client and reels deleted" });
    }

    // 7. Save Settings
    if (action === "saveSettings") {
      const settings = payload.settings;
      const data = loadData();
      data.settings = settings;
      saveData(data);
      return jsonResponse({ success: true, settings: settings, message: "Settings saved" });
    }

    // 8. Full Sync
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

/**
 * Helper to produce CORS-enabled JSON responses
 */
function jsonResponse(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Retrieve or create the master Day Night Media folder in Google Drive
 */
function getOrCreateMasterFolder() {
  const folders = DriveApp.getFoldersByName(MASTER_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(MASTER_FOLDER_NAME);
}

/**
 * Get or create structured subfolder: Master / Reels / Client / Branch
 */
function getClientFolder(clientName, branch) {
  const master = getOrCreateMasterFolder();
  let reelsFolder = getSubfolder(master, "Reels");
  let clientFolder = getSubfolder(reelsFolder, clientName);
  let branchFolder = getSubfolder(clientFolder, branch);
  return branchFolder;
}

function getSubfolder(parentFolder, name) {
  const iter = parentFolder.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(name);
}

/**
 * Load database JSON from Google Drive
 */
function loadData() {
  const master = getOrCreateMasterFolder();
  const files = master.getFilesByName(DATA_FILE_NAME);
  if (files.hasNext()) {
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    try {
      return JSON.parse(content);
    } catch (e) {
      // Fallback if corrupt
    }
  }
  
  // Default seed data if file doesn't exist yet
  const defaultData = {
    settings: {
      agency: "Day Night Media",
      agencySub: "Production Company",
      slogan: "Creating impact that brands remember"
    },
    clients: [
      {
        id: "tcs",
        name: "The Chennai Silks",
        code: "4821",
        tagline: "Let the celebrations begin!",
        accent: "celebrations",
        branches: ["T. Nagar", "Velachery", "Chromepet", "Thiruvallur"]
      }
    ],
    reels: []
  };

  saveData(defaultData);
  return defaultData;
}

/**
 * Save database JSON to Google Drive
 */
function saveData(dataObj) {
  const master = getOrCreateMasterFolder();
  const files = master.getFilesByName(DATA_FILE_NAME);
  const content = JSON.stringify(dataObj, null, 2);
  
  if (files.hasNext()) {
    const file = files.next();
    file.setContent(content);
  } else {
    master.createFile(DATA_FILE_NAME, content, MimeType.PLAIN_TEXT);
  }
}
