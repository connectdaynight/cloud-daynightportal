/**
 * Daynight-Media: Full-Screen 9:16 Reels Tab Controller
 */
(function(window) {
  'use strict';

  let currentReelsList = [];
  let reelsObserver = null;
  const reelsStorage = window.DNM_STORAGE_REELS || (window.DNM_STORAGE_REELS = new StorageAdapter({ namespace: 'reels' }));
  let followingSet = new Set();

  async function initReelsTab(container) {
    if (!container) return;

    // Initialize followingSet from StorageAdapter
    try {
      const saved = await reelsStorage.getItem('following_set');
      followingSet = new Set(saved || []);
    } catch (_) {
      followingSet = new Set();
    }

    currentReelsList = window.DNM_DATA.getAllApprovedReels();
    if (!currentReelsList.length) {
      container.innerHTML = `
        <div style="height:100%;display:flex;align-items:center;justify-content:center;color:#888;">
          <p>No video reels available yet.</p>
        </div>
      `;
      return;
    }

    let reelsHtml = '';
    currentReelsList.forEach((reel, idx) => {
      const isClient = !!reel.c;
      const clientObj = isClient ? window.DNM_DATA.getClient(reel.c) : null;
      const authorName = isClient ? (clientObj ? clientObj.name : '') : (reel.authorName || '');
      const authorAvatar = isClient ? (clientObj ? clientObj.logo : './Logo/logo.png') : './Logo/logo.png';
      const isFollowing = followingSet.has(reel.c || authorName);
      const videoSrc = window.DNM_DATA.getStreamUrl(reel);
      const baseLikes = Number(reel.likes) || 0;

      reelsHtml += `
        <div class="dnm-reel-viewport" data-reel-id="${reel.id}" data-idx="${idx}">
          <video class="dnm-reel-video-element" src="${videoSrc}" muted playsinline loop preload="metadata" poster="${reel.coverUrl || ''}"></video>

          <!-- Right Floating Actions Stack -->
          <div class="dnm-reel-actions-stack">
            <button type="button" class="dnm-reel-action-btn" data-action="reel-like" aria-label="Like" data-base-likes="${baseLikes}">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span class="dnm-reel-action-count">${baseLikes > 0 ? baseLikes.toLocaleString() : '0'}</span>
            </button>
            <button type="button" class="dnm-reel-action-btn" data-action="reel-comment" aria-label="Comment">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <span class="dnm-reel-action-count">0</span>
            </button>
            <button type="button" class="dnm-reel-action-btn" data-action="reel-share" aria-label="Share">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
            <button type="button" class="dnm-reel-action-btn" data-action="reel-save" aria-label="Save">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
            <!-- Rotating Vinyl Disc -->
            <div class="dnm-vinyl-disc" title="Original Audio">
              <img src="${authorAvatar}" alt="">
            </div>
          </div>

          <!-- Bottom Meta Overlay -->
          <div class="dnm-reel-meta-overlay">
            <div class="dnm-reel-author-row">
              <img class="dnm-reel-avatar" src="${authorAvatar}" alt="">
              <span class="dnm-reel-author-name">${authorName}</span>
              <button type="button" class="dnm-reel-follow-btn ${isFollowing ? 'following' : ''}" data-target="${reel.c || authorName}">
                ${isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
            ${reel.title ? `<div class="dnm-reel-caption-text">${reel.title}</div>` : ''}
            <div class="dnm-reel-audio-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
              <span>${authorName} &bull; Original Audio</span>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = reelsHtml;
    attachReelsEvents(container);
    setupReelsObserver(container);
  }

  function attachReelsEvents(container) {
    container.querySelectorAll('.dnm-reel-follow-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const target = btn.dataset.target;
        const isFollowing = followingSet.has(target);
        if (isFollowing) {
          followingSet.delete(target);
          btn.classList.remove('following');
          btn.textContent = 'Follow';
        } else {
          followingSet.add(target);
          btn.classList.add('following');
          btn.textContent = 'Following';
        }
        // Persist to StorageAdapter & Cloud Firestore
        try {
          await reelsStorage.setItem('following_set', Array.from(followingSet));
        } catch (_) {}
        // Persist to Firestore
        if (window.DNM_FIREBASE && window.DNM_AUTH.getCurrentUser()) {
          try {
            await window.DNM_FIREBASE.toggleFollow?.(target, !isFollowing);
          } catch (_) {}
        }
      });
    });

    // Save button handler
    container.querySelectorAll('[data-action="reel-save"]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const reelId = btn.closest('.dnm-reel-viewport')?.dataset.reelId;
        const isSaved = btn.classList.toggle('saved');
        btn.querySelector('svg').setAttribute('fill', isSaved ? 'var(--ig-heart)' : 'none');
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => btn.style.transform = 'scale(1)', 180);

        // Persist locally
        try {
          const savedPosts = await window.DNM_STORAGE?.social?.get('saved_posts', []) || [];
          const savedSet = new Set(savedPosts);
          if (isSaved) savedSet.add(reelId); else savedSet.delete(reelId);
          await window.DNM_STORAGE?.social?.set('saved_posts', Array.from(savedSet));
        } catch (_) {}

        // Persist to Firestore
        if (reelId && window.DNM_FIREBASE && window.DNM_AUTH.getCurrentUser()) {
          try {
            await window.DNM_FIREBASE.toggleSave?.(reelId, isSaved);
          } catch (_) {}
        }
      });
    });

    container.querySelectorAll('.dnm-reel-viewport').forEach(vp => {
      vp.addEventListener('click', e => {
        if (e.target.closest('.dnm-reel-actions-stack') || e.target.closest('.dnm-reel-meta-overlay')) return;
        const reelId = vp.dataset.reelId;
        const r = currentReelsList.find(x => x.id === reelId);
        if (r && window.DNM_PLAYER) {
          window.DNM_PLAYER.openVideoPlaybackModal(r, currentReelsList);
        }
      });
    });

    container.querySelectorAll('[data-action="reel-like"]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const reelId = btn.closest('.dnm-reel-viewport')?.dataset.reelId;
        const isLiked = btn.classList.toggle('liked');
        btn.querySelector('svg').setAttribute('fill', isLiked ? 'var(--ig-heart)' : 'none');
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => btn.style.transform = 'scale(1)', 180);

        // Update count
        const countEl = btn.querySelector('.dnm-reel-action-count');
        const baseLikes = parseInt(btn.dataset.baseLikes) || 0;
        if (countEl) countEl.textContent = (baseLikes + (isLiked ? 1 : 0)).toLocaleString();

        // Persist to Firestore
        if (reelId && window.DNM_FIREBASE) {
          try {
            await window.DNM_FIREBASE.incrementLike?.(reelId, isLiked ? 1 : -1);
          } catch (_) {}
        }
        // Local fallback
        try {
          const likedPosts = await window.DNM_STORAGE?.social?.get('liked_posts', []) || [];
          const likesSet = new Set(likedPosts);
          if (isLiked) likesSet.add(reelId); else likesSet.delete(reelId);
          await window.DNM_STORAGE?.social?.set('liked_posts', Array.from(likesSet));
        } catch (_) {}
      });
    });
  }

  function setupReelsObserver(container) {
    if (reelsObserver) {
      reelsObserver.disconnect();
      reelsObserver = null;
    }

    reelsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const vid = entry.target.querySelector('video');
        const disc = entry.target.querySelector('.dnm-vinyl-disc');
        if (!vid) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
          container.querySelectorAll('video').forEach(other => {
            if (other !== vid) {
              try { other.pause(); } catch(_) {}
            }
          });
          vid.muted = false;
          vid.play().then(() => {
            if (disc) disc.classList.remove('paused');
          }).catch(() => {
            vid.muted = true;
            vid.play().catch(() => {});
          });
        } else {
          try { vid.pause(); } catch(_) {}
          if (disc) disc.classList.add('paused');
        }
      });
    }, { threshold: [0, 0.7, 1.0] });

    container.querySelectorAll('.dnm-reel-viewport').forEach(vp => {
      reelsObserver.observe(vp);
    });
  }

  window.DNM_REELS = {
    initReelsTab
  };

})(window);
