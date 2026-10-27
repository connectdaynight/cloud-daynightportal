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
        return resolve({ coverUrl: '', duration: '0:30' });
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
          resolve({ coverUrl: '', duration: '0:30' });
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
            resolve({ coverUrl: dataUrl, duration: durStr });
          } catch(e) {
            cleanup();
            resolve({ coverUrl: '', duration: durStr });
          }
        };
      };

      video.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve({ coverUrl: '', duration: '0:30' });
        }
      };
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

  function openUploadModal() {
    const user = window.DNM_AUTH.getCurrentUser();
    if (!user) {
      window.DNM_AUTH.signInWithGoogle();
      return;
    }

    const existing = document.querySelector('#dnm-upload-scrim');
    if (existing) existing.remove();

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-upload-scrim';
    scrim.innerHTML = `
      <div class="dnm-modal-dialog dnm-upload-modal" style="max-width:440px;">
        <div class="dnm-upload-header">
          <span class="dnm-upload-title">Create New Post</span>
          <button type="button" id="dnm-upload-close-btn" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;font-size:22px;">&times;</button>
        </div>

        <div class="dnm-upload-dropzone" id="dnm-dropzone">
          <svg class="dnm-upload-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span class="dnm-upload-text">Drag videos or photos here</span>
          <span class="dnm-upload-hint">Supports MP4, WebM, JPG, PNG up to 100MB</span>
          <input type="file" id="dnm-file-input" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" style="display:none;">
          <button type="button" id="dnm-select-file-btn" class="dnm-profile-btn primary" style="padding:7px 18px;border-radius:8px;font-size:13px;margin-top:6px;">
            Select from Device
          </button>
        </div>

        <div class="dnm-upload-preview-wrap" id="dnm-preview-wrap" style="display:none;">
          <!-- Live Preview Element Injected Here -->
        </div>

        <div class="dnm-upload-fields" id="dnm-upload-fields" style="display:none;">
          <textarea id="dnm-upload-caption" class="dnm-upload-caption-inp" placeholder="Write a caption, add #hashtags, or tag @clients..."></textarea>
          
          <select id="dnm-upload-client-tag" class="dnm-upload-tag-select">
            <option value="">Tag a Brand Partner (Optional)</option>
            <option value="tcs">The Chennai Silks</option>
            <option value="shealin">Shealin Designers</option>
            <option value="sarasaa">Sarasaa Saloon</option>
            <option value="khalids">Khalids Cuisine</option>
            <option value="vivaha">Vivaha Silks</option>
          </select>

          <div class="dnm-upload-progress-bar" id="dnm-upload-prog" style="display:none;margin:8px 0;height:4px;background:var(--ig-border);border-radius:2px;overflow:hidden;">
            <div class="dnm-upload-progress-fill" id="dnm-prog-fill" style="width:0%;height:100%;background:var(--ig-accent);transition:width 0.2s ease;"></div>
          </div>
          <div id="dnm-upload-status-text" style="display:none;font-size:12px;color:var(--ig-text-secondary);text-align:center;margin-bottom:6px;">Publishing to Google Drive...</div>

          <button type="button" id="dnm-publish-btn" class="dnm-upload-publish-btn">
            <span>Share to Feed</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(scrim);

    const closeBtn = scrim.querySelector('#dnm-upload-close-btn');
    const dropzone = scrim.querySelector('#dnm-dropzone');
    const fileInp = scrim.querySelector('#dnm-file-input');
    const selectBtn = scrim.querySelector('#dnm-select-file-btn');
    const previewWrap = scrim.querySelector('#dnm-preview-wrap');
    const fieldsWrap = scrim.querySelector('#dnm-upload-fields');
    const publishBtn = scrim.querySelector('#dnm-publish-btn');
    const progBar = scrim.querySelector('#dnm-upload-prog');
    const progFill = scrim.querySelector('#dnm-prog-fill');
    const statusText = scrim.querySelector('#dnm-upload-status-text');
    const captionInp = scrim.querySelector('#dnm-upload-caption');
    const clientSelect = scrim.querySelector('#dnm-upload-client-tag');

    closeBtn.addEventListener('click', () => scrim.remove());
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

    function handleFileSelect(file) {
      selectedFile = file;
      dropzone.style.display = 'none';
      previewWrap.style.display = 'flex';
      fieldsWrap.style.display = 'flex';

      const isVideo = file.type.startsWith('video/');
      const objUrl = URL.createObjectURL(file);

      if (isVideo) {
        previewWrap.innerHTML = `<video class="dnm-upload-preview-media" src="${objUrl}" controls playsinline autoplay muted loop></video>`;
      } else {
        previewWrap.innerHTML = `<img class="dnm-upload-preview-media" src="${objUrl}" alt="Preview">`;
      }
    }

    publishBtn.addEventListener('click', async () => {
      if (!selectedFile) return;

      publishBtn.classList.add('disabled');
      publishBtn.disabled = true;
      publishBtn.innerHTML = '<span>Uploading to Google Drive...</span>';
      progBar.style.display = 'block';
      statusText.style.display = 'block';
      statusText.textContent = 'Preparing media for upload...';
      progFill.style.width = '15%';

      const isVideo = selectedFile.type.startsWith('video/');
      const caption = captionInp.value.trim() || (isVideo ? 'New Community Reel #DaynightMedia' : 'New Community Photo #DaynightMedia');
      const taggedClient = clientSelect.value || '';

      try {
        // 1. Generate real thumbnail & duration for videos
        let thumbUrl = '';
        let durationStr = '0:30';
        if (isVideo) {
          statusText.textContent = 'Generating video cover thumbnail...';
          const thumbRes = await generateVideoThumbnail(selectedFile);
          thumbUrl = thumbRes.coverUrl;
          durationStr = thumbRes.duration;
        }
        progFill.style.width = '35%';

        // 2. Read full media as base64
        statusText.textContent = 'Encoding media stream...';
        const rawBase64 = await readFileAsBase64(selectedFile);
        progFill.style.width = '55%';

        // 3. Upload directly to Google Drive via Google Apps Script backend
        statusText.textContent = 'Publishing to Google Drive & database...';
        const gasUrl = (window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) 
          ? window.DNM_CONFIG.gasUrl 
          : 'https://script.google.com/macros/s/AKfycbxTaYOdXlJ8Sy-yfbh68gq4iJn1ThlQXoTY83Bc75tlPYcQrbz1lv_WWfDySu4CYaGE/exec';

        const payload = {
          action: 'uploadVideo',
          clientName: taggedClient ? (window.DNM_DATA.getClient(taggedClient)?.name || 'Brand') : '',
          clientId: taggedClient || '',
          branch: taggedClient ? 'Partner' : '',
          album: 'Uploads',
          title: caption,
          dur: durationStr,
          coverUrl: thumbUrl || (isVideo ? '' : rawBase64),
          base64Data: rawBase64,
          filename: selectedFile.name,
          mimeType: selectedFile.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
          type: isVideo ? 'reel' : 'photo',
          authorId: user.uid,
          authorName: user.displayName || user.username || 'Creator',
          authorUsername: user.username || 'creator',
          authorAvatar: user.photoURL || './Logo/logo.png?v=3.2',
          status: 'approved'
        };

        const timer = setInterval(() => {
          const cur = parseInt(progFill.style.width) || 55;
          if (cur < 90) progFill.style.width = (cur + 5) + '%';
        }, 300);

        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });

        clearInterval(timer);
        progFill.style.width = '100%';

        let serverData = null;
        try {
          serverData = await res.json();
        } catch(_) {}

        const fileId = serverData?.fileId || serverData?.reel?.fileId || ('drive_' + Date.now());
        const driveUrl = serverData?.viewUrl || serverData?.reel?.url || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : '');
        const cloudProxyStream = fileId ? `https://daynight-portal.pages.dev/api/video?id=${encodeURIComponent(fileId)}&v=3` : '';
        const finalMedia = isVideo ? (cloudProxyStream || driveUrl || rawBase64) : (rawBase64 || cloudProxyStream || driveUrl);
        const finalCover = isVideo ? (thumbUrl || rawBase64) : rawBase64;

        const newPost = {
          id: serverData?.reel?.id || ('r' + Date.now().toString(36)),
          c: taggedClient || '',
          b: taggedClient ? 'Partner' : '',
          album: 'Uploads',
          type: isVideo ? 'reel' : 'photo',
          title: caption,
          caption: caption,
          authorId: user.uid,
          authorName: user.displayName || user.username || 'Creator',
          authorUsername: user.username || 'creator',
          authorAvatar: user.photoURL || './Logo/logo.png?v=3.2',
          mediaUrl: finalMedia,
          url: cloudProxyStream || driveUrl,
          fileId: fileId,
          coverUrl: finalCover,
          dur: durationStr,
          likes: 0,
          views: 1,
          downloads: 0,
          date: 'Just now',
          status: 'approved',
          hidden: false
        };

        window.DNM_DATA.addUploadedPost(newPost);
        scrim.remove();

        // Refresh active views
        const feedWrap = document.querySelector('#dnm-feed-cards-wrap');
        if (feedWrap && window.DNM_FEED) {
          window.DNM_FEED.renderFeedCards(feedWrap);
        }
        if (window.DNM_FEED && window.DNM_FEED.showToast) {
          window.DNM_FEED.showToast('Post uploaded to Google Drive and shared to feed!');
        }

      } catch(err) {
        console.error('Upload to Drive error:', err);
        statusText.textContent = 'Upload failed. Please check connection and retry.';
        publishBtn.classList.remove('disabled');
        publishBtn.disabled = false;
        publishBtn.innerHTML = '<span>Retry Upload</span>';
      }
    });
  }

  window.DNM_UPLOAD = {
    openUploadModal
  };

})(window);
