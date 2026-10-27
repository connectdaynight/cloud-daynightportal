/**
 * Daynight-Media: Full-Screen Instagram-Grade Video Playback Modal
 * High-performance, zero-stutter video streaming engine with ambient blur,
 * gesture navigation, and SPA history integration.
 */
(function(window) {
  'use strict';

  let activePlayerModal = null;
  let isSoundMuted = false;

  function openVideoPlaybackModal(reel, initialPlaylist) {
    if (!reel) return;

    // 1. Immediately halt all feed autoplay and abort background network downloads
    if (window.DNM_FEED && window.DNM_FEED.stopFeedAutoplay) {
      window.DNM_FEED.stopFeedAutoplay();
    }
    document.querySelectorAll('.dnm-feed-vid, .dnm-reel-video-element').forEach(v => {
      try {
        v.pause();
        v.muted = true;
      } catch(_) {}
    });

    let playlist = initialPlaylist && initialPlaylist.length ? initialPlaylist : window.DNM_DATA.getAllApprovedReels();
    if (!playlist || !playlist.length) playlist = [reel];

    let currentIndex = playlist.findIndex(x => x.id === reel.id);
    if (currentIndex === -1) {
      playlist.unshift(reel);
      currentIndex = 0;
    }

    let currentReel = playlist[currentIndex];

    // Remove existing modal if already open
    if (activePlayerModal) {
      try {
        const oldVid = activePlayerModal.querySelector('video');
        if (oldVid) { oldVid.pause(); oldVid.removeAttribute('src'); oldVid.load(); }
        activePlayerModal.remove();
      } catch(_) {}
      activePlayerModal = null;
    }

    // 2. SPA Browser History integration (prevents browser/mobile swipe from quitting the website)
    try {
      history.pushState({ dnmModal: 'video_player' }, '');
    } catch(_) {}

    const modalSc = document.createElement('div');
    modalSc.className = 'scrim video-modal-scrim';
    modalSc.id = 'dnm-video-player-modal';
    document.body.classList.add('has-modal');

    function onPopState(e) {
      if (activePlayerModal) {
        closeModal(false);
      }
    }
    window.addEventListener('popstate', onPopState);

    function renderModalContent() {
      const clientObj = (currentReel.c && currentReel.c !== 'community') ? window.DNM_DATA.getClient(currentReel.c) : null;
      const isClient = !!clientObj;
      const authorName = isClient ? clientObj.name : (currentReel.authorName || (currentReel.authorUsername ? '@' + currentReel.authorUsername : 'Creator'));
      const authorHandle = isClient ? clientObj.slug : (currentReel.authorUsername || 'creator');
      const authorAvatar = isClient ? (clientObj.logo || './Logo/logo.png?v=3.2') : (currentReel.authorAvatar || './Logo/logo.png?v=3.2');
      const mediaSrc = window.DNM_DATA.getMediaUrl ? window.DNM_DATA.getMediaUrl(currentReel) : window.DNM_DATA.getStreamUrl(currentReel);
      const streamUrl = window.DNM_DATA.getStreamUrl(currentReel);
      const likesSet = new Set(JSON.parse(localStorage.getItem('dnm_liked_posts') || '[]'));
      const isLiked = likesSet.has(currentReel.id);
      const baseLikes = Number(currentReel.likes) || 0;
      const totalLikes = baseLikes + (isLiked ? 1 : 0);
      const savedSet = new Set(JSON.parse(localStorage.getItem('dnm_saved_posts') || '[]'));
      const isSaved = savedSet.has(currentReel.id);
      const isPhoto = currentReel.type === 'photo';

      modalSc.innerHTML = `
        <div class="ig-player-wrapper" id="ig-wrapper" style="width:100%;height:100%;position:relative;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          <!-- Ambient blurred backdrop -->
          <div class="ig-ambient-backdrop" id="ig-ambient" style="position:absolute;inset:0;background-image:url('${mediaSrc || currentReel.coverUrl || ''}');background-size:cover;background-position:center;filter:blur(30px) brightness(0.4);transform:scale(1.1);pointer-events:none;"></div>

          <!-- Vertical 9:16 Instagram Reels Card -->
          <div class="ig-reels-container" id="ig-container" style="position:relative;width:100%;max-width:470px;height:100%;max-height:100dvh;display:flex;flex-direction:column;justify-content:space-between;background:#000;overflow:hidden;box-shadow:0 0 40px rgba(0,0,0,0.8);">
            
            <!-- Top Bar -->
            <div class="ig-top-bar" style="position:absolute;top:0;left:0;right:0;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top, 10px) + 12px) 16px 14px 16px;background:linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);">
              <button type="button" class="ig-top-btn" id="ig-btn-back" title="Close" aria-label="Close" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px;display:flex;align-items:center;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div class="ig-top-title" style="color:#FFF;font-weight:700;font-size:16px;letter-spacing:-0.2px;display:flex;align-items:center;gap:6px;">
                <span>${isPhoto ? 'Photo' : 'Reels'}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <button type="button" class="ig-top-btn" id="ig-btn-sound" title="Toggle Sound" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px;display:${isPhoto ? 'none' : 'flex'};align-items:center;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" id="ig-sound-icon">
                    ${isSoundMuted 
                      ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>' 
                      : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>'}
                  </svg>
                </button>
                <button type="button" class="ig-top-btn" id="ig-btn-more" title="More Options" aria-label="More Options" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px;display:flex;align-items:center;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
              </div>
            </div>

            <!-- Video / Photo Player Wrap -->
            <div class="ig-video-wrap" id="ig-video-wrap" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <video id="ig-video" class="ig-video-player" src="${streamUrl}" playsinline webkit-playsinline autoplay loop preload="auto" poster="${mediaSrc || currentReel.coverUrl || ''}" style="width:100%;height:100%;object-fit:cover;display:${isPhoto ? 'none' : 'block'};"></video>
              <img id="ig-photo" class="ig-photo-player" src="${mediaSrc}" alt="" style="width:100%;height:100%;object-fit:contain;background:#000;display:${isPhoto ? 'block' : 'none'};">
              
              <!-- Perfectly Centered Stable Buffering Spinner -->
              <div class="video-loading-circle ${isPhoto ? '' : 'active'}" id="ig-loading-circle">
                <svg class="v-spinner-svg" viewBox="0 0 50 50">
                  <circle class="v-spinner-path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
                </svg>
              </div>
            </div>

            <!-- Central Play/Pause Flash -->
            <div class="ig-play-flash" id="ig-play-flash" style="position:absolute;inset:0;margin:auto;width:64px;height:64px;border-radius:50%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.25s ease;">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="#FFFFFF" id="ig-flash-icon"><polygon points="6 4 20 12 6 20 6 4"/></svg>
            </div>

            <!-- Double-Tap Heart Pop -->
            <div class="ig-heart-pop" id="ig-heart-pop" style="position:absolute;inset:0;margin:auto;width:90px;height:90px;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(0.5);pointer-events:none;transition:all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
              <svg width="90" height="90" viewBox="0 0 24 24" fill="#FF3040"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>

            <!-- Right-Hand Action Stack -->
            <div class="ig-actions-stack" id="ig-actions-stack" style="position:absolute;right:14px;bottom:70px;z-index:20;display:flex;flex-direction:column;align-items:center;gap:16px;">
              <!-- Like Button -->
              <div class="ig-action-item" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                <button type="button" class="ig-action-btn" id="ig-btn-like" aria-label="Like" style="background:none;border:none;color:#FFF;cursor:pointer;padding:4px;">
                  <svg width="28" height="28" viewBox="0 0 24 24" id="ig-icon-like" fill="${isLiked ? '#FF3040' : 'none'}" stroke="${isLiked ? '#FF3040' : '#FFFFFF'}" stroke-width="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
                <span class="ig-action-count" id="ig-count-like" style="color:#FFF;font-size:11px;font-weight:600;">${totalLikes}</span>
              </div>

              <!-- Comment Button -->
              <div class="ig-action-item" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                <button type="button" class="ig-action-btn" id="ig-btn-comment" aria-label="Comments" style="background:none;border:none;color:#FFF;cursor:pointer;padding:4px;">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </button>
                <span class="ig-action-count" style="color:#FFF;font-size:11px;font-weight:600;">Comment</span>
              </div>

              <!-- Share Button -->
              <div class="ig-action-item" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                <button type="button" class="ig-action-btn" id="ig-btn-share" aria-label="Share" style="background:none;border:none;color:#FFF;cursor:pointer;padding:4px;">
                  <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
                <span class="ig-action-count" style="color:#FFF;font-size:11px;font-weight:600;">Share</span>
              </div>

              <!-- Save / Bookmark Action -->
              <div class="ig-action-item" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                <button type="button" class="ig-action-btn" id="ig-btn-bookmark" aria-label="Save" style="background:none;border:none;color:#FFF;cursor:pointer;padding:4px;">
                  <svg width="25" height="25" viewBox="0 0 24 24" id="ig-icon-bookmark" fill="${isSaved ? '#FFD700' : 'none'}" stroke="${isSaved ? '#FFD700' : '#FFFFFF'}" stroke-width="2.2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
                <span class="ig-action-count" id="ig-label-bookmark" style="color:#FFF;font-size:11px;font-weight:600;">${isSaved ? 'Saved' : 'Save'}</span>
              </div>

              <!-- Direct Download Action -->
              <div class="ig-action-item" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                <button type="button" class="ig-action-btn" id="ig-btn-player-dl" title="Download Master File" aria-label="Download" style="background:none;border:none;color:#FFF;cursor:pointer;padding:4px;">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 20h16"/></svg>
                </button>
                <span class="ig-action-count" style="color:#FFF;font-size:11px;font-weight:600;">Download</span>
              </div>

              <!-- Rotating Vinyl Disc -->
              <div class="dnm-vinyl-disc" style="width:30px;height:30px;border-radius:50%;border:2px solid #FFF;overflow:hidden;animation:dnmSpin 3s linear infinite;">
                <img id="ig-disc-avatar" src="${authorAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;">
              </div>
            </div>

            <!-- Bottom Left Info Overlay -->
            <div class="ig-meta-overlay" id="ig-meta-overlay" style="position:absolute;left:16px;bottom:24px;right:80px;z-index:20;display:flex;flex-direction:column;gap:8px;color:#FFF;">
              <div class="ig-profile-row" style="display:flex;align-items:center;gap:10px;">
                <div class="ig-avatar-ring" style="width:36px;height:36px;border-radius:50%;border:2px solid #FFF;overflow:hidden;flex-shrink:0;">
                  <img id="ig-overlay-avatar" src="${authorAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;">
                </div>
                <span id="ig-overlay-handle" style="font-weight:700;font-size:14px;color:#FFF;">@${authorHandle}</span>
                ${isClient ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#0095F6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
              </div>
              <div class="ig-caption-box" id="ig-overlay-caption" style="font-size:13px;line-height:1.4;color:#FFF;text-shadow:0 1px 3px rgba(0,0,0,0.8);">
                <b>${currentReel.title || ''}</b>${currentReel.b ? ` &bull; ${currentReel.b}` : ''}
              </div>
            </div>

            <!-- Scrubber Timeline Bar -->
            <div class="ig-scrubber-bar" id="ig-scrubber" style="position:absolute;bottom:0;left:0;right:0;height:4px;background:rgba(255,255,255,0.25);cursor:pointer;z-index:25;display:${isPhoto ? 'none' : 'block'};">
              <div class="ig-scrubber-fill" id="ig-scrubber-fill" style="width:0%;height:100%;background:#FFF;transition:width 0.1s linear;"></div>
            </div>

          </div>
        </div>
      `;

      attachModalEvents();
    }

    function closeModal(shouldPopHistory = true) {
      const vid = modalSc.querySelector('#ig-video');
      if (vid) {
        try {
          vid.pause();
          vid.removeAttribute('src');
          vid.load();
        } catch(_) {}
      }
      window.removeEventListener('popstate', onPopState);
      if (modalSc.parentNode) modalSc.remove();
      activePlayerModal = null;
      document.body.classList.remove('has-modal');

      // Reconnect feed autoplay
      if (window.DNM_FEED && window.DNM_FEED.initFeedAutoplay) {
        window.DNM_FEED.initFeedAutoplay();
      }

      if (shouldPopHistory && history.state && history.state.dnmModal === 'video_player') {
        try { history.back(); } catch(_) {}
      }
    }

    function attachModalEvents() {
      const vid = modalSc.querySelector('#ig-video');
      const photoImg = modalSc.querySelector('#ig-photo');
      const loader = modalSc.querySelector('#ig-loading-circle');
      const scrubberFill = modalSc.querySelector('#ig-scrubber-fill');
      const scrubber = modalSc.querySelector('#ig-scrubber');
      const soundBtn = modalSc.querySelector('#ig-btn-sound');
      const soundIcon = modalSc.querySelector('#ig-sound-icon');
      const playFlash = modalSc.querySelector('#ig-play-flash');
      const flashIcon = modalSc.querySelector('#ig-flash-icon');
      const heartPop = modalSc.querySelector('#ig-heart-pop');
      const likeBtn = modalSc.querySelector('#ig-btn-like');
      const likeIcon = modalSc.querySelector('#ig-icon-like');
      const likeCount = modalSc.querySelector('#ig-count-like');
      const bookmarkBtn = modalSc.querySelector('#ig-btn-bookmark');
      const bookmarkIcon = modalSc.querySelector('#ig-icon-bookmark');
      const bookmarkLabel = modalSc.querySelector('#ig-label-bookmark');
      const backBtn = modalSc.querySelector('#ig-btn-back');
      const commentBtn = modalSc.querySelector('#ig-btn-comment');
      const shareBtn = modalSc.querySelector('#ig-btn-share');
      const dlBtn = modalSc.querySelector('#ig-btn-player-dl');
      const videoWrap = modalSc.querySelector('#ig-video-wrap');
      const ambient = modalSc.querySelector('#ig-ambient');
      const discAvatar = modalSc.querySelector('#ig-disc-avatar');
      const overlayAvatar = modalSc.querySelector('#ig-overlay-avatar');
      const overlayHandle = modalSc.querySelector('#ig-overlay-handle');
      const overlayCaption = modalSc.querySelector('#ig-overlay-caption');
      const topTitle = modalSc.querySelector('.ig-top-title span');
      const moreBtn = modalSc.querySelector('#ig-btn-more');

      function syncReelUi() {
        const clientObj = (currentReel.c && currentReel.c !== 'community') ? window.DNM_DATA.getClient(currentReel.c) : null;
        const isClient = !!clientObj;
        const authorName = isClient ? clientObj.name : (currentReel.authorName || (currentReel.authorUsername ? '@' + currentReel.authorUsername : 'Creator'));
        const authorHandle = isClient ? clientObj.slug : (currentReel.authorUsername || 'creator');
        const authorAvatar = isClient ? (clientObj.logo || './Logo/logo.png?v=3.2') : (currentReel.authorAvatar || './Logo/logo.png?v=3.2');
        const isPhoto = currentReel.type === 'photo';
        const mediaSrc = window.DNM_DATA.getMediaUrl ? window.DNM_DATA.getMediaUrl(currentReel) : window.DNM_DATA.getStreamUrl(currentReel);
        const streamUrl = window.DNM_DATA.getStreamUrl(currentReel);

        if (ambient) ambient.style.backgroundImage = `url('${mediaSrc || currentReel.coverUrl || streamUrl || ''}')`;
        if (discAvatar) discAvatar.src = authorAvatar;
        if (overlayAvatar) overlayAvatar.src = authorAvatar;
        if (overlayHandle) overlayHandle.textContent = `@${authorHandle}`;
        if (overlayCaption) overlayCaption.innerHTML = `<b>${currentReel.title || ''}</b>${currentReel.b && currentReel.b !== 'Community' ? ` &bull; ${currentReel.b}` : ''}`;
        if (topTitle) topTitle.textContent = isPhoto ? 'Photo' : 'Reels';

        const likesSet = new Set(JSON.parse(localStorage.getItem('dnm_liked_posts') || '[]'));
        const isLiked = likesSet.has(currentReel.id);
        const baseLikes = Number(currentReel.likes) || 0;
        if (likeIcon) {
          likeIcon.setAttribute('fill', isLiked ? '#FF3040' : 'none');
          likeIcon.setAttribute('stroke', isLiked ? '#FF3040' : '#FFFFFF');
        }
        if (likeCount) likeCount.textContent = baseLikes + (isLiked ? 1 : 0);

        const savedSet = new Set(JSON.parse(localStorage.getItem('dnm_saved_posts') || '[]'));
        const isSaved = savedSet.has(currentReel.id);
        if (bookmarkIcon) {
          bookmarkIcon.setAttribute('fill', isSaved ? '#FFD700' : 'none');
          bookmarkIcon.setAttribute('stroke', isSaved ? '#FFD700' : '#FFFFFF');
        }
        if (bookmarkLabel) {
          bookmarkLabel.textContent = isSaved ? 'Saved' : 'Save';
        }

        if (scrubber) scrubber.style.display = isPhoto ? 'none' : 'block';
        if (soundBtn) soundBtn.style.display = isPhoto ? 'none' : 'flex';

        if (isPhoto) {
          if (loader) loader.classList.remove('active');
          if (vid) {
            vid.style.display = 'none';
            try { vid.pause(); } catch(_) {}
          }
          if (photoImg) {
            photoImg.style.display = 'block';
            photoImg.src = currentReel.coverUrl || streamUrl;
          }
        } else {
          if (photoImg) photoImg.style.display = 'none';
          if (vid) {
            vid.style.display = 'block';
            loader?.classList.add('active');
            vid.src = streamUrl;
            vid.poster = currentReel.coverUrl || '';
            vid.muted = isSoundMuted;
            const p = vid.play();
            if (p !== undefined) {
              p.catch(() => {
                vid.muted = true;
                isSoundMuted = true;
                if (soundIcon) {
                  soundIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
                }
                vid.play().catch(() => {});
              });
            }
          }
        }
      }

      // Loader listeners (stays stable and centered)
      if (vid && loader) {
        loader.classList.add('active');
        const hideLoader = () => loader.classList.remove('active');
        const showLoader = () => loader.classList.add('active');

        vid.addEventListener('loadstart', showLoader);
        vid.addEventListener('waiting', showLoader);
        vid.addEventListener('seeking', showLoader);
        vid.addEventListener('canplay', hideLoader);
        vid.addEventListener('playing', hideLoader);
        vid.addEventListener('seeked', hideLoader);

        vid.muted = isSoundMuted;

        const p = vid.play();
        if (p !== undefined) {
          p.catch(() => {
            vid.muted = true;
            isSoundMuted = true;
            if (soundIcon) {
              soundIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
            }
            vid.play().catch(() => {});
          });
        }

        // Resilient Stream Auto-Retry (Exact Client Portal logic)
        let streamRetryAttempted = false;
        vid.addEventListener('error', () => {
          const fileId = currentReel.fileId || (currentReel.url ? (currentReel.url.match(/[-\w]{25,}/) || [])[0] : null);
          if (fileId && !streamRetryAttempted) {
            streamRetryAttempted = true;
            console.warn('Retrying video stream with fresh token and cache-bypass...');
            vid.src = `https://daynight-portal.pages.dev/api/video?id=${encodeURIComponent(fileId)}&t=${Date.now()}`;
            vid.load();
            vid.play().catch(e => console.log('Autoplay retry:', e));
          }
        });

        // Live Scrubber Progress
        vid.addEventListener('timeupdate', () => {
          if (vid.duration) {
            const pct = (vid.currentTime / vid.duration) * 100;
            if (scrubberFill) scrubberFill.style.width = pct + '%';
          }
        });
      }

      // Scrubber Seek
      if (scrubber && vid) {
        scrubber.addEventListener('click', e => {
          const rect = scrubber.getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          if (vid.duration) {
            vid.currentTime = pos * vid.duration;
          }
        });
      }

      // Back Button inside modal
      backBtn?.addEventListener('click', () => {
        closeModal(true);
      });

      // Sound toggle
      soundBtn?.addEventListener('click', e => {
        e.stopPropagation();
        isSoundMuted = !isSoundMuted;
        if (vid) vid.muted = isSoundMuted;
        soundIcon.innerHTML = isSoundMuted
          ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
          : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
      });

      // Single tap play/pause & double tap heart pop
      let lastTap = 0;
      videoWrap?.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastTap < 320) {
          // Double-tap heart
          if (heartPop) {
            heartPop.style.opacity = '1';
            heartPop.style.transform = 'scale(1.2)';
            setTimeout(() => {
              heartPop.style.opacity = '0';
              heartPop.style.transform = 'scale(0.5)';
            }, 550);
          }
          if (likeBtn) likeBtn.click();
        } else {
          // Single tap play/pause
          if (vid) {
            if (vid.paused) {
              vid.play().catch(() => {});
              if (playFlash) {
                flashIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
                playFlash.style.opacity = '1';
                setTimeout(() => playFlash.style.opacity = '0', 350);
              }
            } else {
              vid.pause();
              if (playFlash) {
                flashIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
                playFlash.style.opacity = '1';
                setTimeout(() => playFlash.style.opacity = '0', 350);
              }
            }
          }
        }
        lastTap = now;
      });

      // Like toggle
      likeBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const likesSet = new Set(JSON.parse(localStorage.getItem('dnm_liked_posts') || '[]'));
        const baseLikes = Number(currentReel.likes) || 0;
        if (likesSet.has(currentReel.id)) {
          likesSet.delete(currentReel.id);
          likeIcon.setAttribute('fill', 'none');
          likeIcon.setAttribute('stroke', '#FFFFFF');
          likeCount.textContent = baseLikes;
        } else {
          likesSet.add(currentReel.id);
          likeIcon.setAttribute('fill', '#FF3040');
          likeIcon.setAttribute('stroke', '#FF3040');
          likeCount.textContent = baseLikes + 1;
        }
        localStorage.setItem('dnm_liked_posts', JSON.stringify(Array.from(likesSet)));
      });

      // Comment
      commentBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (window.DNM_FEED && window.DNM_FEED.showToast) {
          window.DNM_FEED.showToast('Comments drawer available from feed');
        }
      });

      // More Options (Manage Post: Edit, Hide, Delete, Share)
      moreBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (window.DNM_MODALS && window.DNM_MODALS.openPostManagementModal) {
          window.DNM_MODALS.openPostManagementModal(currentReel, (updatedPost) => {
            if (!updatedPost) {
              // Post was deleted
              closeModal(true);
            } else {
              // Post was updated or toggled
              syncReelUi();
            }
          });
        }
      });

      // Share
      shareBtn?.addEventListener('click', async e => {
        e.stopPropagation();
        const url = window.location.origin + '/?post=' + currentReel.id;
        if (navigator.share) {
          try {
            await navigator.share({ title: currentReel.title, url: url });
            return;
          } catch(_) {}
        }
        try {
          await navigator.clipboard.writeText(url);
          if (window.DNM_FEED) window.DNM_FEED.showToast('Link copied to clipboard!');
        } catch(_) {}
      });

      // Bookmark / Save toggle
      bookmarkBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const savedSet = new Set(JSON.parse(localStorage.getItem('dnm_saved_posts') || '[]'));
        const isSaved = savedSet.has(currentReel.id);
        if (isSaved) {
          savedSet.delete(currentReel.id);
          if (bookmarkIcon) {
            bookmarkIcon.setAttribute('fill', 'none');
            bookmarkIcon.setAttribute('stroke', '#FFFFFF');
          }
          if (bookmarkLabel) bookmarkLabel.textContent = 'Save';
          if (window.DNM_FEED && window.DNM_FEED.showToast) {
            window.DNM_FEED.showToast('Removed from Saved');
          }
        } else {
          savedSet.add(currentReel.id);
          if (bookmarkIcon) {
            bookmarkIcon.setAttribute('fill', '#FFD700');
            bookmarkIcon.setAttribute('stroke', '#FFD700');
          }
          if (bookmarkLabel) bookmarkLabel.textContent = 'Saved';
          if (window.DNM_FEED && window.DNM_FEED.showToast) {
            window.DNM_FEED.showToast('Saved to your collection');
          }
        }
        localStorage.setItem('dnm_saved_posts', JSON.stringify(Array.from(savedSet)));
      });

      // Download Master File (MP4 or Image)
      dlBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const isPhoto = currentReel.type === 'photo';
        const downloadUrl = isPhoto ? (currentReel.coverUrl || currentReel.mediaUrl || currentReel.url) : window.DNM_DATA.getStreamUrl(currentReel);
        const ext = isPhoto ? 'jpg' : 'mp4';
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${(currentReel.title || 'media').replace(/[^a-z0-9]/gi, '_')}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });

      // Smooth Reel Navigation
      function nextReel() {
        if (currentIndex < playlist.length - 1) {
          currentIndex++;
          currentReel = playlist[currentIndex];
          syncReelUi();
        }
      }
      function prevReel() {
        if (currentIndex > 0) {
          currentIndex--;
          currentReel = playlist[currentIndex];
          syncReelUi();
        }
      }

      // Touch swipe gestures
      let touchStartY = 0;
      modalSc.addEventListener('touchstart', e => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      modalSc.addEventListener('touchend', e => {
        const touchEndY = e.changedTouches[0].clientY;
        const diff = touchStartY - touchEndY;
        if (diff > 55) {
          nextReel(); // Swiped UP to next reel
        } else if (diff < -55) {
          prevReel(); // Swiped DOWN to previous reel
        }
      }, { passive: true });

      // Keyboard arrow keys
      const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') { nextReel(); }
        else if (e.key === 'ArrowUp') { prevReel(); }
        else if (e.key === 'Escape') { closeModal(true); }
      };
      window.addEventListener('keydown', onKeyDown);
    }

    document.body.appendChild(modalSc);
    activePlayerModal = modalSc;
    renderModalContent();
  }

  window.DNM_PLAYER = {
    openVideoPlaybackModal
  };

})(window);
