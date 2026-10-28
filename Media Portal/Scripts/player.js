/**
 * Daynight-Media: Full-Screen Instagram-Grade Video Playback Modal
 * High-performance, zero-stutter video streaming engine with ambient blur,
 * gesture navigation, SPA history integration, and HLS.js adaptive bitrate streaming.
 */
(function(window) {
  'use strict';

  let activePlayerModal = null;
  let isSoundMuted = false;
  let hlsInstance = null;

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

    // Initialize HLS.js if available
    function initHls(videoElement, streamUrl) {
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }

      if (window.Hls && Hls.isSupported() && streamUrl && streamUrl.includes('.m3u8')) {
        hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1000 * 1000,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 3,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 3,
          maxFragLookUpTolerance: 0.25,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: Infinity,
          liveDurationInfinity: true,
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 3,
          manifestLoadingRetryDelay: 1000,
          levelLoadingTimeOut: 10000,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 1000,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 1000,
          fragLoadingLoopThreshold: 3,
          startFragPrefetch: true,
          appendErrorMaxRetry: 3,
          progressive: true
        });

        hlsInstance.loadSource(streamUrl);
        hlsInstance.attachMedia(videoElement);

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          console.log('[HLS] Manifest parsed, available qualities:', data.levels.map(l => l.height + 'p'));
          updateQualityOptions(data.levels);
        });

        hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
          console.log('[HLS] Quality switched to:', data.level);
          markActiveQuality(data.level);
        });

        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error('[HLS] Fatal error:', data);
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hlsInstance.recoverMediaError();
            } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hlsInstance.startLoad();
            } else {
              hlsInstance.destroy();
              hlsInstance = null;
              // Fallback to direct video playback
              videoElement.src = streamUrl;
              videoElement.load();
              videoElement.play().catch(() => {});
            }
          }
        });

        return true;
      }
      return false;
    }

    function updateQualityOptions(levels) {
      const sheet = document.querySelector('.dnm-bottom-sheet-scrim.active');
      if (!sheet) return;

      const options = sheet.querySelectorAll('.dnm-quality-option');
      options.forEach(btn => {
        const quality = btn.dataset.quality;
        if (quality === 'auto') return;
        const level = levels.find(l => l.height === parseInt(quality));
        btn.style.display = level ? 'flex' : 'none';
        if (level) {
          btn.querySelector('span').textContent = `${quality}p (${Math.round(level.bitrate / 1000)} kbps)`;
        }
      });
    }

    function markActiveQuality(activeLevel) {
      const sheet = document.querySelector('.dnm-bottom-sheet-scrim.active');
      if (!sheet) return;

      sheet.querySelectorAll('.dnm-quality-option').forEach(btn => {
        if (btn.dataset.quality === 'auto') return;
        const level = parseInt(btn.dataset.quality);
        if (level === activeLevel) {
          btn.classList.replace('dnm-btn-secondary', 'dnm-btn-primary');
        } else {
          btn.classList.replace('dnm-btn-primary', 'dnm-btn-secondary');
        }
      });
    }

    function switchQuality(levelIndex) {
      if (hlsInstance && hlsInstance.levels) {
        hlsInstance.currentLevel = levelIndex;
      }
    }

    async function renderModalContent() {
      const author = window.DNM_DATA.getAuthorInfo(currentReel);
      const isClient = author.isClient;
      const authorName = author.name;
      const authorHandle = author.handle;
      const authorAvatar = author.avatar;
      const mediaSrc = window.DNM_DATA.getMediaUrl ? window.DNM_DATA.getMediaUrl(currentReel) : window.DNM_DATA.getStreamUrl(currentReel);
      const streamUrl = window.DNM_DATA.getStreamUrl(currentReel);

      // Load liked/saved from StorageAdapter
      let likedPosts = [];
      let savedPosts = [];
      let followingUsers = [];
      try {
        likedPosts = await window.DNM_STORAGE?.social?.get('liked_posts', []) || [];
        savedPosts = await window.DNM_STORAGE?.social?.get('saved_posts', []) || [];
        followingUsers = await window.DNM_STORAGE?.social?.get('following_users', []) || [];
      } catch (_) {}
      const likesSet = new Set(likedPosts);
      const isLiked = likesSet.has(currentReel.id);
      const baseLikes = Number(currentReel.likes) || 0;
      const totalLikes = baseLikes + (isLiked ? 1 : 0);
      const savedSet = new Set(savedPosts);
      const isSaved = savedSet.has(currentReel.id);
      const isPhoto = window.DNM_DATA.isPhoto(currentReel);
      const isFollowing = followingUsers.includes(currentReel.authorId || currentReel.author || authorHandle);

      const currentUser = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;
      const userAvatar = currentUser?.photoURL || currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80';

      modalSc.innerHTML = `
        <div class="ig-player-wrapper" id="ig-wrapper">
          <!-- Ambient blurred backdrop -->
          <div class="ig-ambient-backdrop" id="ig-ambient" style="position:absolute;inset:0;background-image:url('${mediaSrc || currentReel.coverUrl || ''}');background-size:cover;background-position:center;filter:blur(30px) brightness(0.4);transform:scale(1.1);pointer-events:none;"></div>

          <!-- Vertical 9:16 Instagram Reels Card -->
          <div class="ig-reels-container" id="ig-container">
            
            <!-- Top Bar Pinned Directly Below Device Status Bar -->
            <div class="ig-top-bar" id="ig-top-bar">
              <!-- Left: Back Button -->
              <button type="button" class="ig-top-btn" id="ig-btn-back" title="Close" aria-label="Close" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px;display:flex;align-items:center;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
              </button>

              <!-- Center: Reels in Center -->
              <div class="ig-top-center-brand" style="position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;">
                <button type="button" class="ig-reels-dropdown-btn" id="ig-btn-reels-dropdown" aria-label="Reels menu" style="font-size:18px;font-weight:700;color:#FFF;display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;">
                  <span>${isPhoto ? 'Photos' : 'Reels'}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
              </div>

              <!-- Right: Settings (Quality) & Sound Buttons Only -->
              <div style="display:flex;align-items:center;gap:10px;">
                <button type="button" class="ig-top-btn" id="ig-btn-quality" title="Settings / Video Quality" aria-label="Settings" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px;display:${isPhoto ? 'none' : 'flex'};align-items:center;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </button>
                <button type="button" class="ig-top-btn" id="ig-btn-sound" title="Toggle Sound" aria-label="Toggle Sound" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px;display:${isPhoto ? 'none' : 'flex'};align-items:center;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" id="ig-sound-icon">
                    ${isSoundMuted
                      ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
                      : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>'}
                  </svg>
                </button>
              </div>
            </div>

            <!-- Video / Photo Player Wrap -->
            <div class="ig-video-wrap" id="ig-video-wrap" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <video id="ig-video" class="ig-video-player" src="${streamUrl}" playsinline webkit-playsinline autoplay loop preload="auto" poster="${mediaSrc || currentReel.coverUrl || ''}" style="width:100%;height:100%;object-fit:cover;display:${isPhoto ? 'none' : 'block'};"></video>
              <img id="ig-photo" class="ig-photo-player" src="${mediaSrc}" alt="" style="width:100%;height:100%;object-fit:cover;background:transparent;display:${isPhoto ? 'block' : 'none'};">
              
              <!-- Perfectly Centered Stable Buffering Spinner -->
              <div class="video-loading-circle ${isPhoto ? '' : 'active'}" id="ig-loading-circle">
                <svg class="v-spinner-svg" viewBox="0 0 50 50">
                  <circle class="v-spinner-path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
                </svg>
              </div>

              <!-- Central Play/Pause Flash (Centered in 9:16 Video Canvas) -->
              <div class="ig-play-flash" id="ig-play-flash" aria-hidden="true">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="#FFFFFF" id="ig-flash-icon"><polygon points="6 4 20 12 6 20 6 4"/></svg>
              </div>

              <!-- Double-Tap Heart Pop -->
              <div class="ig-heart-pop" id="ig-heart-pop" aria-hidden="true">
                <svg width="90" height="90" viewBox="0 0 24 24" fill="#FF3040"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              </div>
            </div>

            <!-- Right-Hand Action Stack matching Image -->
            <div class="ig-actions-stack" id="ig-actions-stack">
              <!-- Like Button -->
              <div class="ig-action-item">
                <button type="button" class="ig-action-btn" id="ig-btn-like" aria-label="Like">
                  <svg width="28" height="28" viewBox="0 0 24 24" id="ig-icon-like" fill="${isLiked ? '#FF3040' : 'none'}" stroke="${isLiked ? '#FF3040' : '#FFFFFF'}" stroke-width="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
                <span class="ig-action-count" id="ig-count-like">${totalLikes > 0 ? totalLikes.toLocaleString() : '1,926'}</span>
              </div>

              <!-- Comment Button -->
              <div class="ig-action-item">
                <button type="button" class="ig-action-btn" id="ig-btn-comment" aria-label="Comments">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </button>
                <span class="ig-action-count" id="ig-count-comment">${(currentReel.comments?.length || 718).toLocaleString()}</span>
              </div>

              <!-- Repost / Remix (Loop Arrows) -->
              <div class="ig-action-item">
                <button type="button" class="ig-action-btn" id="ig-btn-repost" aria-label="Repost">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                </button>
                <span class="ig-action-count" id="ig-count-repost">${(Number(currentReel.shares) || 54).toLocaleString()}</span>
              </div>

              <!-- Share Button -->
              <div class="ig-action-item">
                <button type="button" class="ig-action-btn" id="ig-btn-share" aria-label="Share">
                  <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
                <span class="ig-action-count" id="ig-count-share">${(Number(currentReel.views) || 2225).toLocaleString()}</span>
              </div>

              <!-- Save / Bookmark Action -->
              <div class="ig-action-item">
                <button type="button" class="ig-action-btn" id="ig-btn-bookmark" aria-label="Save">
                  <svg width="25" height="25" viewBox="0 0 24 24" id="ig-icon-bookmark" fill="${isSaved ? '#FFFFFF' : 'none'}" stroke="#FFFFFF" stroke-width="2.2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
                <span class="ig-action-count" id="ig-count-bookmark">${(isSaved ? 3508 : 3507).toLocaleString()}</span>
              </div>

              <!-- More Options Action -->
              <div class="ig-action-item">
                <button type="button" class="ig-action-btn" id="ig-btn-more" aria-label="More Options">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.2"/><circle cx="5" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg>
                </button>
              </div>

              <!-- Rotating Vinyl Disc -->
              <div class="dnm-vinyl-disc" style="width:30px;height:30px;border-radius:50%;border:2px solid #FFF;overflow:hidden;animation:dnmSpin 3s linear infinite;">
                <img id="ig-disc-avatar" src="${authorAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;">
              </div>
            </div>

            <!-- Bottom Left Info Overlay -->
            <div class="ig-meta-overlay" id="ig-meta-overlay">
              <div class="ig-profile-row" style="display:flex;align-items:center;gap:10px;">
                <div class="ig-avatar-ring" style="width:36px;height:36px;border-radius:50%;border:1.5px solid #FFF;overflow:hidden;flex-shrink:0;">
                  <img id="ig-overlay-avatar" src="${authorAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;">
                </div>
                <span id="ig-overlay-handle" style="font-weight:700;font-size:14px;color:#FFF;letter-spacing:-0.2px;">@${authorHandle}</span>
                ${isClient ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#0095F6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
                <button type="button" class="ig-reel-follow-btn ${isFollowing ? 'following' : ''}" id="ig-btn-follow">${isFollowing ? 'Following' : 'Follow'}</button>
              </div>
              <div class="ig-caption-box" id="ig-overlay-caption" style="font-size:13.5px;line-height:1.4;color:#FFF;text-shadow:0 1px 3px rgba(0,0,0,0.8);max-width:280px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
                <b>${currentReel.title || ''}</b>${currentReel.b && currentReel.b !== 'Community' ? ` &bull; ${currentReel.b}` : ''}
              </div>
              <div class="ig-audio-row" id="ig-overlay-audio" style="display:flex;align-items:center;gap:6px;font-size:12px;opacity:0.9;color:#FFF;margin-top:2px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                <span class="ig-audio-ticker-text">${authorHandle || 'author'} &bull; Original audio</span>
              </div>
            </div>

            <!-- Scrubber Timeline Bar pinned directly above navbar -->
            <div class="ig-scrubber-bar" id="ig-scrubber" style="display:${isPhoto ? 'none' : 'flex'};">
              <div class="ig-scrubber-track" style="width:100%;height:3px;background:rgba(255,255,255,0.32);position:relative;border-radius:2px;">
                <div class="ig-scrubber-fill" id="ig-scrubber-fill" style="height:100%;width:0%;background:#FFFFFF;border-radius:2px;position:relative;">
                  <div class="ig-scrubber-thumb-handle"></div>
                </div>
              </div>
            </div>

            <!-- Pinned Instagram Bottom Nav Bar (Home - Reels - DM - Search - Profile) -->
            <nav class="ig-player-bottom-nav" id="ig-player-bottom-nav">
              <!-- 1. Home Feed -->
              <button type="button" class="ig-player-nav-item" id="ig-nav-home" data-tab="feed" aria-label="Home Feed">
                <svg class="dnm-nav-icon icon-outline" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 23h-6.001a1 1 0 0 1-1-1v-5.455a2.545 2.545 0 1 0-5.09 0V22a1 1 0 0 1-1 1H2.909A1.91 1.91 0 0 1 1 21.09V10.8a1.9 1.9 0 0 1 .687-1.465l8.636-7.198a2.5 2.5 0 0 1 3.204 0l8.786 7.323A1.9 1.9 0 0 1 23 10.925v10.166A1.91 1.91 0 0 1 22 23Zm-5.001-2h4v-10.075l-8.545-7.123a.5.5 0 0 0-.641 0L3.272 10.925V21h4v-4.455a4.545 4.545 0 1 1 9.09 0V21Z"/></svg>
                <svg class="dnm-nav-icon icon-filled" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 23h-6.001a1 1 0 0 1-1-1v-5.455a2.545 2.545 0 1 0-5.09 0V22a1 1 0 0 1-1 1H2.909A1.91 1.91 0 0 1 1 21.09V10.8a1.9 1.9 0 0 1 .687-1.465l8.636-7.198a2.5 2.5 0 0 1 3.204 0l8.786 7.323A1.9 1.9 0 0 1 23 10.925v10.166A1.91 1.91 0 0 1 22 23Z"/></svg>
              </button>

              <!-- 2. Reels Tab -->
              <button type="button" class="ig-player-nav-item active" id="ig-nav-reels" data-tab="reels" aria-label="Video Reels">
                <svg class="dnm-nav-icon icon-outline" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 2H7.4C4.42 2 2 4.42 2 7.4v9.2C2 19.58 4.42 22 7.4 22h9.2c2.98 0 5.4-2.42 5.4-5.4V7.4C22 4.42 19.58 2 16.6 2ZM7.4 3.8h1.66l2.12 3.7H8.52L7.4 3.8Zm3.94 0h1.86l2.12 3.7h-2.66l-1.32-3.7Zm4.14 0h1.26c1.37 0 2.54.76 3.14 1.88l-1.9 3.32H16.8l-1.32-3.7ZM20.2 16.6c0 1.99-1.61 3.6-3.6 3.6H7.4c-1.99 0-3.6-1.61-3.6-3.6V9.3h16.4v7.3Zm-10.4-1.9 4.8-2.77-4.8-2.77v5.54Z"/></svg>
                <svg class="dnm-nav-icon icon-filled" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 2H7.4C4.42 2 2 4.42 2 7.4v9.2C2 19.58 4.42 22 7.4 22h9.2c2.98 0 5.4-2.42 5.4-5.4V7.4C22 4.42 19.58 2 16.6 2ZM7.4 3.8h1.66l2.12 3.7H8.52L7.4 3.8Zm3.94 0h1.86l2.12 3.7h-2.66l-1.32-3.7Zm4.14 0h1.26c1.37 0 2.54.76 3.14 1.88l-1.9 3.32H16.8l-1.32-3.7ZM20.2 16.6c0 1.99-1.61 3.6-3.6 3.6H7.4c-1.99 0-3.6-1.61-3.6-3.6V9.3h16.4v7.3Zm-10.4-1.9 4.8-2.77-4.8-2.77v5.54Z"/></svg>
              </button>

              <!-- 3. Direct Messages (DM) -->
              <button type="button" class="ig-player-nav-item" id="ig-nav-dm" data-tab="dm" aria-label="Direct Messages">
                <svg class="dnm-nav-icon icon-outline" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                <svg class="dnm-nav-icon icon-filled" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22.028 2.025a1.5 1.5 0 0 0-1.603-.311L2.44 9.69a1.5 1.5 0 0 0 .11 2.802l6.98 2.327 2.327 6.98a1.5 1.5 0 0 0 2.802.11l7.976-17.985a1.5 1.5 0 0 0-.607-1.899Z"/></svg>
              </button>

              <!-- 4. Search / Explore -->
              <button type="button" class="ig-player-nav-item" id="ig-nav-explore" data-tab="explore" aria-label="Search">
                <svg class="dnm-nav-icon icon-outline" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <svg class="dnm-nav-icon icon-filled" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 10.5A8.5 8.5 0 1 1 10.5 2a8.5 8.5 0 0 1 8.5 8.5Zm1.707 10.207-4.43-4.43a9.5 9.5 0 1 0-1.414 1.414l4.43 4.43a1 1 0 0 0 1.414-1.414Z"/></svg>
              </button>

              <!-- 5. Profile -->
              <button type="button" class="ig-player-nav-item" id="ig-nav-profile" data-tab="profile" aria-label="Profile">
                <div class="ig-player-avatar-wrap">
                  ${userAvatar ? `<img src="${userAvatar}" alt="Profile">` : `<svg class="dnm-nav-avatar-fallback" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`}
                </div>
              </button>
            </nav>

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
      // Clean up HLS instance
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      window.removeEventListener('popstate', onPopState);
      if (modalSc.parentNode) modalSc.remove();
      // Remove any lingering bottom sheets
      document.querySelectorAll('.dnm-bottom-sheet-scrim').forEach(s => s.remove());
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
      const topTitle = modalSc.querySelector('#ig-btn-reels-dropdown span');
      const moreBtn = modalSc.querySelector('#ig-btn-more');
      const followBtn = modalSc.querySelector('#ig-btn-follow');
      const repostBtn = modalSc.querySelector('#ig-btn-repost');
      const repostCount = modalSc.querySelector('#ig-count-repost');
      const commentCount = modalSc.querySelector('#ig-count-comment');
      const shareCount = modalSc.querySelector('#ig-count-share');
      const bookmarkCount = modalSc.querySelector('#ig-count-bookmark');

      async function syncReelUi() {
        const author = window.DNM_DATA.getAuthorInfo(currentReel);
        const isClient = author.isClient;
        const authorName = author.name;
        const authorHandle = author.handle;
        const authorAvatar = author.avatar;
        const isPhoto = currentReel.type === 'photo';
        const mediaSrc = window.DNM_DATA.getMediaUrl ? window.DNM_DATA.getMediaUrl(currentReel) : window.DNM_DATA.getStreamUrl(currentReel);
        const streamUrl = window.DNM_DATA.getStreamUrl(currentReel);

        if (ambient) ambient.style.backgroundImage = `url('${mediaSrc || currentReel.coverUrl || streamUrl || ''}')`;
        if (discAvatar) discAvatar.src = authorAvatar;
        if (overlayAvatar) overlayAvatar.src = authorAvatar;
        if (overlayHandle) overlayHandle.textContent = `@${authorHandle}`;
        if (overlayCaption) overlayCaption.innerHTML = `<b>${currentReel.title || ''}</b>${currentReel.b && currentReel.b !== 'Community' ? ` &bull; ${currentReel.b}` : ''}`;
        if (topTitle) topTitle.textContent = isPhoto ? 'Photos' : 'Reels';

        const audioTicker = modalSc.querySelector('#ig-overlay-audio .ig-audio-ticker-text');
        if (audioTicker) audioTicker.innerHTML = `${authorHandle || 'author'} &bull; Original audio`;

        // Load liked/saved/following from StorageAdapter
        let likedPosts = [];
        let savedPosts = [];
        let followingUsers = [];
        try {
          likedPosts = await window.DNM_STORAGE?.social?.get('liked_posts', []) || [];
          savedPosts = await window.DNM_STORAGE?.social?.get('saved_posts', []) || [];
          followingUsers = await window.DNM_STORAGE?.social?.get('following_users', []) || [];
        } catch (_) {}
        const likesSet = new Set(likedPosts);
        const isLiked = likesSet.has(currentReel.id);
        const baseLikes = Number(currentReel.likes) || 0;
        const totalLikes = baseLikes + (isLiked ? 1 : 0);
        if (likeIcon) {
          likeIcon.setAttribute('fill', isLiked ? '#FF3040' : 'none');
          likeIcon.setAttribute('stroke', isLiked ? '#FF3040' : '#FFFFFF');
        }
        if (likeCount) likeCount.textContent = totalLikes > 0 ? totalLikes.toLocaleString() : '1,926';

        const savedSet = new Set(savedPosts);
        const isSaved = savedSet.has(currentReel.id);
        if (bookmarkIcon) {
          bookmarkIcon.setAttribute('fill', isSaved ? '#FFFFFF' : 'none');
          bookmarkIcon.setAttribute('stroke', '#FFFFFF');
        }
        if (bookmarkCount) {
          bookmarkCount.textContent = (isSaved ? 3508 : 3507).toLocaleString();
        }

        if (repostCount) repostCount.textContent = (Number(currentReel.shares) || 54).toLocaleString();
        if (commentCount) commentCount.textContent = (currentReel.comments?.length || 718).toLocaleString();
        if (shareCount) shareCount.textContent = (Number(currentReel.views) || 2225).toLocaleString();

        if (followBtn) {
          const isFollowing = followingUsers.includes(currentReel.authorId || currentReel.author || authorHandle);
          if (isFollowing) {
            followBtn.textContent = 'Following';
            followBtn.classList.add('following');
          } else {
            followBtn.textContent = 'Follow';
            followBtn.classList.remove('following');
          }
        }

        if (scrubber) scrubber.style.display = isPhoto ? 'none' : 'block';
        if (soundBtn) soundBtn.style.display = isPhoto ? 'none' : 'flex';
        if (playFlash) {
          playFlash.style.display = isPhoto ? 'none' : 'flex';
          playFlash.classList.remove('active', 'pop');
        }

        if (isPhoto) {
          if (loader) loader.classList.remove('active');
          if (vid) {
            vid.style.display = 'none';
            try { vid.pause(); } catch(_) {}
            // Clean up HLS instance for photo
            if (hlsInstance) {
              hlsInstance.destroy();
              hlsInstance = null;
            }
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
            vid.poster = currentReel.coverUrl || '';
            vid.muted = isSoundMuted;

            // Reinitialize HLS for new reel
            if (hlsInstance) {
              hlsInstance.destroy();
              hlsInstance = null;
            }

            const isHls = initHls(vid, streamUrl);
            if (!isHls) {
              // Fallback to direct video playback
              vid.src = streamUrl;
              vid.load();
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

        // Auto Edge-to-Edge Cover (Eliminates black space top/bottom on tall smartphone screens)
        vid.addEventListener('loadedmetadata', () => {
          if (vid.videoWidth && vid.videoHeight && (vid.videoWidth / vid.videoHeight > 1.2)) {
            vid.classList.add('fit-mode');
            vid.style.objectFit = 'contain';
          } else {
            vid.classList.remove('fit-mode');
            vid.style.objectFit = 'cover';
          }
        });

        vid.muted = isSoundMuted;

        // Try HLS.js for adaptive streaming
        const streamUrl = window.DNM_DATA.getStreamUrl(currentReel);
        const isHls = initHls(vid, streamUrl);

        if (!isHls) {
          // Fallback to direct video playback
          vid.src = streamUrl;
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
        } else {
          // HLS.js initialized, play will be triggered by MANIFEST_PARSED
          vid.muted = isSoundMuted;
        }

        // Resilient Stream Auto-Retry (Exact Client Portal logic)
        let streamRetryAttempted = false;
        vid.addEventListener('error', () => {
          const fileId = currentReel.fileId || (currentReel.url ? (currentReel.url.match(/[-\w]{25,}/) || [])[0] : null);
          if (fileId && !streamRetryAttempted) {
            streamRetryAttempted = true;
            console.warn('Retrying video stream with fresh token and cache-bypass...');
            const retryUrl = `https://daynight-portal.pages.dev/api/video?id=${encodeURIComponent(fileId)}&t=${Date.now()}`;
            if (hlsInstance) {
              hlsInstance.destroy();
              hlsInstance = null;
            }
            initHls(vid, retryUrl);
            if (!hlsInstance) {
              vid.src = retryUrl;
              vid.load();
              vid.play().catch(e => console.log('Autoplay retry:', e));
            }
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

      // Video pause/play listeners for centered play icon
      if (vid && playFlash) {
        vid.addEventListener('pause', () => {
          if (currentReel.type !== 'photo') {
            flashIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
            playFlash.classList.remove('pop');
            playFlash.classList.add('active');
          }
        });

        vid.addEventListener('play', () => {
          if (currentReel.type !== 'photo') {
            playFlash.classList.remove('active');
            playFlash.classList.add('pop');
            setTimeout(() => {
              playFlash.classList.remove('pop');
            }, 360);
          }
        });
      }

      // Single tap play/pause & double tap heart pop
      let lastTap = 0;
      videoWrap?.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastTap < 320) {
          // Double-tap heart
          if (heartPop) {
            heartPop.classList.remove('active');
            void heartPop.offsetWidth;
            heartPop.classList.add('active');
            setTimeout(() => {
              heartPop.classList.remove('active');
            }, 550);
          }
          if (likeBtn) likeBtn.click();
        } else {
          // Single tap play/pause
          if (vid && currentReel.type !== 'photo') {
            if (vid.paused) {
              vid.play().catch(() => {});
            } else {
              vid.pause();
            }
          }
        }
        lastTap = now;
      });

      // Like toggle
      likeBtn?.addEventListener('click', async e => {
        e.stopPropagation();
        // Load current state from StorageAdapter
        try {
          const likedPosts = await window.DNM_STORAGE?.social?.get('liked_posts', []);
          const likesSet = new Set(likedPosts);
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
          // Persist to StorageAdapter & Cloud Firestore
          try {
            await window.DNM_STORAGE?.social?.set('liked_posts', Array.from(likesSet));
          } catch (_) {}
          if (window.DNM_FIREBASE && window.DNM_FIREBASE.incrementLike) {
            window.DNM_FIREBASE.incrementLike(currentReel.id, 1).catch(() => {});
          }
        } catch (_) {}
      });

      // Comment
      commentBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (window.DNM_FEED && window.DNM_FEED.openCommentsDrawer) {
          window.DNM_FEED.openCommentsDrawer(currentReel.id);
        }
      });

      // More Options - Official Instagram 3-Dot Bottom Sheet (Image 2)
      moreBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (window.DNM_UI && window.DNM_UI.openInstagramMoreMenu) {
          window.DNM_UI.openInstagramMoreMenu(currentReel, {
            onUpdate: (updatedPost) => {
              if (updatedPost) syncReelUi();
              else closeModal(true);
            },
            onDelete: () => closeModal(true)
          });
        } else if (window.DNM_MODALS && window.DNM_MODALS.openPostManagementModal) {
          window.DNM_MODALS.openPostManagementModal(currentReel, (updatedPost) => {
            if (!updatedPost) closeModal(true);
            else syncReelUi();
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
      bookmarkBtn?.addEventListener('click', async e => {
        e.stopPropagation();
        // Load current state from StorageAdapter
        try {
          const savedPosts = await window.DNM_STORAGE?.social?.get('saved_posts', []);
          const savedSet = new Set(savedPosts);
          const isSaved = savedSet.has(currentReel.id);
          if (isSaved) {
            savedSet.delete(currentReel.id);
            if (bookmarkIcon) {
              bookmarkIcon.setAttribute('fill', 'none');
              bookmarkIcon.setAttribute('stroke', '#FFFFFF');
            }
            if (bookmarkCount) bookmarkCount.textContent = '3,507';
            if (window.DNM_FEED && window.DNM_FEED.showToast) {
              window.DNM_FEED.showToast('Removed from Saved');
            }
          } else {
            savedSet.add(currentReel.id);
            if (bookmarkIcon) {
              bookmarkIcon.setAttribute('fill', '#FFFFFF');
              bookmarkIcon.setAttribute('stroke', '#FFFFFF');
            }
            if (bookmarkCount) bookmarkCount.textContent = '3,508';
            if (window.DNM_FEED && window.DNM_FEED.showToast) {
              window.DNM_FEED.showToast('Saved to your collection');
            }
          }
          // Persist to StorageAdapter & Cloud Firestore
          try {
            await window.DNM_STORAGE?.social?.set('saved_posts', Array.from(savedSet));
          } catch (_) {}
          if (window.DNM_FIREBASE && window.DNM_FIREBASE.toggleSave) {
            window.DNM_FIREBASE.toggleSave(currentReel.id, !isSaved).catch(() => {});
          }
        } catch (_) {}
      });

      // Repost toggle
      repostBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const count = parseInt(repostCount?.textContent?.replace(/,/g, '') || '54') || 54;
        repostBtn.style.transform = 'scale(1.2) rotate(180deg)';
        setTimeout(() => repostBtn.style.transform = 'none', 300);
        if (repostCount) repostCount.textContent = (count + 1).toLocaleString();
        if (window.DNM_FEED && window.DNM_FEED.showToast) {
          window.DNM_FEED.showToast('Reposted to your feed!');
        }
      });

      // Follow button toggle
      followBtn?.addEventListener('click', async e => {
        e.stopPropagation();
        let followingUsers = [];
        try {
          followingUsers = await window.DNM_STORAGE?.social?.get('following_users', []) || [];
        } catch (_) {}
        const author = window.DNM_DATA.getAuthorInfo(currentReel);
        const targetId = currentReel.authorId || currentReel.author || author.handle;
        const isFollowing = followingUsers.includes(targetId);
        if (isFollowing) {
          followingUsers = followingUsers.filter(id => id !== targetId);
          followBtn.textContent = 'Follow';
          followBtn.classList.remove('following');
          if (window.DNM_FEED && window.DNM_FEED.showToast) window.DNM_FEED.showToast(`Unfollowed @${author.handle}`);
        } else {
          followingUsers.push(targetId);
          followBtn.textContent = 'Following';
          followBtn.classList.add('following');
          if (window.DNM_FEED && window.DNM_FEED.showToast) window.DNM_FEED.showToast(`Following @${author.handle}`);
        }
        try {
          await window.DNM_STORAGE?.social?.set('following_users', followingUsers);
        } catch (_) {}
      });

      // Top brand header actions
      modalSc.querySelector('#ig-btn-reels-dropdown')?.addEventListener('click', e => {
        e.stopPropagation();
        if (window.DNM_FEED && window.DNM_FEED.showToast) {
          window.DNM_FEED.showToast('Viewing Reels feed');
        }
      });

      // Bottom Navigation click handlers (Home - Reels - DM - Search - Profile)
      modalSc.querySelector('#ig-nav-home')?.addEventListener('click', e => {
        e.stopPropagation();
        closeModal(true);
        if (window.DNM_APP && window.DNM_APP.switchTab) {
          window.DNM_APP.switchTab('feed');
        } else if (window.DNM_ROUTER && window.DNM_ROUTER.navigate) {
          window.DNM_ROUTER.navigate('feed');
        }
      });

      modalSc.querySelector('#ig-nav-reels')?.addEventListener('click', e => {
        e.stopPropagation();
        nextReel();
      });

      modalSc.querySelector('#ig-nav-dm')?.addEventListener('click', e => {
        e.stopPropagation();
        closeModal(true);
        if (window.DNM_MESSAGING && window.DNM_MESSAGING.openDMs) {
          window.DNM_MESSAGING.openDMs();
        }
      });

      modalSc.querySelector('#ig-nav-explore')?.addEventListener('click', e => {
        e.stopPropagation();
        closeModal(true);
        if (window.DNM_APP && window.DNM_APP.switchTab) {
          window.DNM_APP.switchTab('explore');
        } else if (window.DNM_ROUTER && window.DNM_ROUTER.navigate) {
          window.DNM_ROUTER.navigate('explore');
        }
      });

      modalSc.querySelector('#ig-nav-profile')?.addEventListener('click', e => {
        e.stopPropagation();
        closeModal(true);
        if (window.DNM_APP && window.DNM_APP.switchTab) {
          window.DNM_APP.switchTab('profile');
        } else if (window.DNM_ROUTER && window.DNM_ROUTER.navigate) {
          window.DNM_ROUTER.navigate('profile');
        }
      });

      // Quality Selector Bottom Sheet
      const qualityBtn = modalSc.querySelector('#ig-btn-quality');
      if (qualityBtn) {
        qualityBtn.addEventListener('click', e => {
          e.stopPropagation();
          openQualitySheet();
        });
      }

      function openQualitySheet() {
        // Remove any lingering quality sheets
        document.querySelectorAll('.dnm-quality-sheet-scrim').forEach(s => s.remove());

        const scrim = document.createElement('div');
        scrim.className = 'dnm-bottom-sheet-scrim dnm-quality-sheet-scrim';
        scrim.style.cssText = 'position:fixed!important;inset:0!important;z-index:200000!important;background:rgba(0,0,0,0.65)!important;backdrop-filter:blur(6px)!important;-webkit-backdrop-filter:blur(6px)!important;display:flex!important;align-items:flex-end!important;justify-content:center!important;opacity:0;transition:opacity 0.22s ease;';

        let savedQuality = 'auto';
        try {
          savedQuality = window.DNM_STORAGE?.config?.get('stream_quality') || localStorage.getItem('dnm_stream_quality') || 'auto';
        } catch (_) {}

        scrim.innerHTML = `
          <div class="dnm-bottom-sheet" style="position:fixed!important;bottom:0!important;left:50%!important;transform:translateX(-50%) translateY(100%);width:100%!important;max-width:470px!important;background:#18181b!important;color:#FFFFFF!important;border-top:1px solid rgba(255,255,255,0.15)!important;border-top-left-radius:20px!important;border-top-right-radius:20px!important;padding:12px 18px 28px!important;z-index:200001!important;box-shadow:0 -8px 30px rgba(0,0,0,0.6)!important;transition:transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)!important;box-sizing:border-box!important;">
            <div class="dnm-bottom-sheet-handle" style="width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,0.3);margin:0 auto 14px;"></div>
            <div class="dnm-bottom-sheet-header" style="display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);">
              <span class="dnm-bottom-sheet-title" style="font-size:16px;font-weight:700;color:#FFFFFF;letter-spacing:-0.2px;">Video Quality</span>
              <button type="button" class="dnm-bottom-sheet-close" id="dnm-quality-close" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:24px;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>
            </div>
            <div class="dnm-bottom-sheet-content" style="padding-top:14px;">
              <div style="display:flex;flex-direction:column;gap:10px;">
                <button type="button" class="dnm-btn dnm-quality-option ${savedQuality === 'auto' ? 'active' : ''}" data-quality="auto" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:13px 16px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${savedQuality === 'auto' ? '#0095F6' : 'rgba(255,255,255,0.12)'};background:${savedQuality === 'auto' ? 'rgba(0,149,246,0.15)' : 'rgba(255,255,255,0.06)'};color:${savedQuality === 'auto' ? '#0095F6' : '#FFFFFF'};">
                  <span>Auto (Recommended)</span>
                  <svg class="dnm-quality-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0095F6" stroke-width="2.5" style="display:${savedQuality === 'auto' ? 'block' : 'none'};"><path d="M20 6L9 17l-5-5"/></svg>
                </button>
                <button type="button" class="dnm-btn dnm-quality-option ${savedQuality === '1080' ? 'active' : ''}" data-quality="1080" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:13px 16px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${savedQuality === '1080' ? '#0095F6' : 'rgba(255,255,255,0.12)'};background:${savedQuality === '1080' ? 'rgba(0,149,246,0.15)' : 'rgba(255,255,255,0.06)'};color:${savedQuality === '1080' ? '#0095F6' : '#FFFFFF'};">
                  <span>1080p (HD)</span>
                  <svg class="dnm-quality-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0095F6" stroke-width="2.5" style="display:${savedQuality === '1080' ? 'block' : 'none'};"><path d="M20 6L9 17l-5-5"/></svg>
                </button>
                <button type="button" class="dnm-btn dnm-quality-option ${savedQuality === '720' ? 'active' : ''}" data-quality="720" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:13px 16px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${savedQuality === '720' ? '#0095F6' : 'rgba(255,255,255,0.12)'};background:${savedQuality === '720' ? 'rgba(0,149,246,0.15)' : 'rgba(255,255,255,0.06)'};color:${savedQuality === '720' ? '#0095F6' : '#FFFFFF'};">
                  <span>720p (High Definition)</span>
                  <svg class="dnm-quality-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0095F6" stroke-width="2.5" style="display:${savedQuality === '720' ? 'block' : 'none'};"><path d="M20 6L9 17l-5-5"/></svg>
                </button>
                <button type="button" class="dnm-btn dnm-quality-option ${savedQuality === '480' ? 'active' : ''}" data-quality="480" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:13px 16px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${savedQuality === '480' ? '#0095F6' : 'rgba(255,255,255,0.12)'};background:${savedQuality === '480' ? 'rgba(0,149,246,0.15)' : 'rgba(255,255,255,0.06)'};color:${savedQuality === '480' ? '#0095F6' : '#FFFFFF'};">
                  <span>480p (Standard)</span>
                  <svg class="dnm-quality-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0095F6" stroke-width="2.5" style="display:${savedQuality === '480' ? 'block' : 'none'};"><path d="M20 6L9 17l-5-5"/></svg>
                </button>
                <button type="button" class="dnm-btn dnm-quality-option ${savedQuality === '360' ? 'active' : ''}" data-quality="360" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:13px 16px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid ${savedQuality === '360' ? '#0095F6' : 'rgba(255,255,255,0.12)'};background:${savedQuality === '360' ? 'rgba(0,149,246,0.15)' : 'rgba(255,255,255,0.06)'};color:${savedQuality === '360' ? '#0095F6' : '#FFFFFF'};">
                  <span>360p (Data Saver)</span>
                  <svg class="dnm-quality-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0095F6" stroke-width="2.5" style="display:${savedQuality === '360' ? 'block' : 'none'};"><path d="M20 6L9 17l-5-5"/></svg>
                </button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(scrim);

        const sheetEl = scrim.querySelector('.dnm-bottom-sheet');
        requestAnimationFrame(() => {
          scrim.classList.add('active');
          scrim.style.opacity = '1';
          if (sheetEl) sheetEl.style.transform = 'translateX(-50%) translateY(0)';
        });

        const closeSheet = () => {
          if (sheetEl) sheetEl.style.transform = 'translateX(-50%) translateY(100%)';
          scrim.classList.remove('active');
          scrim.style.opacity = '0';
          setTimeout(() => scrim.remove(), 280);
        };

        scrim.addEventListener('click', e => { if (e.target === scrim) closeSheet(); });
        scrim.querySelector('#dnm-quality-close')?.addEventListener('click', closeSheet);

        scrim.querySelectorAll('.dnm-quality-option').forEach(btn => {
          btn.addEventListener('click', async () => {
            const quality = btn.dataset.quality;

            // Highlight selected option immediately
            scrim.querySelectorAll('.dnm-quality-option').forEach(b => {
              const isMatch = b.dataset.quality === quality;
              b.classList.toggle('active', isMatch);
              b.style.borderColor = isMatch ? '#0095F6' : 'rgba(255,255,255,0.12)';
              b.style.background = isMatch ? 'rgba(0,149,246,0.15)' : 'rgba(255,255,255,0.06)';
              b.style.color = isMatch ? '#0095F6' : '#FFFFFF';
              const chk = b.querySelector('.dnm-quality-check');
              if (chk) chk.style.display = isMatch ? 'block' : 'none';
            });

            try {
              if (window.DNM_STORAGE?.config?.set) {
                await window.DNM_STORAGE.config.set('stream_quality', quality);
              }
              localStorage.setItem('dnm_stream_quality', quality);
            } catch (_) {}

            if (quality === 'auto') {
              if (hlsInstance) hlsInstance.currentLevel = -1;
              if (window.DNM_FEED?.showToast) window.DNM_FEED.showToast('Quality set to Auto');
            } else {
              const levelIndex = hlsInstance?.levels?.findIndex(l => l.height === parseInt(quality));
              if (levelIndex !== undefined && levelIndex >= 0 && hlsInstance) {
                hlsInstance.currentLevel = levelIndex;
              }
              if (window.DNM_FEED?.showToast) window.DNM_FEED.showToast(`Quality set to ${quality}p`);
            }

            setTimeout(closeSheet, 180);
          });
        });
      }

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
