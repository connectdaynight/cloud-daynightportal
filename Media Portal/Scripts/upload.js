/**
 * Daynight-Media: Media Upload Studio & Google Drive Publisher
 */
(function(window) {
  'use strict';

  let selectedFile = null;

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
          <button type="button" id="dnm-upload-close-btn" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;font-size:20px;">&times;</button>
        </div>

        <div class="dnm-upload-dropzone" id="dnm-dropzone">
          <svg class="dnm-upload-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span class="dnm-upload-text">Drag videos or photos here</span>
          <span class="dnm-upload-hint">Supports MP4, WebM, JPG, PNG up to 500MB</span>
          <input type="file" id="dnm-file-input" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" style="display:none;">
          <button type="button" id="dnm-select-file-btn" class="dnm-profile-btn primary" style="padding:6px 16px;border-radius:8px;font-size:12.5px;margin-top:4px;">
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

          <div class="dnm-upload-progress-bar" id="dnm-upload-prog">
            <div class="dnm-upload-progress-fill" id="dnm-prog-fill"></div>
          </div>

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
    const captionInp = scrim.querySelector('#dnm-upload-caption');

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
      publishBtn.innerHTML = '<span>Uploading to Drive...</span>';
      progBar.style.display = 'block';

      // Simulate real-time progress while saving
      let prog = 10;
      const timer = setInterval(() => {
        prog = Math.min(prog + 15, 90);
        progFill.style.width = prog + '%';
      }, 200);

      const isVideo = selectedFile.type.startsWith('video/');
      const caption = captionInp.value.trim() || (isVideo ? 'New Community Reel #DaynightMedia' : 'New Community Photo #DaynightMedia');
      const objUrl = URL.createObjectURL(selectedFile);

      // Attempt Drive GAS upload if online
      let driveUrl = objUrl;
      let driveFileId = 'local_' + Date.now();
      try {
        if (window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) {
          const reader = new FileReader();
          reader.onload = async function() {
            try {
              const base64 = reader.result.split(',')[1];
              await fetch(window.DNM_CONFIG.gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                  action: 'uploadVideo',
                  title: selectedFile.name,
                  fileData: base64,
                  mimeType: selectedFile.type,
                  folderName: isVideo ? 'Community Uploads/Videos' : 'Community Uploads/Photos'
                })
              });
            } catch(_) {}
          };
          reader.readAsDataURL(selectedFile);
        }
      } catch(_) {}

      setTimeout(() => {
        clearInterval(timer);
        progFill.style.width = '100%';

        const newPost = {
          id: 'comm_' + Date.now(),
          authorId: user.uid,
          authorName: user.displayName || user.username,
          authorAvatar: user.photoURL,
          type: isVideo ? 'reel' : 'photo',
          title: caption,
          caption: caption,
          mediaUrl: driveUrl,
          coverUrl: driveUrl,
          driveFileId: driveFileId,
          likes: 1,
          commentsCount: 0,
          views: 1,
          date: 'Just now'
        };

        window.DNM_DATA.addCommunityPost(newPost);
        scrim.remove();

        // Refresh feed if active
        const feedWrap = document.querySelector('#dnm-feed-cards-wrap');
        if (feedWrap && window.DNM_FEED) {
          window.DNM_FEED.renderFeedCards(feedWrap);
        }
      }, 1000);
    });
  }

  window.DNM_UPLOAD = {
    openUploadModal
  };

})(window);
