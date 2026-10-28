/**
 * Daynight-Media: Media Upload Studio & Google Drive Publisher
 * Directly uploads videos & photos to Google Drive, registers real server records,
 * and publishes interactive posts with full actions (Like, Comment, Share, Save, Download).
 */
(function(window) {
  'use strict';

  let selectedFile = null;

  // Video Thumbnail Extraction Engine (Optimized Zero-Leak Lightweight Frame Extraction)
  function generateVideoThumbnail(file, targetSec = 0.8) {
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
      }, 8000);

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
            const maxW = 480;
            let targetW = rawW;
            let targetH = rawH;

            if (targetW > maxW) {
              targetH = Math.round((targetH * maxW) / targetW);
              targetW = maxW;
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, targetW, targetH);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
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

  function getImageDimensions(file) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const w = img.naturalWidth || 1080;
        const h = img.naturalHeight || 1080;
        URL.revokeObjectURL(url);
        resolve({ width: w, height: h, aspectRatio: +(w / h).toFixed(4) });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 1080, height: 1080, aspectRatio: 1 });
      };
      img.src = url;
    });
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // Real-Time Upload with Progress via XMLHttpRequest
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
          try {
            data = JSON.parse(xhr.responseText);
          } catch(_) {
            data = { success: true };
          }
          resolve(data);
        } else {
          reject(new Error(`Server returned HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));
      xhr.timeout = 180000; // 3 minutes timeout

      xhr.send(JSON.stringify(payload));
    });
  }

  function openUploadModal() {
    const user = window.DNM_AUTH.getCurrentUser();
    if (!user) {
      window.DNM_AUTH.signInWithGoogle();
      return;
    }

    const existing = document.querySelector('#dnm-upload-scrim');
    if (existing) existing.remove();

    let selectedRatio = null;

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-upload-scrim';
    scrim.innerHTML = `
      <div class="dnm-modal-dialog dnm-upload-modal">
        <!-- Instagram Header -->
        <div class="dnm-upload-header">
          <button type="button" id="dnm-upload-cancel-btn" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;font-size:14px;font-weight:600;padding:4px 8px;">Cancel</button>
          <span class="dnm-upload-title">Create new post</span>
          <button type="button" id="dnm-upload-header-share" class="dnm-upload-nav-btn disabled" style="display:none;">Share</button>
          <div id="dnm-upload-header-spacer" style="width:50px;"></div>
        </div>

        <div class="dnm-upload-body">
          <!-- Dropzone Step -->
          <div class="dnm-upload-dropzone" id="dnm-dropzone">
            <svg class="dnm-upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span class="dnm-upload-text">Drag photos and videos here</span>
            <span class="dnm-upload-hint">Supports MP4, WebM, MOV, JPG, PNG up to 100MB</span>
            <input type="file" id="dnm-file-input" accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp" style="display:none;">
            <button type="button" id="dnm-select-file-btn" class="dnm-profile-btn primary" style="padding:8px 20px;border-radius:8px;font-size:13.5px;font-weight:700;margin-top:6px;">
              Select from computer / device
            </button>
          </div>

          <!-- Preview & Editing Step -->
          <div id="dnm-upload-editor" style="display:none;flex-direction:column;gap:12px;">
            <div class="dnm-upload-preview-wrap" id="dnm-preview-wrap"></div>

            <!-- Aspect Ratio Selector Toolbar -->
            <div class="dnm-upload-ratio-bar">
              <span style="font-size:11.5px;color:var(--ig-text-secondary);font-weight:600;margin-right:4px;">Ratio:</span>
              <button type="button" class="dnm-ratio-btn active" data-ratio="original">Original</button>
              <button type="button" class="dnm-ratio-btn" data-ratio="1:1">1:1 Square</button>
              <button type="button" class="dnm-ratio-btn" data-ratio="4:5">4:5 Portrait</button>
              <button type="button" class="dnm-ratio-btn" data-ratio="16:9">16:9 Reel</button>
            </div>

            <!-- Creator Profile Header -->
            <div class="dnm-upload-author-row">
              <img class="dnm-upload-author-avatar" src="${user.photoURL || './Logo/logo.png'}" alt="${user.displayName || 'Creator'}">
              <div class="dnm-upload-author-info">
                <span class="dnm-upload-author-name">${user.displayName || 'Creator'}</span>
                <span class="dnm-upload-author-handle">@${user.username || 'creator'}</span>
              </div>
            </div>

            <div class="dnm-upload-fields">
              <textarea id="dnm-upload-caption" class="dnm-upload-caption-inp" placeholder="Write a caption, add #hashtags, or tag @clients..."></textarea>
              
              <select id="dnm-upload-client-tag" class="dnm-upload-tag-select">
                <option value="">Tag a Brand Partner (Optional)</option>
                <option value="tcs">The Chennai Silks</option>
                <option value="shealin">Shealin Designers</option>
                <option value="sarasaa">Sarasaa Saloon</option>
                <option value="khalids">Khalids Cuisine</option>
                <option value="vivaha">Vivaha Silks</option>
              </select>

              <input type="text" id="dnm-upload-location" class="dnm-upload-location-inp" placeholder="Add location (e.g. Velachery, T. Nagar)...">

              <!-- Real-Time Progress Box (Hidden until Share is tapped) -->
              <div class="dnm-upload-progress-box" id="dnm-upload-prog-box" style="display:none;">
                <div class="dnm-upload-progress-row">
                  <span id="dnm-prog-step-text">Uploading to Cloud Storage...</span>
                  <span id="dnm-prog-percent-text">0%</span>
                </div>
                <div class="dnm-upload-progress-bar">
                  <div class="dnm-upload-progress-fill" id="dnm-prog-fill"></div>
                </div>
                <div id="dnm-prog-bytes-text" style="font-size:11.5px;color:var(--ig-text-secondary);text-align:right;">0 MB / 0 MB</div>
              </div>

              <button type="button" id="dnm-publish-btn" class="dnm-upload-publish-btn" style="margin-top:6px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                <span>Share Post to Feed</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(scrim);

    const cancelBtn = scrim.querySelector('#dnm-upload-cancel-btn');
    const headerShare = scrim.querySelector('#dnm-upload-header-share');
    const headerSpacer = scrim.querySelector('#dnm-upload-header-spacer');
    const dropzone = scrim.querySelector('#dnm-dropzone');
    const fileInp = scrim.querySelector('#dnm-file-input');
    const selectBtn = scrim.querySelector('#dnm-select-file-btn');
    const editorWrap = scrim.querySelector('#dnm-upload-editor');
    const previewWrap = scrim.querySelector('#dnm-preview-wrap');
    const publishBtn = scrim.querySelector('#dnm-publish-btn');
    const progBox = scrim.querySelector('#dnm-upload-prog-box');
    const progFill = scrim.querySelector('#dnm-prog-fill');
    const stepText = scrim.querySelector('#dnm-prog-step-text');
    const percentText = scrim.querySelector('#dnm-prog-percent-text');
    const bytesText = scrim.querySelector('#dnm-prog-bytes-text');
    const captionInp = scrim.querySelector('#dnm-upload-caption');
    const clientSelect = scrim.querySelector('#dnm-upload-client-tag');
    const locationInp = scrim.querySelector('#dnm-upload-location');

    cancelBtn.addEventListener('click', () => scrim.remove());
    selectBtn.addEventListener('click', () => fileInp.click());
    dropzone.addEventListener('click', () => fileInp.click());

    fileInp.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    // Aspect Ratio button toggles
    scrim.querySelectorAll('.dnm-ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        scrim.querySelectorAll('.dnm-ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const r = btn.dataset.ratio;
        selectedRatio = r;
        const mediaEl = previewWrap.querySelector('img, video');
        if (mediaEl) {
          if (r === '1:1') previewWrap.style.aspectRatio = '1 / 1';
          else if (r === '4:5') previewWrap.style.aspectRatio = '4 / 5';
          else if (r === '16:9') previewWrap.style.aspectRatio = '16 / 9';
          else previewWrap.style.aspectRatio = '';
        }
      });
    });

    function handleFileSelect(file) {
      selectedFile = file;
      dropzone.style.display = 'none';
      editorWrap.style.display = 'flex';
      headerShare.style.display = 'block';
      headerShare.classList.remove('disabled');
      if (headerSpacer) headerSpacer.style.display = 'none';

      const isPhoto = detectIsPhoto(file);
      const objUrl = URL.createObjectURL(file);

      if (isPhoto) {
        previewWrap.innerHTML = `<img class="dnm-upload-preview-media" src="${objUrl}" alt="Preview" style="max-height:300px;max-width:100%;object-fit:contain;border-radius:10px;">`;
      } else {
        previewWrap.innerHTML = `<video class="dnm-upload-preview-media" src="${objUrl}" controls playsinline autoplay muted loop style="max-height:300px;max-width:100%;object-fit:contain;border-radius:10px;"></video>`;
      }
    }

    async function startPublishing() {
      if (!selectedFile) return;

      publishBtn.classList.add('disabled');
      publishBtn.disabled = true;
      headerShare.classList.add('disabled');
      headerShare.disabled = true;
      progBox.style.display = 'flex';

      const isPhoto = detectIsPhoto(selectedFile);
      const isVideo = !isPhoto;
      const caption = captionInp.value.trim() || (isPhoto ? 'New Community Photo #DaynightMedia' : 'New Community Reel #DaynightMedia');
      const taggedClient = clientSelect.value || '';
      const customLocation = locationInp.value.trim() || (taggedClient ? 'Partner' : '');

      const user = window.DNM_AUTH.getCurrentUser();
      const effectiveHandle = (user && user.username && user.username !== 'creator')
        ? user.username
        : (user && user.displayName ? user.displayName.toLowerCase().replace(/[^a-z0-9_.]/g, '') : 'creator');
      const effectiveName = (user && user.displayName && user.displayName !== 'Creator')
        ? user.displayName
        : (effectiveHandle !== 'creator' ? effectiveHandle : 'Creator');
      const effectiveAvatar = (user && user.photoURL && !user.photoURL.includes('Logo/logo.png'))
        ? user.photoURL
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(effectiveName)}&background=262626&color=ffffff&bold=true`;

      try {
        let mediaDims = { width: 1080, height: 1080, aspectRatio: 1 };
        let thumbUrl = '';
        let durationStr = '';

        stepText.textContent = isPhoto ? 'Analyzing image dimensions...' : 'Extracting video cover thumbnail...';
        progFill.style.width = '10%';
        percentText.textContent = '10%';

        if (isPhoto) {
          mediaDims = await getImageDimensions(selectedFile);
        } else {
          const thumbRes = await generateVideoThumbnail(selectedFile);
          thumbUrl = thumbRes.coverUrl;
          durationStr = thumbRes.duration;
          mediaDims = { width: thumbRes.width || 720, height: thumbRes.height || 1280, aspectRatio: thumbRes.aspectRatio || 0.5625 };
        }

        // Apply chosen aspect ratio if custom selected
        if (selectedRatio === '1:1') mediaDims.aspectRatio = 1;
        else if (selectedRatio === '4:5') mediaDims.aspectRatio = 0.8;
        else if (selectedRatio === '16:9') mediaDims.aspectRatio = 1.7778;

        progFill.style.width = '25%';
        percentText.textContent = '25%';
        stepText.textContent = 'Encoding media payload...';

        const rawBase64 = await readFileAsBase64(selectedFile);

        const gasUrl = window.DNM_CONFIG_HELPERS?.getGasUrl?.('uploadVideo') ||
          (window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) ||
          'https://script.google.com/macros/s/AKfycbxTaYOdXlJ8Sy-yfbh68gq4iJn1ThlQXoTY83Bc75tlPYcQrbz1lv_WWfDySu4CYaGE/exec';

        const payload = {
          action: 'uploadVideo',
          clientName: taggedClient ? (window.DNM_DATA.getClient(taggedClient)?.name || 'Brand') : '',
          clientId: taggedClient || '',
          branch: customLocation || (taggedClient ? 'Partner' : ''),
          location: customLocation,
          album: 'Uploads',
          title: caption,
          dur: isPhoto ? '' : durationStr,
          coverUrl: thumbUrl || (isPhoto ? rawBase64 : ''),
          base64Data: rawBase64,
          filename: selectedFile.name,
          mimeType: selectedFile.type || (isPhoto ? 'image/jpeg' : 'video/mp4'),
          type: isPhoto ? 'photo' : 'reel',
          aspectRatio: mediaDims.aspectRatio,
          width: mediaDims.width,
          height: mediaDims.height,
          authorId: user ? user.uid : '',
          authorName: effectiveName,
          authorUsername: effectiveHandle,
          authorAvatar: effectiveAvatar,
          status: 'approved'
        };

        // Real-Time Upload Progress Tracker
        stepText.textContent = 'Uploading to Google Drive cloud...';

        const serverData = await uploadWithProgress(gasUrl, payload, ({ percent, loadedMb, totalMb }) => {
          // Progress from 25% to 95% is real upload stream
          const displayPct = Math.round(25 + (percent * 0.7));
          progFill.style.width = displayPct + '%';
          percentText.textContent = displayPct + '%';
          bytesText.textContent = `${loadedMb} MB / ${totalMb} MB uploaded`;
          stepText.textContent = `Uploading media stream (${displayPct}%)...`;
        });

        // Finished uploading bytes - registering post
        progFill.style.width = '100%';
        percentText.textContent = '100%';
        stepText.textContent = 'Publishing live to social feed...';
        bytesText.textContent = 'Upload complete';

        const fileId = serverData?.fileId || serverData?.reel?.fileId || ('drive_' + Date.now());
        const driveUrl = serverData?.viewUrl || serverData?.reel?.url || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : '');
        const cloudProxyStream = fileId ? (window.DNM_CONFIG_HELPERS?.getStreamUrl?.(fileId) || `https://daynight-portal.pages.dev/api/video?id=${encodeURIComponent(fileId)}&v=3`) : '';
        const finalMedia = isVideo ? (cloudProxyStream || driveUrl || rawBase64) : (rawBase64 || cloudProxyStream || driveUrl);
        const finalCover = isVideo ? (thumbUrl || rawBase64) : rawBase64;

        const newPost = {
          id: serverData?.reel?.id || ('r' + Date.now().toString(36)),
          c: taggedClient || '',
          b: customLocation || (taggedClient ? 'Partner' : ''),
          location: customLocation,
          album: 'Uploads',
          type: isPhoto ? 'photo' : 'reel',
          title: caption,
          caption: caption,
          authorId: user ? user.uid : '',
          authorName: effectiveName,
          authorUsername: effectiveHandle,
          authorAvatar: effectiveAvatar,
          mediaUrl: finalMedia,
          url: cloudProxyStream || driveUrl,
          fileId: fileId,
          coverUrl: finalCover,
          dur: isPhoto ? '' : durationStr,
          aspectRatio: mediaDims.aspectRatio,
          width: mediaDims.width,
          height: mediaDims.height,
          likes: 0,
          views: 1,
          downloads: 0,
          date: 'Just now',
          status: 'approved',
          hidden: false
        };

        window.DNM_DATA.addUploadedPost(newPost);
        if (window.DNM_FIREBASE && window.DNM_FIREBASE.savePost) {
          window.DNM_FIREBASE.savePost(newPost).catch(e => console.warn('Firestore save post:', e));
        }

        setTimeout(() => {
          scrim.remove();

          // Refresh active views and switch to feed
          const feedWrap = document.querySelector('#dnm-feed-cards-wrap');
          if (feedWrap && window.DNM_FEED) {
            window.DNM_FEED.renderFeedCards(feedWrap);
          }
          if (window.DNM_APP && window.DNM_APP.switchTab) {
            window.DNM_APP.switchTab('feed');
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });

          if (window.DNM_FEED && window.DNM_FEED.showToast) {
            window.DNM_FEED.showToast(`${isPhoto ? 'Photo' : 'Reel'} published live to feed!`);
          }
        }, 400);

      } catch(err) {
        console.error('Upload to Drive error:', err);
        stepText.textContent = 'Upload failed. Please check connection and retry.';
        publishBtn.classList.remove('disabled');
        publishBtn.disabled = false;
        headerShare.classList.remove('disabled');
        headerShare.disabled = false;
      }
    }

    publishBtn.addEventListener('click', startPublishing);
    headerShare.addEventListener('click', startPublishing);
  }

  window.DNM_UPLOAD = {
    openUploadModal
  };

})(window);
