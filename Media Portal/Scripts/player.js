/**
 * Daynight-Media: Full-Screen Instagram-Grade Video Playback Modal
 * Directly adapted from Client Portal's openVideoModal engine
 */
(function(window) {
  'use strict';

  let activePlayerModal = null;
  let isSoundMuted = false;

  function openVideoPlaybackModal(reel, initialPlaylist) {
    if (!reel) return;

    // Pause all background feed videos and audio
    document.querySelectorAll('.dnm-feed-vid, .dnm-reel-video-element').forEach(v => {
      try { v.pause(); v.muted = true; } catch(_) {}
    });

    let playlist = initialPlaylist && initialPlaylist.length ? initialPlaylist : window.DNM_DATA.getAllApprovedReels();
    if (!playlist || !playlist.length) playlist = [reel];

    let currentIndex = playlist.findIndex(x => x.id === reel.id);
    if (currentIndex === -1) {
      playlist.unshift(reel);
      currentIndex = 0;
    }

    let currentReel = playlist[currentIndex];

    // Remove existing modal if open
    if (activePlayerModal) {
      activePlayerModal.remove();
      activePlayerModal = null;
    }

    const modalSc = document.createElement('div');
    modalSc.className = 'scrim video-modal-scrim';
    modalSc.id = 'dnm-video-player-modal';

    function renderModalContent() {
      const isClient = !!currentReel.c;
      const clientObj = isClient ? window.DNM_DATA.getClient(currentReel.c) : null;
      const authorName = isClient ? (clientObj ? clientObj.name : 'Brand') : (currentReel.authorName || 'Creator');
      const authorHandle = isClient ? (clientObj ? clientObj.slug : 'brand') : (currentReel.authorUsername || 'creator');
      const authorAvatar = isClient ? (clientObj ? clientObj.logo : './Logo/logo.png?v=2.2') : (currentReel.authorAvatar || './Logo/logo.png?v=2.2');
      const streamUrl = window.DNM_DATA.getStreamUrl(currentReel);
      const likesSet = new Set(JSON.parse(localStorage.getItem('dnm_liked_posts') || '[]'));
      const isLiked = likesSet.has(currentReel.id);
      const baseLikes = Number(currentReel.likes) || 0;
      const totalLikes = baseLikes + (isLiked ? 1 : 0);

      modalSc.innerHTML = `
        <div class="ig-player-wrapper" id="ig-wrapper" style="width:100%;height:100%;position:relative;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          <!-- Ambient blurred backdrop -->
          <div class="ig-ambient-backdrop" id="ig-ambient" style="position:absolute;inset:0;background-image:url('${currentReel.coverUrl || ''}');background-size:cover;background-position:center;filter:blur(30px) brightness(0.4);transform:scale(1.1);pointer-events:none;"></div>

          <!-- Vertical 9:16 Instagram Reels Card -->
          <div class="ig-reels-container" id="ig-container" style="position:relative;width:100%;max-width:470px;height:100%;max-height:100dvh;display:flex;flex-direction:column;justify-content:space-between;background:#000;overflow:hidden;box-shadow:0 0 40px rgba(0,0,0,0.8);">
            
            <!-- Top Bar -->
            <div class="ig-top-bar" style="position:absolute;top:0;left:0;right:0;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top, 10px) + 10px) 16px 14px 16px;background:linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);">
              <button type="button" class="ig-top-btn" id="ig-btn-back" title="Close" aria-label="Close" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px;display:flex;align-items:center;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div class="ig-top-title" style="color:#FFF;font-weight:700;font-size:16px;letter-spacing:-0.2px;display:flex;align-items:center;gap:6px;">
                <span>Reels</span>
              </div>
              <button type="button" class="ig-top-btn" id="ig-btn-sound" title="Toggle Sound" style="background:none;border:none;color:#FFF;cursor:pointer;padding:6px;display:flex;align-items:center;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" id="ig-sound-icon">
                  ${isSoundMuted 
                    ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>' 
                    : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>'}
                </svg>
              </button>
            </div>

            <!-- Video Player Wrap -->
            <div class="ig-video-wrap" id="ig-video-wrap" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <video id="ig-video" class="ig-video-player" src="${streamUrl}" playsinline loop preload="auto" poster="${currentReel.coverUrl || ''}" style="width:100%;height:100%;object-fit:cover;"></video>
              <div class="video-loading-circle active" id="ig-loading-circle" style="position:absolute;inset:0;margin:auto;width:44px;height:44px;border:3px solid rgba(255,255,255,0.25);border-top-color:#0095F6;border-radius:50%;animation:dnmSpin 0.8s linear infinite;pointer-events:none;"></div>
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

              <!-- Direct Download MP4 Action -->
              <div class="ig-action-item" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                <button type="button" class="ig-action-btn" id="ig-btn-player-dl" title="Download Master MP4" aria-label="Download" style="background:none;border:none;color:#FFF;cursor:pointer;padding:4px;">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 20h16"/></svg>
                </button>
                <span class="ig-action-count" style="color:#FFF;font-size:11px;font-weight:600;">Save</span>
              </div>

              <!-- Rotating Vinyl Disc -->
              <div class="dnm-vinyl-disc" style="width:30px;height:30px;border-radius:50%;border:2px solid #FFF;overflow:hidden;animation:dnmSpin 3s linear infinite;">
                <img src="${authorAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;">
              </div>
            </div>

            <!-- Bottom Left Info Overlay -->
            <div class="ig-meta-overlay" id="ig-meta-overlay" style="position:absolute;left:16px;bottom:24px;right:80px;z-index:20;display:flex;flex-direction:column;gap:8px;color:#FFF;">
              <div class="ig-profile-row" style="display:flex;align-items:center;gap:10px;">
                <div class="ig-avatar-ring" style="width:36px;height:36px;border-radius:50%;border:2px solid #FFF;overflow:hidden;flex-shrink:0;">
                  <img src="${authorAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;">
                </div>
                <span style="font-weight:700;font-size:14px;color:#FFF;">@${authorHandle}</span>
                ${isClient ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#0095F6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
              </div>
              <div class="ig-caption-box" style="font-size:13px;line-height:1.4;color:#FFF;text-shadow:0 1px 3px rgba(0,0,0,0.8);">
                <b>${currentReel.title || ''}</b>${currentReel.b ? ` &bull; ${currentReel.b}` : ''}
              </div>
            </div>

            <!-- Scrubber Timeline Bar -->
            <div class="ig-scrubber-bar" id="ig-scrubber" style="position:absolute;bottom:0;left:0;right:0;height:4px;background:rgba(255,255,255,0.25);cursor:pointer;z-index:25;">
              <div class="ig-scrubber-fill" id="ig-scrubber-fill" style="width:0%;height:100%;background:#FFF;transition:width 0.1s linear;"></div>
            </div>

            <!-- Prev / Next Reel Navigation Buttons (Desktop) -->
            <div style="position:absolute;right:14px;top:45%;display:flex;flex-direction:column;gap:8px;z-index:25;">
              <button type="button" id="ig-nav-up" title="Previous Reel" aria-label="Previous" style="background:rgba(0,0,0,0.5);border:none;border-radius:50%;width:36px;height:36px;color:#FFF;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button type="button" id="ig-nav-down" title="Next Reel" aria-label="Next" style="background:rgba(0,0,0,0.5);border:none;border-radius:50%;width:36px;height:36px;color:#FFF;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>

          </div>
        </div>
      `;

      attachModalEvents();
    }

    function attachModalEvents() {
      const vid = modalSc.querySelector('#ig-video');
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
      const backBtn = modalSc.querySelector('#ig-btn-back');
      const navUp = modalSc.querySelector('#ig-nav-up');
      const navDown = modalSc.querySelector('#ig-nav-down');
      const commentBtn = modalSc.querySelector('#ig-btn-comment');
      const shareBtn = modalSc.querySelector('#ig-btn-share');
      const dlBtn = modalSc.querySelector('#ig-btn-player-dl');
      const videoWrap = modalSc.querySelector('#ig-video-wrap');

      // Loader listeners
      if (vid && loader) {
        vid.muted = isSoundMuted;
        vid.addEventListener('waiting', () => loader.style.display = 'block');
        vid.addEventListener('seeking', () => loader.style.display = 'block');
        vid.addEventListener('canplay', () => loader.style.display = 'none');
        vid.addEventListener('playing', () => loader.style.display = 'none');

        // Start playback immediately
        vid.play().catch(() => {
          vid.muted = true;
          vid.play().catch(() => {});
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

      // Close modal
      function closeModal() {
        if (vid) {
          try { vid.pause(); } catch(_) {}
        }
        modalSc.remove();
        activePlayerModal = null;
      }
      backBtn?.addEventListener('click', closeModal);

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

      // Download
      dlBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const downloadUrl = window.DNM_DATA.getStreamUrl(currentReel);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${(currentReel.title || 'reel').replace(/[^a-z0-9]/gi, '_')}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });

      // Navigation (Up / Down)
      function nextReel() {
        if (currentIndex < playlist.length - 1) {
          currentIndex++;
          currentReel = playlist[currentIndex];
          renderModalContent();
        }
      }
      function prevReel() {
        if (currentIndex > 0) {
          currentIndex--;
          currentReel = playlist[currentIndex];
          renderModalContent();
        }
      }

      navUp?.addEventListener('click', e => { e.stopPropagation(); prevReel(); });
      navDown?.addEventListener('click', e => { e.stopPropagation(); nextReel(); });

      // Touch swipe gestures
      let touchStartY = 0;
      modalSc.addEventListener('touchstart', e => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      modalSc.addEventListener('touchend', e => {
        const touchEndY = e.changedTouches[0].clientY;
        const diff = touchStartY - touchEndY;
        if (diff > 55) {
          nextReel(); // Swiped UP
        } else if (diff < -55) {
          prevReel(); // Swiped DOWN
        }
      }, { passive: true });

      // Keyboard arrow keys
      const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') { nextReel(); }
        else if (e.key === 'ArrowUp') { prevReel(); }
        else if (e.key === 'Escape') { closeModal(); window.removeEventListener('keydown', onKeyDown); }
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
