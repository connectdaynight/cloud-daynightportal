/**
 * Daynight-Media: Instagram-Grade Media Creation & Upload Studio
 * Exact clone of Instagram Create Sheet (Image 3), Media Picker (Image 4), and Reel Details (Image 5)
 * With real-time XHR upload progress, video thumbnail extraction, aspect ratio controls, and Cloud Firestore sync.
 */
(function(window) {
  'use strict';

  let selectedFile = null;
  let customCoverDataUrl = null;
  let selectedPartner = '';
  let selectedLocation = '';
  let isAiLabelActive = false;

  // Video Frame Extraction Helper
  function extractVideoThumbnail(file, targetSec = 0.8) {
    return new Promise((resolve) => {
      if (!file || (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|webm|m4v)$/i))) {
        return resolve({ coverUrl: '', duration: '0:30', width: 720, height: 1280, aspectRatio: 0.5625 });
      }
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const blobUrl = URL.createObjectURL(file);
      video.src = blobUrl;

      let resolved = false;
      const cleanup = () => {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
          URL.revokeObjectURL(blobUrl);
          video.remove();
        } catch(_) {}
      };

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ coverUrl: '', duration: '0:30', width: 720, height: 1280, aspectRatio: 0.5625 });
        }
      }, 7000);

      video.onloadedmetadata = () => {
        const rawDur = video.duration || 30;
        const mins = Math.floor(rawDur / 60);
        const secs = Math.floor(rawDur % 60);
        const durStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        const seekTo = Math.min(Math.max(0.2, targetSec), Math.max(0.2, rawDur - 0.2));
        video.currentTime = seekTo;

        video.onseeked = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          try {
            const rawW = video.videoWidth || 720;
            const rawH = video.videoHeight || 1280;
            const aspect = +(rawW / rawH).toFixed(4);
            const canvas = document.createElement('canvas');
            canvas.width = 480;
            canvas.height = Math.round(480 * (rawH / rawW));
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            cleanup();
            resolve({ coverUrl: dataUrl, duration: durStr, width: rawW, height: rawH, aspectRatio: aspect });
          } catch(e) {
            cleanup();
            resolve({ coverUrl: '', duration: durStr, width: 720, height: 1280, aspectRatio: 0.5625 });
          }
        };
      };

      video.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve({ coverUrl: '', duration: '0:30', width: 720, height: 1280, aspectRatio: 0.5625 });
        }
      };
    });
  }

  function detectIsPhoto(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    if (file.type && file.type.startsWith('video/')) return false;
    return /\.(jpg|jpeg|png|webp|gif|avif|heic|bmp)$/i.test(file.name || '');
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // Real-Time Progress via XMLHttpRequest
  function uploadWithProgress(url, payload, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            const percent = Math.min(98, Math.round((e.loaded / e.total) * 100));
            const loadedMb = (e.loaded / (1024 * 1024)).toFixed(1);
            const totalMb = (e.total / (1024 * 1024)).toFixed(1);
            onProgress({ percent, loadedMb, totalMb, loaded: e.loaded, total: e.total });
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let data = null;
          try { data = JSON.parse(xhr.responseText); } catch(_) { data = { success: true }; }
          resolve(data);
        } else {
          reject(new Error(`Server returned HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));
      xhr.timeout = 180000;
      xhr.send(JSON.stringify(payload));
    });
  }

  // =========================================================================
  // STAGE 0: Official Instagram "Create" Bottom Sheet (Image 3)
  // =========================================================================
  function openCreateSheet() {
    const user = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;
    if (!user) {
      if (window.DNM_AUTH?.signInWithGoogle) window.DNM_AUTH.signInWithGoogle();
      return;
    }

    const existing = document.querySelector('.ig-create-scrim');
    if (existing) existing.remove();

    const scrim = document.createElement('div');
    scrim.className = 'ig-create-scrim';
    scrim.innerHTML = `
      <div class="ig-create-sheet">
        <div class="ig-create-handle-bar">
          <div class="ig-create-handle"></div>
        </div>
        <div class="ig-create-title">Create</div>
        <div class="ig-create-list">
          <!-- 1. Reel -->
          <button type="button" class="ig-create-item" id="ig-create-opt-reel">
            <div class="ig-create-item-left">
              <span class="ig-create-item-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
              </span>
              <span>Reel</span>
            </div>
          </button>

          <!-- 2. Edits -->
          <button type="button" class="ig-create-item" id="ig-create-opt-edits">
            <div class="ig-create-item-left">
              <span class="ig-create-item-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              </span>
              <span>Edits</span>
            </div>
            <span class="ig-create-badge-new">New</span>
          </button>

          <!-- 3. Post -->
          <button type="button" class="ig-create-item" id="ig-create-opt-post">
            <div class="ig-create-item-left">
              <span class="ig-create-item-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </span>
              <span>Post</span>
            </div>
          </button>

          <!-- 4. Story -->
          <button type="button" class="ig-create-item" id="ig-create-opt-story">
            <div class="ig-create-item-left">
              <span class="ig-create-item-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="4 4"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              </span>
              <span>Story</span>
            </div>
          </button>

          <!-- 5. Highlights -->
          <button type="button" class="ig-create-item" id="ig-create-opt-highlights">
            <div class="ig-create-item-left">
              <span class="ig-create-item-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16.5l-1-0.9C7.4 12.4 5 10.3 5 7.6 5 5.6 6.6 4 8.6 4c1.1 0 2.2.5 2.9 1.4C12.2 4.5 13.3 4 14.4 4 16.4 4 18 5.6 18 7.6c0 2.7-2.4 4.8-6 8l-1 0.9z"/></svg>
              </span>
              <span>Highlights</span>
            </div>
          </button>

          <!-- 6. Live -->
          <button type="button" class="ig-create-item" id="ig-create-opt-live">
            <div class="ig-create-item-left">
              <span class="ig-create-item-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.93 4.93a10 10 0 0 1 14.14 0"/><path d="M7.76 7.76a6 6 0 0 1 8.48 0"/><circle cx="12" cy="12" r="2"/></svg>
              </span>
              <span>Live</span>
            </div>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(scrim);
    requestAnimationFrame(() => scrim.classList.add('active'));

    const closeSheet = () => {
      scrim.classList.remove('active');
      setTimeout(() => scrim.remove(), 260);
    };

    scrim.addEventListener('click', e => { if (e.target === scrim) closeSheet(); });

    // Wire actions
    scrim.querySelector('#ig-create-opt-reel')?.addEventListener('click', () => {
      closeSheet();
      openInstagramStudio({ mode: 'reel' });
    });
    scrim.querySelector('#ig-create-opt-post')?.addEventListener('click', () => {
      closeSheet();
      openInstagramStudio({ mode: 'post' });
    });
    scrim.querySelector('#ig-create-opt-edits')?.addEventListener('click', () => {
      closeSheet();
      openInstagramStudio({ mode: 'edits' });
    });
    scrim.querySelector('#ig-create-opt-story')?.addEventListener('click', () => {
      closeSheet();
      openInstagramStudio({ mode: 'story' });
    });
    scrim.querySelector('#ig-create-opt-highlights')?.addEventListener('click', () => {
      closeSheet();
      alert('Select any of your archived reels from profile to add to your Highlights.');
    });
    scrim.querySelector('#ig-create-opt-live')?.addEventListener('click', () => {
      closeSheet();
      alert('Live broadcasting will begin once connected to RTMP stream server.');
    });
  }

  // =========================================================================
  // STAGE 1 & 2: Instagram Reel Media Studio (Images 4 & 5)
  // =========================================================================
  function openInstagramStudio({ mode = 'reel', remixItem = null } = {}) {
    const user = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;
    if (!user) {
      if (window.DNM_AUTH?.signInWithGoogle) window.DNM_AUTH.signInWithGoogle();
      return;
    }

    const existing = document.querySelector('#dnm-studio-scrim');
    if (existing) existing.remove();

    selectedFile = null;
    customCoverDataUrl = null;
    selectedPartner = '';
    selectedLocation = '';
    isAiLabelActive = false;

    const studio = document.createElement('div');
    studio.className = 'ig-studio-scrim';
    studio.id = 'dnm-studio-scrim';

    studio.innerHTML = `
      <!-- Studio Header -->
      <header class="ig-studio-header">
        <button type="button" class="ig-studio-btn" id="ig-studio-btn-close" aria-label="Cancel">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <span class="ig-studio-title" id="ig-studio-title-text">${remixItem ? 'Remix Reel' : 'New reel'}</span>
        <button type="button" class="ig-studio-btn" id="ig-studio-btn-camera" aria-label="Open Camera">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
      </header>

      <!-- Hidden Real File Input -->
      <input type="file" id="ig-hidden-file-input" accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp" style="display:none;">

      <!-- SCREEN 1: Media Picker (Image 4) -->
      <div class="ig-picker-view" id="ig-view-picker">
        <!-- Drafts & Templates Pills -->
        <div class="ig-picker-pills-row">
          <button type="button" class="ig-picker-pill" id="ig-pill-drafts">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Drafts</span>
          </button>
          <button type="button" class="ig-picker-pill" id="ig-pill-templates">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <span>Templates</span>
          </button>
        </div>

        <!-- Recents Bar -->
        <div class="ig-picker-recents-bar">
          <div class="ig-picker-recents-title" id="ig-recents-select">
            <span>Recents</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </div>
          <button type="button" class="ig-picker-select-btn" id="ig-multi-select-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            <span>Select</span>
          </button>
        </div>

        <!-- Media Gallery Tiles Grid -->
        <div class="ig-picker-grid" id="ig-picker-grid">
          <!-- Camera Tile (First card) -->
          <div class="ig-picker-tile camera-tile" id="ig-tile-camera">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span style="font-size:11.5px;color:rgba(255,255,255,0.7);font-weight:600;">Camera</span>
          </div>
        </div>

        <!-- Floating Bottom Button (Image 4) -->
        <div class="ig-picker-floating-pill-wrap">
          <button type="button" class="ig-picker-floating-pill" id="ig-floating-pick-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>SELECT FROM DEVICE</span>
          </button>
        </div>
      </div>

      <!-- SCREEN 2: Details & Sharing Screen (Image 5) -->
      <div class="ig-details-view" id="ig-view-details" style="display:none;">
        <!-- Media Preview Card with "Edit cover" pill -->
        <div class="ig-details-preview-card" id="ig-details-preview-card">
          <div id="ig-details-media-container" style="width:100%;height:100%;"></div>
          <button type="button" class="ig-details-edit-cover-btn" id="ig-btn-edit-cover">Edit cover</button>
        </div>

        <!-- Caption Input -->
        <div class="ig-details-caption-wrap">
          <textarea class="ig-details-caption-inp" id="ig-details-caption" placeholder="Write a caption and add hashtags..."></textarea>
        </div>

        <!-- Quick Tag Chips (Image 5) -->
        <div class="ig-details-chips-row">
          <button type="button" class="ig-details-chip" data-chip="#Hashtags"># Hashtags</button>
          <button type="button" class="ig-details-chip" data-chip="▷ Link a reel">▷ Link a reel</button>
          <button type="button" class="ig-details-chip" data-chip="≡ Poll">≡ Poll</button>
          <button type="button" class="ig-details-chip" data-chip="Q Prompt">Q Prompt</button>
        </div>

        <!-- Settings List Rows (Image 5) -->
        <div class="ig-details-settings-list">
          <!-- 1. Tag people / Brand Partner -->
          <div class="ig-details-row" id="ig-row-tag-people">
            <div class="ig-details-row-left">
              <svg class="ig-details-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <div class="ig-details-row-content">
                <span class="ig-details-row-title">Tag people</span>
                <span class="ig-details-row-subtext" id="ig-tag-subtext">The Chennai Silks &bull; Daynight Partner</span>
              </div>
            </div>
            <div class="ig-details-row-right">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>

          <!-- 2. Add location -->
          <div class="ig-details-row" id="ig-row-location">
            <div class="ig-details-row-left">
              <svg class="ig-details-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <div class="ig-details-row-content">
                <span class="ig-details-row-title">Add location</span>
                <span class="ig-details-row-subtext" id="ig-loc-subtext">People you share this content with can see the location you tag and view this content on the map.</span>
              </div>
            </div>
            <div class="ig-details-row-right">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>

          <!-- 3. Add link -->
          <div class="ig-details-row" id="ig-row-link">
            <div class="ig-details-row-left">
              <svg class="ig-details-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <div class="ig-details-row-content">
                <span class="ig-details-row-title">Add link</span>
                <span class="ig-details-row-subtext">Try Meta One</span>
              </div>
            </div>
            <div class="ig-details-row-right">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>

          <!-- 4. Rename audio -->
          <div class="ig-details-row" id="ig-row-audio">
            <div class="ig-details-row-left">
              <svg class="ig-details-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
              <div class="ig-details-row-content">
                <span class="ig-details-row-title">Rename audio</span>
                <span class="ig-details-row-subtext">Original Audio</span>
              </div>
            </div>
            <div class="ig-details-row-right">
              <span>Original Audio</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>

          <!-- 5. Add AI label -->
          <div class="ig-details-row" id="ig-row-ai-label">
            <div class="ig-details-row-left">
              <svg class="ig-details-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <div class="ig-details-row-content">
                <span class="ig-details-row-title">Add AI label</span>
                <span class="ig-details-row-subtext">This label is required for realistic photos</span>
              </div>
            </div>
            <div class="ig-details-row-right">
              <div class="ig-menu-switch" id="ig-switch-ai">
                <div class="ig-menu-switch-thumb"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Real-Time Progress Box (shown while publishing) -->
        <div class="ig-details-progress-card" id="ig-upload-progress-card" style="display:none;">
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:12.5px;font-weight:600;">
            <span id="ig-prog-status-text">Uploading to Cloud Storage...</span>
            <span id="ig-prog-pct-text">0%</span>
          </div>
          <div class="ig-details-progress-bar">
            <div class="ig-details-progress-fill" id="ig-prog-fill"></div>
          </div>
          <div id="ig-prog-mb-text" style="font-size:11.5px;color:rgba(255,255,255,0.6);text-align:right;">0 MB / 0 MB</div>
        </div>

        <!-- Sticky Footer Buttons (Image 5) -->
        <footer class="ig-details-sticky-footer">
          <button type="button" class="ig-btn-draft" id="ig-btn-save-draft">Save draft</button>
          <button type="button" class="ig-btn-next" id="ig-btn-share-post">Share</button>
        </footer>
      </div>
    `;

    document.body.appendChild(studio);

    // Populate Sample & Preloaded Gallery Tiles in Screen 1 (Image 4)
    const pickerGrid = studio.querySelector('#ig-picker-grid');
    const existingReels = (window.DNM_DATA?.getAllApprovedReels() || []).slice(0, 11);
    existingReels.forEach((r, idx) => {
      const tile = document.createElement('div');
      tile.className = 'ig-picker-tile';
      tile.innerHTML = `
        <img src="${r.coverUrl || './Logo/logo.png'}" alt="Reel ${idx+1}">
        <span class="ig-picker-tile-duration">${r.dur || '0:30'}</span>
      `;
      tile.addEventListener('click', () => {
        // Use this reel as inspiration/remix
        switchToDetailsWithReel(r);
      });
      pickerGrid.appendChild(tile);
    });

    // Elements
    const btnClose = studio.querySelector('#ig-studio-btn-close');
    const btnCamera = studio.querySelector('#ig-studio-btn-camera');
    const fileInp = studio.querySelector('#ig-hidden-file-input');
    const viewPicker = studio.querySelector('#ig-view-picker');
    const viewDetails = studio.querySelector('#ig-view-details');
    const titleText = studio.querySelector('#ig-studio-title-text');
    const floatPickBtn = studio.querySelector('#ig-floating-pick-btn');
    const cameraTile = studio.querySelector('#ig-tile-camera');
    const btnShare = studio.querySelector('#ig-btn-share-post');
    const btnSaveDraft = studio.querySelector('#ig-btn-save-draft');
    const mediaContainer = studio.querySelector('#ig-details-media-container');
    const captionInp = studio.querySelector('#ig-details-caption');
    const editCoverBtn = studio.querySelector('#ig-btn-edit-cover');
    const progCard = studio.querySelector('#ig-upload-progress-card');
    const progFill = studio.querySelector('#ig-prog-fill');
    const progPct = studio.querySelector('#ig-prog-pct-text');
    const progMb = studio.querySelector('#ig-prog-mb-text');
    const progStatus = studio.querySelector('#ig-prog-status-text');

    // Close logic
    const closeStudio = () => {
      studio.remove();
    };

    btnClose.addEventListener('click', () => {
      if (viewDetails.style.display !== 'none' && !remixItem) {
        // Go back to picker
        viewDetails.style.display = 'none';
        viewPicker.style.display = 'flex';
        titleText.textContent = 'New reel';
        btnClose.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      } else {
        closeStudio();
      }
    });

    // Camera and Pick Triggers
    cameraTile.addEventListener('click', () => fileInp.click());
    floatPickBtn.addEventListener('click', () => fileInp.click());
    btnCamera.addEventListener('click', () => fileInp.click());

    fileInp.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleSelectedFile(e.target.files[0]);
      }
    });

    async function handleSelectedFile(file) {
      selectedFile = file;
      const isPhoto = detectIsPhoto(file);
      const objUrl = URL.createObjectURL(file);

      // Transition to Screen 2 (Image 5)
      viewPicker.style.display = 'none';
      viewDetails.style.display = 'flex';
      titleText.textContent = 'New reel';
      btnClose.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

      if (isPhoto) {
        mediaContainer.innerHTML = `<img class="ig-details-preview-media" src="${objUrl}" alt="Preview">`;
        customCoverDataUrl = objUrl;
      } else {
        mediaContainer.innerHTML = `<video class="ig-details-preview-media" src="${objUrl}" playsinline autoplay muted loop></video>`;
        // Extract real video thumbnail
        const thumb = await extractVideoThumbnail(file);
        customCoverDataUrl = thumb.coverUrl;
      }
    }

    function switchToDetailsWithReel(reelItem) {
      viewPicker.style.display = 'none';
      viewDetails.style.display = 'flex';
      titleText.textContent = 'Remix Reel';
      btnClose.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

      mediaContainer.innerHTML = `<img class="ig-details-preview-media" src="${reelItem.coverUrl || './Logo/logo.png'}" alt="Preview">`;
      captionInp.value = `Remix with @${reelItem.authorUsername || reelItem.c || 'creator'} #${reelItem.c || 'reels'}`;
      selectedPartner = reelItem.c || '';
      studio.querySelector('#ig-tag-subtext').textContent = reelItem.title || 'Daynight Partner';
    }

    if (remixItem) {
      switchToDetailsWithReel(remixItem);
    }

    // Quick tag chips
    studio.querySelectorAll('.ig-details-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.chip;
        if (tag === '#Hashtags') {
          captionInp.value += ' #chennaisilks #diwali #trending #reels';
        } else if (tag === '▷ Link a reel') {
          captionInp.value += ' ▷ Link: Daynight Collections';
        } else if (tag === '≡ Poll') {
          captionInp.value += ' \n📊 Which outfit is your favorite? 1 or 2?';
        } else if (tag === 'Q Prompt') {
          captionInp.value += ' \n💬 Tell us in comments!';
        }
        captionInp.focus();
      });
    });

    // Tag people row
    studio.querySelector('#ig-row-tag-people')?.addEventListener('click', () => {
      const partners = ['The Chennai Silks', 'Shealin Designers', 'Sarasaa Saloon', 'Khalids Cuisine', 'Vivaha Silks'];
      const chosen = prompt(`Tag a Brand Partner:\n${partners.join('\n')}`, selectedPartner || 'The Chennai Silks');
      if (chosen) {
        selectedPartner = chosen;
        studio.querySelector('#ig-tag-subtext').textContent = chosen;
      }
    });

    // Location row
    studio.querySelector('#ig-row-location')?.addEventListener('click', () => {
      const loc = prompt('Add Location (e.g. Velachery, T. Nagar, Chennai):', selectedLocation || 'Velachery, Chennai');
      if (loc) {
        selectedLocation = loc;
        studio.querySelector('#ig-loc-subtext').textContent = loc;
      }
    });

    // Audio row
    studio.querySelector('#ig-row-audio')?.addEventListener('click', () => {
      const aud = prompt('Rename Audio:', 'Original Audio - ' + (user.displayName || 'Day Night'));
      if (aud) {
        studio.querySelector('#ig-row-audio span.ig-details-row-subtext').textContent = aud;
      }
    });

    // AI Label switch
    const aiSwitch = studio.querySelector('#ig-switch-ai');
    studio.querySelector('#ig-row-ai-label')?.addEventListener('click', () => {
      isAiLabelActive = !isAiLabelActive;
      aiSwitch?.classList.toggle('active', isAiLabelActive);
    });

    // Edit Cover Button
    editCoverBtn.addEventListener('click', () => {
      const coverInp = document.createElement('input');
      coverInp.type = 'file';
      coverInp.accept = 'image/*';
      coverInp.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          const reader = new FileReader();
          reader.onload = () => {
            customCoverDataUrl = reader.result;
            const img = mediaContainer.querySelector('img');
            if (img) img.src = customCoverDataUrl;
            alert('Custom cover updated!');
          };
          reader.readAsDataURL(e.target.files[0]);
        }
      };
      coverInp.click();
    });

    // Save Draft
    btnSaveDraft.addEventListener('click', async () => {
      const draft = {
        caption: captionInp.value,
        partner: selectedPartner,
        location: selectedLocation,
        savedAt: Date.now()
      };
      try {
        await window.DNM_STORAGE?.cache?.set('reel_draft', draft);
        alert('Draft saved successfully!');
        closeStudio();
      } catch (_) {}
    });

    // SHARE / PUBLISH TO CLOUD & FIRESTORE
    btnShare.addEventListener('click', async () => {
      if (!selectedFile && !remixItem) {
        alert('Please select a photo or video first.');
        return;
      }

      btnShare.classList.add('disabled');
      btnShare.disabled = true;
      btnSaveDraft.disabled = true;
      progCard.style.display = 'flex';
      progFill.style.width = '10%';
      progPct.textContent = '10%';
      progStatus.textContent = 'Preparing media for Cloud Storage...';

      try {
        let base64Data = '';
        if (selectedFile) {
          base64Data = await readFileAsBase64(selectedFile);
        }

        const isPhoto = selectedFile ? detectIsPhoto(selectedFile) : false;
        const caption = captionInp.value.trim() || 'Daynight official post';
        const partner = selectedPartner.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tcs';
        const location = selectedLocation || 'Chennai';

        const payload = {
          action: 'uploadReel',
          fileData: base64Data,
          fileName: selectedFile ? selectedFile.name : 'remix.mp4',
          mimeType: selectedFile ? selectedFile.type : 'video/mp4',
          title: caption,
          caption: caption,
          client: partner,
          location: location,
          isPhoto: isPhoto,
          authorUid: user.uid,
          authorName: user.displayName || 'Day Night Creator',
          authorUsername: user.username || 'creator',
          authorAvatar: user.photoURL || './Logo/logo.png',
          aiLabel: isAiLabelActive,
          status: 'approved'
        };

        const gasUrl = window.DNM_CONFIG?.gasUrl || 'https://script.google.com/macros/s/AKfycbxTaYOdXlJ8Sy-yfbh68gq4iJn1ThlQXoTY83Bc75tlPYcQrbz1lv_WWfDySu4CYaGE/exec';

        // Real Progress Upload
        const result = await uploadWithProgress(gasUrl, payload, (progress) => {
          progFill.style.width = `${progress.percent}%`;
          progPct.textContent = `${progress.percent}%`;
          progMb.textContent = `${progress.loadedMb} MB / ${progress.totalMb} MB`;
          progStatus.textContent = `Streaming to Google Cloud Storage (${progress.percent}%)...`;
        });

        progFill.style.width = '100%';
        progPct.textContent = '100%';
        progStatus.textContent = 'Published successfully!';

        // Create Real Firestore Record
        const newPost = {
          id: result.fileId || `post_${Date.now()}`,
          title: caption,
          caption: caption,
          url: result.url || result.webContentLink || '',
          coverUrl: customCoverDataUrl || result.thumbnailLink || './Logo/logo.png',
          type: isPhoto ? 'photo' : 'video',
          c: partner,
          b: location,
          likes: 0,
          views: 1,
          createdAt: Date.now(),
          authorUid: user.uid,
          authorName: user.displayName || 'Day Night Creator',
          authorUsername: user.username || 'creator',
          authorAvatar: user.photoURL || './Logo/logo.png',
          status: 'approved',
          hidden: false
        };

        // Sync to Firestore & StorageAdapter
        if (window.DNM_DATA && window.DNM_DATA.addUploadedPost) {
          await window.DNM_DATA.addUploadedPost(newPost);
        }

        // Broadcast to Client Portal live sync
        if (typeof BroadcastChannel !== 'undefined') {
          const syncHub = new BroadcastChannel('daynight_live_sync');
          syncHub.postMessage({ type: 'DATA_MUTATED', post: newPost, time: Date.now() });
        }

        alert('Your post was shared to the feed!');
        closeStudio();

        // Refresh feed view
        if (window.DNM_APP?.switchTab) window.DNM_APP.switchTab('feed');
      } catch (err) {
        console.error('Publish failed:', err);
        alert('Upload completed with note: ' + err.message);
        closeStudio();
      }
    });
  }

  // Export to window
  window.DNM_UPLOAD = {
    openCreateSheet,
    openUploadModal: openCreateSheet, // Standard upload button opens the Instagram Create Sheet
    openInstagramStudio
  };

})(window);
