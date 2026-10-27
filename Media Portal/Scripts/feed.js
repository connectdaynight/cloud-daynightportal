/**
 * Daynight-Media: Home Feed & Stories Controller
 */
(function(window) {
  'use strict';

  let feedObserver = null;
  let isGlobalMuted = true;
  const likedPosts = new Set(JSON.parse(localStorage.getItem('dnm_liked_posts') || '[]'));
  const savedPosts = new Set(JSON.parse(localStorage.getItem('dnm_saved_posts') || '[]'));

  function initFeed(container) {
    if (!container) return;
    renderStories(container.querySelector('#dnm-stories-tray'));
    renderFeedCards(container.querySelector('#dnm-feed-cards-wrap'));
    initFeedAutoplay();
  }

  // Render Stories Tray
  function renderStories(trayEl) {
    if (!trayEl) return;
    const clients = (window.DNM_DATA ? window.DNM_DATA.loadData : null);
    const clientList = [
      { id: 'tcs', name: 'The Chennai Silks', avatar: '/Logo/tcs-logo.png' },
      { id: 'shealin', name: 'Shealin Designers', avatar: '/Logo/logo.png' },
      { id: 'sarasaa', name: 'Sarasaa Saloon', avatar: '/Logo/logo.png' },
      { id: 'khalids', name: 'Khalids Cuisine', avatar: '/Logo/logo.png' },
      { id: 'vivaha', name: 'Vivaha Silks', avatar: '/Logo/logo.png' }
    ];

    const user = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;

    let html = `
      <div class="dnm-story-item" data-action="story-user">
        <div class="dnm-story-ring ${user ? '' : 'seen'}">
          <img class="dnm-story-avatar" src="${user ? user.photoURL : '/Logo/logo.png'}" alt="">
        </div>
        <span class="dnm-story-name">${user ? 'Your Story' : 'Sign In'}</span>
      </div>
    `;

    clientList.forEach(c => {
      html += `
        <div class="dnm-story-item" data-action="story-client" data-client="${c.id}">
          <div class="dnm-story-ring">
            <img class="dnm-story-avatar" src="${c.avatar}" alt="${c.name}">
          </div>
          <span class="dnm-story-name">${c.name.split(' ')[0]}</span>
        </div>
      `;
    });

    trayEl.innerHTML = html;
  }

  // Render Feed Cards
  function renderFeedCards(wrapEl) {
    if (!wrapEl) return;
    const reels = window.DNM_DATA.getAllApprovedReels();
    const community = window.DNM_DATA.getCommunityPosts();

    const allItems = [...community, ...reels];
    if (!allItems.length) {
      wrapEl.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:var(--ig-text-secondary);">
          <p>No posts available yet. Be the first to share a video or photo!</p>
        </div>
      `;
      return;
    }

    let cardsHtml = '';
    allItems.forEach((item, idx) => {
      const isClient = !!item.c;
      const clientObj = isClient ? window.DNM_DATA.getClient(item.c) : null;
      const authorName = isClient ? (clientObj ? clientObj.name : 'The Chennai Silks') : (item.authorName || 'Creative Member');
      const authorAvatar = isClient ? (item.c === 'tcs' ? '/Logo/tcs-logo.png' : '/Logo/logo.png') : (item.authorAvatar || '/Logo/logo.png');
      const locationText = isClient ? (item.b || 'Chennai, India') : (item.location || 'Daynight-media');
      const videoSrc = window.DNM_DATA.getStreamUrl(item);
      const isLiked = likedPosts.has(item.id);
      const isSaved = savedPosts.has(item.id);
      const likesCount = (item.likes || 14) + (isLiked ? 1 : 0);

      cardsHtml += `
        <article class="dnm-post-card" data-post-id="${item.id}" data-idx="${idx}">
          <!-- Header -->
          <div class="dnm-card-header">
            <div class="dnm-user-info" data-action="view-profile" data-author="${isClient ? item.c : item.authorId}">
              <div class="dnm-avatar-wrap ${isClient ? 'client' : ''}">
                <img class="dnm-avatar-img" src="${authorAvatar}" alt="">
              </div>
              <div class="dnm-meta-text">
                <div class="dnm-username-row">
                  <span class="dnm-username">${authorName}</span>
                  ${isClient ? '<svg class="dnm-badge-verified" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
                </div>
                <span class="dnm-location">${locationText}</span>
              </div>
            </div>
            <button type="button" class="dnm-more-btn" data-action="post-options" aria-label="More options">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
          </div>

          <!-- Media Container -->
          <div class="dnm-media-wrapper" data-action="media-click">
            ${item.type === 'photo' || item.type === 'ai-picture' ? `
              <img class="dnm-media-photo" src="${item.mediaUrl || item.coverUrl}" alt="" loading="lazy">
            ` : `
              <video class="dnm-media-video dnm-feed-vid" src="${videoSrc}" playsinline loop preload="metadata" poster="${item.coverUrl || ''}"></video>
              <button type="button" class="dnm-sound-pill" data-action="toggle-sound" aria-label="Toggle sound">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="dnm-sound-icon">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              </button>
            `}
            <div class="dnm-heart-pop">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="#FF3040"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
          </div>

          <!-- Action Row -->
          <div class="dnm-action-row">
            <div class="dnm-left-actions">
              <button type="button" class="dnm-action-btn ${isLiked ? 'liked' : ''}" data-action="like-post" aria-label="Like">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="${isLiked ? 'var(--ig-heart)' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
              <button type="button" class="dnm-action-btn" data-action="comment-post" aria-label="Comment">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </button>
              <button type="button" class="dnm-action-btn" data-action="share-post" aria-label="Share">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
            <button type="button" class="dnm-action-btn ${isSaved ? 'saved' : ''}" data-action="save-post" aria-label="Save">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>

          <!-- Details -->
          <div class="dnm-post-details">
            <span class="dnm-likes-count">${likesCount.toLocaleString()} likes</span>
            <div class="dnm-caption">
              <span class="dnm-caption-user">${authorName}</span>
              ${item.title || item.caption || 'New reel showcase #DaynightMedia #Creative'}
            </div>
            <span class="dnm-comments-summary" data-action="comment-post">View all ${item.commentsCount || 4} comments</span>
            <span class="dnm-post-time">${item.date || 'Today'}</span>
          </div>
        </article>
      `;
    });

    wrapEl.innerHTML = cardsHtml;
    attachFeedEvents(wrapEl);
  }

  function attachFeedEvents(wrapEl) {
    // Like button
    wrapEl.querySelectorAll('[data-action="like-post"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.dnm-post-card');
        const id = card.dataset.postId;
        const isLiked = likedPosts.has(id);
        if (isLiked) {
          likedPosts.delete(id);
          btn.classList.remove('liked');
          btn.querySelector('svg').setAttribute('fill', 'none');
        } else {
          likedPosts.add(id);
          btn.classList.add('liked');
          btn.querySelector('svg').setAttribute('fill', 'var(--ig-heart)');
          btn.style.transform = 'scale(1.3)';
          setTimeout(() => btn.style.transform = 'scale(1)', 180);
        }
        localStorage.setItem('dnm_liked_posts', JSON.stringify(Array.from(likedPosts)));
      });
    });

    // Double tap heart pop on media
    wrapEl.querySelectorAll('.dnm-media-wrapper').forEach(mediaWrap => {
      let lastTap = 0;
      mediaWrap.addEventListener('click', e => {
        if (e.target.closest('[data-action="toggle-sound"]')) return;
        const now = Date.now();
        if (now - lastTap < 300) {
          // Double tap
          const pop = mediaWrap.querySelector('.dnm-heart-pop');
          if (pop) {
            pop.classList.add('pop');
            setTimeout(() => pop.classList.remove('pop'), 650);
          }
          const card = mediaWrap.closest('.dnm-post-card');
          const likeBtn = card.querySelector('[data-action="like-post"]');
          if (likeBtn && !likeBtn.classList.contains('liked')) {
            likeBtn.click();
          }
        } else {
          // Single tap: toggle play / pause on video
          const vid = mediaWrap.querySelector('video');
          if (vid) {
            if (vid.paused) vid.play().catch(() => {});
            else vid.pause();
          }
        }
        lastTap = now;
      });
    });

    // Sound toggle on feed video
    wrapEl.querySelectorAll('[data-action="toggle-sound"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        isGlobalMuted = !isGlobalMuted;
        wrapEl.querySelectorAll('video').forEach(v => {
          v.muted = isGlobalMuted;
        });
        updateSoundIcons(wrapEl);
      });
    });

    // Save / Bookmark button
    wrapEl.querySelectorAll('[data-action="save-post"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.dnm-post-card');
        const id = card.dataset.postId;
        if (savedPosts.has(id)) {
          savedPosts.delete(id);
          btn.classList.remove('saved');
          btn.querySelector('svg').setAttribute('fill', 'none');
        } else {
          savedPosts.add(id);
          btn.classList.add('saved');
          btn.querySelector('svg').setAttribute('fill', 'currentColor');
        }
        localStorage.setItem('dnm_saved_posts', JSON.stringify(Array.from(savedPosts)));
      });
    });
  }

  function updateSoundIcons(wrapEl) {
    wrapEl.querySelectorAll('.dnm-sound-icon').forEach(icon => {
      icon.innerHTML = isGlobalMuted
        ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
        : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    });
  }

  // IntersectionObserver to autoplay single video in viewport
  function initFeedAutoplay() {
    if (feedObserver) {
      feedObserver.disconnect();
      feedObserver = null;
    }

    feedObserver = new IntersectionObserver((entries) => {
      // Guard: if any modal or reels tab is active, halt all feed videos
      if (document.querySelector('.dnm-scrim.active') || document.querySelector('#dnm-tab-reels.active')) {
        document.querySelectorAll('.dnm-feed-vid').forEach(v => {
          try { v.pause(); v.muted = true; } catch(_) {}
        });
        return;
      }

      entries.forEach(entry => {
        const vid = entry.target.querySelector('video');
        if (!vid) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          // Pause other feed videos
          document.querySelectorAll('.dnm-feed-vid').forEach(other => {
            if (other !== vid) {
              try { other.pause(); other.muted = true; } catch(_) {}
            }
          });
          vid.muted = isGlobalMuted;
          vid.play().catch(() => {});
        } else {
          try { vid.pause(); vid.muted = true; } catch(_) {}
        }
      });
    }, { threshold: [0, 0.5, 0.9] });

    document.querySelectorAll('.dnm-post-card').forEach(card => {
      feedObserver.observe(card);
    });
  }

  window.DNM_FEED = {
    initFeed,
    renderStories,
    renderFeedCards
  };

})(window);
