/**
 * Daynight-Media: Instagram-Grade Stories Camera & Viewer
 * Real-time story creation, viewing with progress bars, reply, and 24h expiry
 */
(function(window) {
  'use strict';

  let activeStoryViewer = null;
  let currentStoryIndex = 0;
  let storyProgressInterval = null;
  let storyData = { user: null, clients: [] };

  async function initStories() {
    const user = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;
    const clients = window.DNM_DATA.getClients ? window.DNM_DATA.getClients() : [];

    storyData = { user, clients };
    await renderStoriesTray();
    initStoryCamera();
  }

  async function renderStoriesTray(trayEl) {
    const target = trayEl || document.querySelector('#dnm-stories-tray');
    if (!target) return;

    const user = storyData.user;
    const clients = storyData.clients;

    let html = `
      <div class="dnm-story-item dnm-story-add" data-action="create-story">
        <div class="dnm-story-ring add-ring">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </div>
        <span class="dnm-story-name">Your Story</span>
      </div>
    `;

    if (user) {
      html += `
        <div class="dnm-story-item dnm-story-user" data-action="view-user-story" data-user-id="${user.uid}">
          <div class="dnm-story-ring ${await hasUserStories(user.uid) ? '' : 'seen'}">
            <img class="dnm-story-avatar" src="${user.photoURL || './Logo/logo.png'}" alt="Your Story">
          </div>
          <span class="dnm-story-name">${user.username || user.displayName || 'You'}</span>
        </div>
      `;
    }

    for (const c of clients) {
      const realLogo = c.logo || './Logo/logo.png';
      const hasStories = await hasClientStories(c.id);
      html += `
        <div class="dnm-story-item" data-action="view-client-story" data-client="${c.id}">
          <div class="dnm-story-ring ${hasStories ? '' : 'seen'}">
            <img class="dnm-story-avatar" src="${realLogo}" alt="${c.name}">
          </div>
          <span class="dnm-story-name">${c.name.split(' ')[0]}</span>
        </div>
      `;
    }

    target.innerHTML = html;

    target.querySelector('[data-action="create-story"]')?.addEventListener('click', () => openStoryCamera());
    target.querySelector('[data-action="view-user-story"]')?.addEventListener('click', () => openStoryViewer('user', user.uid));
    target.querySelectorAll('[data-action="view-client-story"]').forEach(item => {
      item.addEventListener('click', () => openStoryViewer('client', item.dataset.client));
    });
  }

  async function hasUserStories(userId) {
    try {
      const stored = await window.DNM_STORAGE?.social?.get('user_stories', {});
      return stored && stored[userId]?.length > 0;
    } catch(_) {
      return false;
    }
  }

  async function hasClientStories(clientId) {
    try {
      const stored = await window.DNM_STORAGE?.social?.get('client_stories', {});
      return stored && stored[clientId]?.length > 0;
    } catch(_) {
      return false;
    }
  }

  function initStoryCamera() {
    // Camera is opened via button click
  }

  function openStoryCamera() {
    const user = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;
    if (!user) {
      window.DNM_AUTH.signInWithGoogle();
      return;
    }

    const existing = document.querySelector('#dnm-story-camera-scrim');
    if (existing) existing.remove();

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-story-camera-scrim';
    scrim.style.cssText = 'z-index: 1000002 !important;';
    scrim.innerHTML = `
      <div class="dnm-story-camera-modal" style="width:100%;max-width:470px;height:100vh;max-height:100vh;background:#000;display:flex;flex-direction:column;position:relative;">
        <div style="position:absolute;top:0;left:0;right:0;padding:calc(env(safe-area-inset-top, 10px) + 12px) 16px;display:flex;justify-content:space-between;align-items:center;z-index:10;background:linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);">
          <button type="button" id="dnm-camera-close" style="background:none;border:none;color:#FFF;cursor:pointer;padding:8px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          <span style="color:#FFF;font-weight:700;font-size:16px;">Create Story</span>
          <div style="width:40px;"></div>
        </div>

        <div class="dnm-camera-viewfinder" style="flex:1;position:relative;overflow:hidden;background:#000;">
          <video id="dnm-camera-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1);"></video>
          <canvas id="dnm-camera-canvas" style="display:none;"></canvas>
          <img id="dnm-camera-preview" alt="" style="display:none;width:100%;height:100%;object-fit:cover;">
        </div>

        <div class="dnm-camera-controls" style="position:absolute;bottom:0;left:0;right:0;padding:calc(env(safe-area-inset-bottom, 20px) + 16px) 16px 24px;display:flex;align-items:center;justify-content:center;gap:20px;background:linear-gradient(to top, rgba(0,0,0,0.8), transparent);z-index:10;">
          <button type="button" id="dnm-camera-flip" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#FFF;border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(8px);" title="Flip Camera">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 16v8"/><path d="M3 16h8"/></svg>
          </button>

          <button type="button" id="dnm-camera-capture" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <div class="dnm-capture-ring" style="width:76px;height:76px;border-radius:50%;border:4px solid #FFF;display:flex;align-items:center;justify-content:center;transition:transform 0.1s ease;">
              <div class="dnm-capture-inner" style="width:60px;height:60px;border-radius:50%;background:#FFF;"></div>
            </div>
          </button>

          <button type="button" id="dnm-camera-gallery" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#FFF;border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(8px);overflow:hidden;" title="Gallery">
            <img id="dnm-camera-last-thumb" alt="" style="width:100%;height:100%;object-fit:cover;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </button>
        </div>

        <div class="dnm-camera-edit-tools" id="dnm-camera-edit-tools" style="display:none;position:absolute;bottom:0;left:0;right:0;padding:16px;background:linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.7));z-index:10;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <button type="button" id="dnm-edit-back" style="background:none;border:none;color:#FFF;cursor:pointer;padding:8px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>
            <span style="color:#FFF;font-weight:700;font-size:16px;">Edit Story</span>
            <button type="button" id="dnm-edit-text" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#FFF;border-radius:24px;padding:6px 16px;cursor:pointer;">Aa Text</button>
          </div>
          <div style="display:flex;align-items:center;gap:12px;overflow-x:auto;padding-bottom:8px;">
            <span style="color:#FFF;font-size:12px;font-weight:600;white-space:nowrap;">Filters:</span>
            <button type="button" class="dnm-filter-btn active" data-filter="none" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">Normal</button>
            <button type="button" class="dnm-filter-btn" data-filter="grayscale" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">B&W</button>
            <button type="button" class="dnm-filter-btn" data-filter="sepia" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">Sepia</button>
            <button type="button" class="dnm-filter-btn" data-filter="contrast" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">Contrast</button>
            <button type="button" class="dnm-filter-btn" data-filter="warmth" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">Warm</button>
            <button type="button" class="dnm-filter-btn" data-filter="cool" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">Cool</button>
          </div>
          <button type="button" id="dnm-camera-post-story" class="dnm-btn dnm-btn-primary dnm-btn-lg" style="width:100%;margin-top:12px;">Post to Your Story</button>
        </div>
      </div>
    `;
    document.body.appendChild(scrim);

    const video = scrim.querySelector('#dnm-camera-video');
    const canvas = scrim.querySelector('#dnm-camera-canvas');
    const preview = scrim.querySelector('#dnm-camera-preview');
    const captureBtn = scrim.querySelector('#dnm-camera-capture');
    const captureRing = scrim.querySelector('.dnm-capture-ring');
    const flipBtn = scrim.querySelector('#dnm-camera-flip');
    const galleryBtn = scrim.querySelector('#dnm-camera-gallery');
    const lastThumb = scrim.querySelector('#dnm-camera-last-thumb');
    const editTools = scrim.querySelector('#dnm-camera-edit-tools');
    const postBtn = scrim.querySelector('#dnm-camera-post-story');
    const backBtn = scrim.querySelector('#dnm-edit-back');
    const textBtn = scrim.querySelector('#dnm-edit-text');
    const filterBtns = scrim.querySelectorAll('.dnm-filter-btn');
    const closeBtn = scrim.querySelector('#dnm-camera-close');

    let currentStream = null;
    let facingMode = 'user';
    let capturedBlob = null;
    let appliedFilter = 'none';

    async function startCamera() {
      try {
        if (currentStream) {
          currentStream.getTracks().forEach(t => t.stop());
        }
        currentStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: false
        });
        video.srcObject = currentStream;
        await video.play();
        video.style.display = 'block';
        preview.style.display = 'none';
        editTools.style.display = 'none';
        captureBtn.style.display = 'flex';
        flipBtn.style.display = 'flex';
        galleryBtn.style.display = 'flex';
      } catch(err) {
        console.error('Camera access denied:', err);
        alert('Camera access is required to create stories. Please enable camera permissions.');
      }
    }

    async function stopCamera() {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
      }
    }

    function applyFilter(ctx, filter) {
      const w = canvas.width;
      const h = canvas.height;
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      switch(filter) {
        case 'grayscale':
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
            data[i] = data[i+1] = data[i+2] = gray;
          }
          break;
        case 'sepia':
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
            data[i+1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
            data[i+2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
          }
          break;
        case 'contrast':
          const factor = 1.5;
          for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, (data[i] - 128) * factor + 128);
            data[i+1] = Math.min(255, (data[i+1] - 128) * factor + 128);
            data[i+2] = Math.min(255, (data[i+2] - 128) * factor + 128);
          }
          break;
        case 'warmth':
          for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] * 1.1);
            data[i+2] = Math.max(0, data[i+2] * 0.9);
          }
          break;
        case 'cool':
          for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] * 0.9);
            data[i+2] = Math.min(255, data[i+2] * 1.1);
          }
          break;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    captureBtn.addEventListener('click', async () => {
      if (capturedBlob) {
        // Retake
        capturedBlob = null;
        video.style.display = 'block';
        preview.style.display = 'none';
        editTools.style.display = 'none';
        captureBtn.style.display = 'flex';
        captureRing.style.transform = 'scale(1)';
        captureRing.querySelector('.dnm-capture-inner').style.background = '#FFF';
        return;
      }

      captureRing.style.transform = 'scale(0.85)';
      setTimeout(() => captureRing.style.transform = 'scale(1)', 100);

      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (appliedFilter !== 'none') {
        applyFilter(ctx, appliedFilter);
      }

      capturedBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const previewUrl = URL.createObjectURL(capturedBlob);

      video.style.display = 'none';
      preview.src = previewUrl;
      preview.style.display = 'block';
      editTools.style.display = 'block';
      captureBtn.style.display = 'flex';
      captureRing.querySelector('.dnm-capture-inner').style.background = 'transparent';
      captureRing.style.borderColor = 'var(--ig-accent)';
    });

    flipBtn.addEventListener('click', () => {
      facingMode = facingMode === 'user' ? 'environment' : 'user';
      startCamera();
    });

    galleryBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.capture = 'environment';
      input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type.startsWith('video/')) {
          // For video, we'd need more complex handling
          alert('Video stories coming soon!');
          return;
        }

        const url = URL.createObjectURL(file);
        video.style.display = 'none';
        preview.src = url;
        preview.style.display = 'block';
        editTools.style.display = 'block';
        capturedBlob = file;
        captureRing.querySelector('.dnm-capture-inner').style.background = 'transparent';
        captureRing.style.borderColor = 'var(--ig-accent)';

        // Update last thumbnail
        lastThumb.src = url;
        lastThumb.style.display = 'block';
        galleryBtn.querySelector('svg').style.display = 'none';
      };
      input.click();
    });

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        appliedFilter = btn.dataset.filter;
        filterBtns.forEach(b => b.classList.toggle('active', b === btn));

        if (capturedBlob) {
          const ctx = canvas.getContext('2d');
          const img = new Image();
          img.src = preview.src;
          img.onload = async () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            if (appliedFilter !== 'none') applyFilter(ctx, appliedFilter);
            capturedBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            preview.src = URL.createObjectURL(capturedBlob);
          };
        }
      });
    });

    postBtn.addEventListener('click', async () => {
      if (!capturedBlob) {
        alert('Please capture a photo or video first');
        return;
      }

      postBtn.disabled = true;
      postBtn.textContent = 'Posting...';

      try {
        const base64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(capturedBlob);
        });

        const story = {
          id: 'story_' + Date.now(),
          userId: user.uid,
          username: user.username || user.displayName,
          avatar: user.photoURL || './Logo/logo.png',
          mediaUrl: base64,
          type: 'photo',
          timestamp: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          views: [],
          replies: []
        };

        // Save to StorageAdapter & Cloud Firestore (Zero localStorage)
        let stored = {};
        try {
          stored = await window.DNM_STORAGE?.social?.get('user_stories', {}) || {};
        } catch(_) {}
        if (!stored[user.uid]) stored[user.uid] = [];
        stored[user.uid].unshift(story);
        stored[user.uid] = stored[user.uid].slice(0, 50);
        try {
          await window.DNM_STORAGE?.social?.set('user_stories', stored);
        } catch(_) {}

        // Also save to Firestore
        if (window.DNM_FIREBASE && window.DNM_FIREBASE.savePost) {
          window.DNM_FIREBASE.savePost({
            ...story,
            id: story.id,
            authorId: user.uid,
            authorName: user.displayName,
            authorUsername: user.username,
            authorAvatar: user.photoURL,
            status: 'approved',
            type: 'story'
          }).catch(() => {});
        }

        if (window.DNM_FEED && window.DNM_FEED.showToast) {
          window.DNM_FEED.showToast('Story posted!');
        }

        scrim.remove();
        stopCamera();
        renderStoriesTray();
      } catch(err) {
        console.error('Story post error:', err);
        alert('Failed to post story. Please try again.');
      } finally {
        postBtn.disabled = false;
        postBtn.textContent = 'Post to Your Story';
      }
    });

    backBtn.addEventListener('click', () => {
      if (capturedBlob) {
        // Go back to camera
        capturedBlob = null;
        video.style.display = 'block';
        preview.style.display = 'none';
        editTools.style.display = 'none';
        captureBtn.style.display = 'flex';
        captureRing.style.transform = 'scale(1)';
        captureRing.querySelector('.dnm-capture-inner').style.background = '#FFF';
        captureRing.style.borderColor = '#FFF';
        appliedFilter = 'none';
        filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'none'));
      } else {
        scrim.remove();
        stopCamera();
      }
    });

    closeBtn.addEventListener('click', () => {
      scrim.remove();
      stopCamera();
    });

    scrim.addEventListener('click', e => {
      if (e.target === scrim) {
        scrim.remove();
        stopCamera();
      }
    });

    startCamera();
  }

  function openStoryViewer(type, id) {
    if (activeStoryViewer) return;

    let stories = [];
    let title = '';

    if (type === 'user') {
      const user = window.DNM_AUTH.getCurrentUser();
      if (!user || user.uid !== id) return;
      title = '@' + (user.username || user.displayName || 'You');
      getUserStories(id).then(s => {
        stories = s;
        if (!stories.length) {
          // No stories, open camera instead
          openStoryCamera();
          return;
        }
        showStoryViewer(stories, 0, title, type, id);
      });
    } else if (type === 'client') {
      const client = window.DNM_DATA.getClient(id);
      if (!client) return;
      title = client.name;
      getClientStories(id).then(s => {
        stories = s;
        if (!stories.length) {
          if (window.DNM_FEED && window.DNM_FEED.showToast) {
            window.DNM_FEED.showToast('No active stories from this brand');
          }
          return;
        }
        showStoryViewer(stories, 0, title, type, id);
      });
    }
  }

  async function getUserStories(userId) {
    try {
      const stored = await window.DNM_STORAGE?.social?.get('user_stories', {});
      return (stored && stored[userId] || []).filter(s => s.expiresAt > Date.now());
    } catch(_) {
      return [];
    }
  }

  async function getClientStories(clientId) {
    try {
      const stored = await window.DNM_STORAGE?.social?.get('client_stories', {});
      return (stored && stored[clientId] || []).filter(s => s.expiresAt > Date.now());
    } catch(_) {
      return [];
    }
  }

  function showStoryViewer(stories, startIndex, title, sourceType, sourceId) {
    if (!stories.length) return;

    currentStoryIndex = startIndex;
    const story = stories[currentStoryIndex];

    const existing = document.querySelector('#dnm-story-viewer-scrim');
    if (existing) existing.remove();

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-story-viewer-scrim';
    scrim.style.cssText = 'z-index: 1000003 !important; background: #000;';
    scrim.innerHTML = `
      <div class="dnm-story-viewer" style="width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:center;background:#000;">
        <!-- Progress Bars -->
        <div class="dnm-story-progress-bars" style="position:absolute;top:calc(env(safe-area-inset-top, 10px) + 10px);left:12px;right:12px;height:4px;display:flex;gap:4px;z-index:20;">
          ${stories.map((_, i) => `
            <div class="dnm-story-progress-track" style="flex:1;height:100%;background:rgba(255,255,255,0.3);border-radius:2px;overflow:hidden;">
              <div class="dnm-story-progress-fill" data-index="${i}" style="width:${i < currentStoryIndex ? '100%' : (i === currentStoryIndex ? '0%' : '0%')};height:100%;background:#FFF;border-radius:2px;transform-origin:left;transition:width 0.1s linear;"></div>
            </div>
          `).join('')}
        </div>

        <!-- Story Content -->
        <div class="dnm-story-content" id="dnm-story-content" style="width:100%;max-width:470px;height:100%;position:relative;">
          <img class="dnm-story-media" id="dnm-story-media" src="${story.mediaUrl}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;">
          <video class="dnm-story-video" id="dnm-story-video" src="${story.mediaUrl}" muted playsinline loop style="width:100%;height:100%;object-fit:contain;display:none;"></video>

          <!-- Top Info -->
          <div style="position:absolute;top:calc(env(safe-area-inset-top, 10px) + 50px);left:16px;right:16px;display:flex;align-items:center;justify-content:space-between;z-index:20;">
            <div style="display:flex;align-items:center;gap:8px;">
              <img src="${story.avatar}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #FFF;">
              <div>
                <div style="color:#FFF;font-weight:700;font-size:14px;text-shadow:0 1px 3px rgba(0,0,0,0.7);">${story.username}</div>
                <div style="color:rgba(255,255,255,0.7);font-size:11px;text-shadow:0 1px 3px rgba(0,0,0,0.7);">${formatTimeAgo(story.timestamp)}</div>
              </div>
            </div>
            <button type="button" id="dnm-story-close" style="background:none;border:none;color:#FFF;cursor:pointer;padding:8px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          </div>

          <!-- Bottom Reply Bar -->
          <div style="position:absolute;bottom:calc(env(safe-area-inset-bottom, 20px) + 16px);left:16px;right:16px;display:flex;align-items:center;gap:10px;z-index:20;">
            <form id="dnm-story-reply-form" style="flex:1;display:flex;gap:8px;">
              <input type="text" id="dnm-story-reply-input" placeholder="Send message..." style="flex:1;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:24px;padding:8px 16px;color:#FFF;font-size:14px;outline:none;">
              <button type="submit" style="background:none;border:none;color:#0095F6;font-weight:700;font-size:14px;padding:8px 12px;cursor:pointer;">Send</button>
            </form>
          </div>
        </div>

        <!-- Tap Zones -->
        <div class="dnm-story-tap-zone" id="dnm-tap-left" style="position:absolute;left:0;top:0;bottom:0;width:33%;z-index:15;"></div>
        <div class="dnm-story-tap-zone" id="dnm-tap-right" style="position:absolute;right:0;top:0;bottom:0;width:33%;z-index:15;"></div>
        <div class="dnm-story-tap-zone" id="dnm-tap-center" style="position:absolute;left:33%;right:33%;top:0;bottom:0;z-index:15;"></div>
      </div>
    `;
    document.body.appendChild(scrim);
    document.body.style.overflow = 'hidden';
    activeStoryViewer = scrim;

    const mediaImg = scrim.querySelector('#dnm-story-media');
    const mediaVid = scrim.querySelector('#dnm-story-video');
    const progressFills = scrim.querySelectorAll('.dnm-story-progress-fill');
    const closeBtn = scrim.querySelector('#dnm-story-close');
    const tapLeft = scrim.querySelector('#dnm-tap-left');
    const tapRight = scrim.querySelector('#dnm-tap-right');
    const tapCenter = scrim.querySelector('#dnm-tap-center');
    const replyForm = scrim.querySelector('#dnm-story-reply-form');
    const replyInput = scrim.querySelector('#dnm-story-reply-input');

    function updateProgress() {
      progressFills.forEach((fill, i) => {
        if (i < currentStoryIndex) {
          fill.style.width = '100%';
          fill.style.transition = 'none';
        } else if (i === currentStoryIndex) {
          fill.style.transition = 'width 0.1s linear';
        } else {
          fill.style.width = '0%';
          fill.style.transition = 'none';
        }
      });
    }

    function loadStory(index) {
      if (index < 0 || index >= stories.length) {
        closeStoryViewer();
        return;
      }
      currentStoryIndex = index;
      const story = stories[index];
      const isVideo = story.type === 'video' || story.mediaUrl?.startsWith('data:video') || story.mediaUrl?.includes('.mp4');

      if (isVideo) {
        mediaImg.style.display = 'none';
        mediaVid.style.display = 'block';
        mediaVid.src = story.mediaUrl;
        mediaVid.muted = false;
        mediaVid.play().catch(() => { mediaVid.muted = true; mediaVid.play(); });
      } else {
        mediaVid.pause();
        mediaVid.style.display = 'none';
        mediaImg.style.display = 'block';
        mediaImg.src = story.mediaUrl;
      }

      // Add view
      addStoryView(sourceType, sourceId, story.id);
      updateProgress();
      startProgressAnimation();
    }

    function startProgressAnimation() {
      if (storyProgressInterval) clearInterval(storyProgressInterval);
      const duration = 5000; // 5 seconds per story
      const startTime = Date.now();
      const fill = scrim.querySelector(`.dnm-story-progress-fill[data-index="${currentStoryIndex}"]`);

      storyProgressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / duration) * 100);
        if (fill) fill.style.width = progress + '%';
        if (progress >= 100) {
          nextStory();
        }
      }, 50);
    }

    function nextStory() {
      if (storyProgressInterval) clearInterval(storyProgressInterval);
      loadStory(currentStoryIndex + 1);
    }

    function prevStory() {
      if (storyProgressInterval) clearInterval(storyProgressInterval);
      loadStory(currentStoryIndex - 1);
    }

    function closeStoryViewer() {
      if (storyProgressInterval) clearInterval(storyProgressInterval);
      document.body.style.overflow = '';
      scrim.classList.remove('active');
      setTimeout(() => scrim.remove(), 250);
      activeStoryViewer = null;
    }

    // Tap handlers
    tapLeft.addEventListener('click', () => prevStory());
    tapRight.addEventListener('click', () => nextStory());
    tapCenter.addEventListener('click', () => {
      const vid = scrim.querySelector('#dnm-story-video');
      if (vid.style.display !== 'none') {
        if (vid.paused) vid.play(); else vid.pause();
      }
    });

    // Long press to pause progress
    let pressTimer = null;
    [tapLeft, tapRight, tapCenter].forEach(zone => {
      zone.addEventListener('touchstart', () => {
        if (storyProgressInterval) clearInterval(storyProgressInterval);
      }, { passive: true });
      zone.addEventListener('touchend', () => {
        startProgressAnimation();
      }, { passive: true });
    });

    closeBtn.addEventListener('click', closeStoryViewer);
    scrim.addEventListener('click', e => { if (e.target === scrim) closeStoryViewer(); });

    // Reply handling
    replyForm.addEventListener('submit', async e => {
      e.preventDefault();
      const text = replyInput.value.trim();
      if (!text) return;

      const user = window.DNM_AUTH.getCurrentUser();
      if (!user) {
        closeStoryViewer();
        window.DNM_AUTH.signInWithGoogle();
        return;
      }

      const reply = {
        userId: user.uid,
        username: user.username || user.displayName,
        avatar: user.photoURL,
        text,
        timestamp: Date.now()
      };

      story.replies = story.replies || [];
      story.replies.push(reply);

      // Save reply
      await saveStoryReply(sourceType, sourceId, story.id, reply);
      replyInput.value = '';
      if (window.DNM_FEED && window.DNM_FEED.showToast) {
        window.DNM_FEED.showToast('Reply sent!');
      }
    });

    // Keyboard navigation
    const onKeyDown = e => {
      if (e.key === 'ArrowLeft') prevStory();
      else if (e.key === 'ArrowRight') nextStory();
      else if (e.key === 'Escape') closeStoryViewer();
    };
    window.addEventListener('keydown', onKeyDown);

    // Store cleanup function
    scrim._cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      if (storyProgressInterval) clearInterval(storyProgressInterval);
    };

    loadStory(startIndex);
  }

  async function addStoryView(sourceType, sourceId, storyId) {
    try {
      const key = sourceType === 'user' ? 'user_stories' : 'client_stories';
      const stored = await window.DNM_STORAGE?.social?.get(key, {}) || {};
      const stories = stored[sourceId] || [];
      const story = stories.find(s => s.id === storyId);
      if (story) {
        const user = window.DNM_AUTH.getCurrentUser();
        const viewerId = user ? user.uid : 'anon_' + Math.random().toString(36).slice(2);
        if (!story.views.includes(viewerId)) {
          story.views.push(viewerId);
          await window.DNM_STORAGE?.social?.set(key, stored);
        }
      }
    } catch(_) {}
  }

  async function saveStoryReply(sourceType, sourceId, storyId, reply) {
    try {
      const key = sourceType === 'user' ? 'user_stories' : 'client_stories';
      const stored = await window.DNM_STORAGE?.social?.get(key, {}) || {};
      const stories = stored[sourceId] || [];
      const story = stories.find(s => s.id === storyId);
      if (story) {
        story.replies = story.replies || [];
        story.replies.push(reply);
        await window.DNM_STORAGE?.social?.set(key, stored);
      }
    } catch(_) {}
  }

  function formatTimeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  window.DNM_STORIES = {
    initStories,
    renderStoriesTray,
    openStoryViewer,
    openStoryCamera
  };

})(window);