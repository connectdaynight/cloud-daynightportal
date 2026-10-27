/**
 * Daynight-Media: Home Feed & Real Stories Controller
 * STRICTLY 100% Real Data Layer - Zero Mock/Fake Likes or Comments
 */
(function(window) {
  'use strict';

  let feedObserver = null;
  let isGlobalMuted = true;
  const likedPosts = new Set(JSON.parse(localStorage.getItem('dnm_liked_posts') || '[]'));
  const savedPosts = new Set(JSON.parse(localStorage.getItem('dnm_saved_posts') || '[]'));

  // Real user comments storage (filtered of any legacy test data)
  let commentsStore = {};
  try {
    const raw = localStorage.getItem('dnm_comments_store');
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const k in parsed) {
        if (Array.isArray(parsed[k])) {
          parsed[k] = parsed[k].filter(c => c && c.user !== 'ananya_s' && c.user !== 'karthik_v');
        }
      }
      commentsStore = parsed;
    }
  } catch(_) {}

  function initFeed(container) {
    if (!container) return;
    renderStories(container.querySelector('#dnm-stories-tray'));
    renderFeedCards(container.querySelector('#dnm-feed-cards-wrap'));
    initFeedAutoplay();
  }

  // Render Real Client Stories Tray
  function renderStories(trayEl) {
    if (!trayEl) return;
    const clients = window.DNM_DATA.getClients();
    const user = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;

    let html = `
      <div class="dnm-story-item" data-action="story-user">
        <div class="dnm-story-ring ${user ? '' : 'seen'}">
          <img class="dnm-story-avatar" src="${user ? user.photoURL : './Logo/logo.png?v=2.2'}" alt="Your Story">
        </div>
        <span class="dnm-story-name">${user ? (user.username || user.displayName || 'You') : 'Sign In'}</span>
      </div>
    `;

    clients.forEach(c => {
      const realLogo = c.logo || './Logo/logo.png?v=2.2';
      html += `
        <div class="dnm-story-item" data-action="story-client" data-client="${c.id}">
          <div class="dnm-story-ring">
            <img class="dnm-story-avatar" src="${realLogo}" alt="${c.name}">
          </div>
          <span class="dnm-story-name">${c.name.split(' ')[0]}</span>
        </div>
      `;
    });

    trayEl.innerHTML = html;

    trayEl.querySelectorAll('[data-action="story-client"]').forEach(item => {
      item.addEventListener('click', () => {
        window.DNM_APP.openBrandProfile(item.dataset.client);
      });
    });

    trayEl.querySelector('[data-action="story-user"]')?.addEventListener('click', () => {
      if (!user) {
        window.DNM_AUTH.signInWithGoogle();
      } else {
        window.DNM_APP.switchTab('profile');
      }
    });
  }

  // Render Real Production Feed Cards
  function renderFeedCards(wrapEl) {
    if (!wrapEl) return;
    const reels = window.DNM_DATA.getAllApprovedReels();
    const community = window.DNM_DATA.getCommunityPosts();

    const allItems = [...community, ...reels];
    if (!allItems.length) {
      wrapEl.innerHTML = `
        <div style="padding:60px 20px;text-align:center;color:var(--ig-text-secondary);">
          <p>No posts available.</p>
        </div>
      `;
      return;
    }

    let cardsHtml = '';
    allItems.forEach((item, idx) => {
      const isClient = !!item.c;
      const clientObj = isClient ? window.DNM_DATA.getClient(item.c) : null;
      const authorName = isClient ? (clientObj ? clientObj.name : '') : (item.authorName || '');
      const authorHandle = isClient ? (clientObj ? clientObj.slug : '') : (item.authorUsername || '');
      const authorAvatar = isClient ? (clientObj ? clientObj.logo : './Logo/logo.png') : (item.authorAvatar || './Logo/logo.png');
      const locationText = isClient ? (item.b || '') : (item.location || '');
      const videoSrc = window.DNM_DATA.getStreamUrl(item);
      const isLiked = likedPosts.has(item.id);
      const isSaved = savedPosts.has(item.id);

      // Real likes: only from database + current user like session
      const baseLikes = Number(item.likes) || 0;
      const totalLikes = baseLikes + (isLiked ? 1 : 0);

      // Real comments: only real user comments
      const postComments = commentsStore[item.id] || [];

      cardsHtml += `
        <article class="dnm-post-card" data-post-id="${item.id}" data-idx="${idx}" data-author="${isClient ? item.c : (item.authorId || '')}">
          <!-- Header -->
          <div class="dnm-card-header">
            <div class="dnm-user-info" data-action="view-profile" data-author="${isClient ? item.c : item.authorId}">
              <div class="dnm-avatar-wrap ${isClient ? 'client' : ''}">
                <img class="dnm-avatar-img" src="${authorAvatar}" alt="${authorName}">
              </div>
              <div class="dnm-meta-text">
                <div class="dnm-username-row">
                  <span class="dnm-username">${authorName}</span>
                  ${isClient ? '<svg class="dnm-badge-verified" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
                </div>
                ${locationText ? `<span class="dnm-location">${locationText}</span>` : ''}
              </div>
            </div>
            <button type="button" class="dnm-more-btn" data-action="post-options" aria-label="More options">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
          </div>

          <!-- Media Container (Strict 9:16 aspect ratio with cover fit, zero black gaps) -->
          <div class="dnm-media-wrapper" data-action="media-click">
            ${item.type === 'photo' ? `
              <img class="dnm-media-photo" src="${item.mediaUrl || item.coverUrl}" alt="" loading="lazy">
            ` : `
              <video class="dnm-media-video dnm-feed-vid" src="${videoSrc}" muted playsinline loop preload="metadata" poster="${item.coverUrl || ''}"></video>
              <button type="button" class="dnm-sound-pill" data-action="toggle-sound" aria-label="Toggle sound">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="dnm-sound-icon">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              </button>
              <div class="dnm-play-indicator">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
              </div>
            `}
            <div class="dnm-heart-pop">
              <svg width="84" height="84" viewBox="0 0 24 24" fill="#FF3040"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
          </div>

          <!-- Action Row -->
          <div class="dnm-action-row">
            <div class="dnm-left-actions">
              <button type="button" class="dnm-action-btn ${isLiked ? 'liked' : ''}" data-action="like-post" aria-label="Like" data-base-likes="${baseLikes}">
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

          <!-- Post Details with Real Values -->
          <div class="dnm-post-details">
            <span class="dnm-likes-count">${formatLikes(totalLikes)}</span>
            ${item.title || item.caption ? `
              <div class="dnm-caption">
                ${authorHandle ? `<span class="dnm-caption-user">${authorHandle}</span>` : ''}
                ${escapeHtml(item.title || item.caption)}
              </div>
            ` : ''}
            <span class="dnm-comments-summary" data-action="comment-post">${postComments.length > 0 ? `View all ${postComments.length} comments` : 'Add a comment...'}</span>
            ${item.date ? `<span class="dnm-post-time">${item.date}</span>` : ''}
          </div>
        </article>
      `;
    });

    wrapEl.innerHTML = cardsHtml;
    attachFeedEvents(wrapEl);
  }

  function formatLikes(count) {
    if (count <= 0) return '0 likes';
    if (count === 1) return '1 like';
    return `${count.toLocaleString()} likes`;
  }

  function attachFeedEvents(wrapEl) {
    // Like button
    wrapEl.querySelectorAll('[data-action="like-post"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.dnm-post-card');
        const id = card.dataset.postId;
        const isLiked = likedPosts.has(id);
        const baseLikes = parseInt(btn.dataset.baseLikes) || 0;
        const likesCountEl = card.querySelector('.dnm-likes-count');

        if (isLiked) {
          likedPosts.delete(id);
          btn.classList.remove('liked');
          btn.querySelector('svg').setAttribute('fill', 'none');
          if (likesCountEl) likesCountEl.textContent = formatLikes(baseLikes);
        } else {
          likedPosts.add(id);
          btn.classList.add('liked');
          btn.querySelector('svg').setAttribute('fill', 'var(--ig-heart)');
          btn.style.transform = 'scale(1.25)';
          setTimeout(() => btn.style.transform = 'scale(1)', 180);
          if (likesCountEl) likesCountEl.textContent = formatLikes(baseLikes + 1);
        }
        localStorage.setItem('dnm_liked_posts', JSON.stringify(Array.from(likedPosts)));
      });
    });

    // Video tap play/pause & double tap heart pop
    wrapEl.querySelectorAll('.dnm-media-wrapper').forEach(mediaWrap => {
      let lastTap = 0;
      mediaWrap.addEventListener('click', e => {
        if (e.target.closest('[data-action="toggle-sound"]')) return;
        const now = Date.now();
        const card = mediaWrap.closest('.dnm-post-card');

        if (now - lastTap < 320) {
          // Double-tap heart
          const pop = mediaWrap.querySelector('.dnm-heart-pop');
          if (pop) {
            pop.classList.add('pop');
            setTimeout(() => pop.classList.remove('pop'), 650);
          }
          const likeBtn = card.querySelector('[data-action="like-post"]');
          if (likeBtn && !likeBtn.classList.contains('liked')) {
            likeBtn.click();
          }
        } else {
          // Open full-screen video playback modal (from Client Portal)
          const postId = card.dataset.postId;
          const reels = window.DNM_DATA.getAllApprovedReels();
          const targetReel = reels.find(r => r.id === postId) || reels[0];
          if (targetReel && window.DNM_PLAYER) {
            window.DNM_PLAYER.openVideoPlaybackModal(targetReel, reels);
          }
        }
        lastTap = now;
      });
    });

    // Sound toggle
    wrapEl.querySelectorAll('[data-action="toggle-sound"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        isGlobalMuted = !isGlobalMuted;
        wrapEl.querySelectorAll('video').forEach(v => {
          v.muted = isGlobalMuted;
        });
        updateSoundIcons(wrapEl);
        showToast(isGlobalMuted ? 'Audio muted' : 'Audio unmuted');
      });
    });

    // Save post
    wrapEl.querySelectorAll('[data-action="save-post"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.dnm-post-card');
        const id = card.dataset.postId;
        if (savedPosts.has(id)) {
          savedPosts.delete(id);
          btn.classList.remove('saved');
          btn.querySelector('svg').setAttribute('fill', 'none');
          showToast('Removed from saved items');
        } else {
          savedPosts.add(id);
          btn.classList.add('saved');
          btn.querySelector('svg').setAttribute('fill', 'currentColor');
          btn.style.transform = 'scale(1.2)';
          setTimeout(() => btn.style.transform = 'scale(1)', 180);
          showToast('Saved to your collection');
        }
        localStorage.setItem('dnm_saved_posts', JSON.stringify(Array.from(savedPosts)));
      });
    });

    // Comments drawer
    wrapEl.querySelectorAll('[data-action="comment-post"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.dnm-post-card');
        const postId = card.dataset.postId;
        openCommentsDrawer(postId, card);
      });
    });

    // Share post
    wrapEl.querySelectorAll('[data-action="share-post"]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const card = btn.closest('.dnm-post-card');
        const author = card.querySelector('.dnm-username')?.textContent || '';
        const url = window.location.origin + '/Media%20Portal/index.html?post=' + card.dataset.postId;

        if (navigator.share) {
          try {
            await navigator.share({
              title: `Daynight-media - ${author}`,
              text: `Watch on Daynight-media`,
              url: url
            });
            return;
          } catch(_) {}
        }

        try {
          await navigator.clipboard.writeText(url);
          showToast('Link copied to clipboard!');
        } catch(_) {
          showToast('Share link ready');
        }
      });
    });

    // Post options
    wrapEl.querySelectorAll('[data-action="post-options"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.dnm-post-card');
        openPostOptionsSheet(card);
      });
    });

    // View profile
    wrapEl.querySelectorAll('[data-action="view-profile"]').forEach(item => {
      item.addEventListener('click', () => {
        const author = item.dataset.author;
        if (author) {
          window.DNM_APP.openBrandProfile(author);
        }
      });
    });
  }

  // Interactive Comments Drawer (Strictly Real Comments Only)
  function openCommentsDrawer(postId, cardEl) {
    const existing = document.querySelector('#dnm-active-comments-sheet');
    if (existing) existing.remove();
    const existingScrim = document.querySelector('#dnm-comments-scrim');
    if (existingScrim) existingScrim.remove();

    const comments = commentsStore[postId] || [];
    const user = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-comments-scrim';

    const sheet = document.createElement('div');
    sheet.className = 'dnm-comments-sheet active';
    sheet.id = 'dnm-active-comments-sheet';
    sheet.innerHTML = `
      <div class="dnm-comments-drag-handle"></div>
      <div class="dnm-comments-header">
        <span class="dnm-comments-title">Comments (${comments.length})</span>
        <button type="button" class="dnm-comments-close" id="dnm-close-comments-btn">&times;</button>
      </div>
      <div class="dnm-comments-list" id="dnm-comments-list-items">
        ${comments.length === 0 ? `
          <div class="dnm-empty-comments" style="padding:40px 16px;text-align:center;color:var(--ig-text-secondary);font-size:13px;">
            No comments yet. Be the first to comment.
          </div>
        ` : comments.map(c => `
          <div class="dnm-comment-item">
            <img class="dnm-comment-avatar" src="${c.avatar || './Logo/logo.png'}" alt="">
            <div class="dnm-comment-body">
              <span class="dnm-comment-username">@${c.user}</span>
              <span class="dnm-comment-text">${escapeHtml(c.text)}</span>
              <span class="dnm-comment-time">${c.time || 'Just now'}</span>
            </div>
          </div>
        `).join('')}
      </div>
      <form class="dnm-comment-input-bar" id="dnm-comment-form">
        <img class="dnm-comment-avatar" src="${user ? user.photoURL : './Logo/logo.png'}" alt="" style="width:28px;height:28px;">
        <input type="text" id="dnm-comment-input-text" class="dnm-comment-inp" placeholder="${user ? 'Add a comment as @' + (user.username || user.displayName) + '...' : 'Sign in to add a comment...'}" ${user ? '' : 'readonly'}>
        <button type="submit" id="dnm-comment-post-btn" class="dnm-comment-post-btn" ${user ? '' : 'disabled'}>Post</button>
      </form>
    `;

    document.body.appendChild(scrim);
    document.body.appendChild(sheet);

    function closeComments() {
      sheet.classList.remove('active');
      scrim.classList.remove('active');
      setTimeout(() => {
        sheet.remove();
        scrim.remove();
      }, 250);
    }

    scrim.addEventListener('click', closeComments);
    sheet.querySelector('#dnm-close-comments-btn')?.addEventListener('click', closeComments);

    const form = sheet.querySelector('#dnm-comment-form');
    const input = sheet.querySelector('#dnm-comment-input-text');
    const list = sheet.querySelector('#dnm-comments-list-items');

    if (!user) {
      input.addEventListener('click', () => {
        closeComments();
        window.DNM_AUTH.signInWithGoogle();
      });
    }

    form?.addEventListener('submit', e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !user) return;

      const newComment = {
        user: user.username || user.displayName,
        avatar: user.photoURL || './Logo/logo.png',
        text: text,
        time: 'Just now'
      };
      comments.unshift(newComment);
      commentsStore[postId] = comments;
      try {
        localStorage.setItem('dnm_comments_store', JSON.stringify(commentsStore));
      } catch(_) {}

      const emptyMsg = list.querySelector('.dnm-empty-comments');
      if (emptyMsg) emptyMsg.remove();

      const itemHtml = `
        <div class="dnm-comment-item" style="animation:dnmToastIn 0.25s ease;">
          <img class="dnm-comment-avatar" src="${newComment.avatar}" alt="">
          <div class="dnm-comment-body">
            <span class="dnm-comment-username">@${newComment.user}</span>
            <span class="dnm-comment-text">${escapeHtml(text)}</span>
            <span class="dnm-comment-time">Just now</span>
          </div>
        </div>
      `;
      list.insertAdjacentHTML('afterbegin', itemHtml);
      input.value = '';

      if (cardEl) {
        const summary = cardEl.querySelector('.dnm-comments-summary');
        if (summary) summary.textContent = `View all ${comments.length} comments`;
      }
      sheet.querySelector('.dnm-comments-title').textContent = `Comments (${comments.length})`;
      showToast('Comment posted');
    });
  }

  // Post Options Action Sheet
  function openPostOptionsSheet(cardEl) {
    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.innerHTML = `
      <div class="dnm-modal-dialog" style="max-width:320px;padding:0;overflow:hidden;border-radius:14px;">
        <button type="button" id="dnm-opt-share" style="width:100%;padding:14px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-accent);font-weight:600;font-size:14px;cursor:pointer;">Share Post</button>
        <button type="button" id="dnm-opt-copy" style="width:100%;padding:14px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-text-primary);font-size:14px;cursor:pointer;">Copy Link</button>
        <button type="button" id="dnm-opt-brand" style="width:100%;padding:14px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-text-primary);font-size:14px;cursor:pointer;">View Brand Profile</button>
        <button type="button" id="dnm-opt-cancel" style="width:100%;padding:14px;background:none;border:none;color:var(--ig-text-secondary);font-size:14px;cursor:pointer;">Cancel</button>
      </div>
    `;
    document.body.appendChild(scrim);

    function close() { scrim.remove(); }
    scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
    scrim.querySelector('#dnm-opt-cancel')?.addEventListener('click', close);

    scrim.querySelector('#dnm-opt-copy')?.addEventListener('click', async () => {
      close();
      const url = window.location.origin + '/Media%20Portal/index.html?post=' + cardEl.dataset.postId;
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard!');
      } catch(_) {
        showToast('Link copied');
      }
    });

    scrim.querySelector('#dnm-opt-share')?.addEventListener('click', () => {
      close();
      const shareBtn = cardEl.querySelector('[data-action="share-post"]');
      if (shareBtn) shareBtn.click();
    });

    scrim.querySelector('#dnm-opt-brand')?.addEventListener('click', () => {
      close();
      const author = cardEl.dataset.author;
      if (author) window.DNM_APP.openBrandProfile(author);
    });
  }

  // Toast Notification
  function showToast(msg) {
    const container = document.querySelector('#dnm-toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = 'dnm-toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2200);
  }

  function createToastContainer() {
    const c = document.createElement('div');
    c.id = 'dnm-toast-container';
    c.className = 'dnm-toast-container';
    document.body.appendChild(c);
    return c;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function updateSoundIcons(wrapEl) {
    wrapEl.querySelectorAll('.dnm-sound-icon').forEach(icon => {
      icon.innerHTML = isGlobalMuted
        ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
        : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    });
  }

  function initFeedAutoplay() {
    if (feedObserver) {
      feedObserver.disconnect();
      feedObserver = null;
    }

    feedObserver = new IntersectionObserver((entries) => {
      if (document.querySelector('.dnm-scrim.active') || document.querySelector('#dnm-tab-reels.active')) {
        document.querySelectorAll('.dnm-feed-vid').forEach(v => {
          try { v.pause(); v.muted = true; } catch(_) {}
        });
        return;
      }

      entries.forEach(entry => {
        const vid = entry.target.querySelector('video');
        if (!vid) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          document.querySelectorAll('.dnm-feed-vid').forEach(other => {
            if (other !== vid) {
              try { other.pause(); other.muted = true; } catch(_) {}
            }
          });
          vid.muted = isGlobalMuted;
          const p = vid.play();
          if (p !== undefined) {
            p.catch(() => {
              vid.muted = true;
              vid.play().catch(() => {});
            });
          }
        } else {
          try { vid.pause(); vid.muted = true; } catch(_) {}
        }
      });
    }, { threshold: [0, 0.35, 0.8] });

    document.querySelectorAll('.dnm-post-card').forEach(card => {
      feedObserver.observe(card);
    });
  }

  window.DNM_FEED = {
    initFeed,
    renderStories,
    renderFeedCards,
    showToast
  };

})(window);
