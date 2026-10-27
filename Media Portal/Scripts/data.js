/**
 * Daynight-Media: Shared Real Data Layer
 * Syncs real approved contents and real client brand logos from portal-data.json
 */
(function(window) {
  'use strict';

  let rawData = null;
  let clientsList = [];
  let clientsMap = {};
  let approvedReels = [];
  let communityPosts = [];
  let streamToken = (function() { try { return sessionStorage.getItem('dn_st') || ''; } catch(_) { return ''; } })();

  // Pre-warm authenticated video stream token for zero-buffer streaming
  async function fetchStreamToken() {
    try {
      const res = await fetch('https://daynight-portal.pages.dev/api/token');
      if (res.ok) {
        const d = await res.json();
        if (d && d.token) {
          streamToken = d.token;
          try { sessionStorage.setItem('dn_st', d.token); } catch(_) {}
        }
      }
    } catch(_) {}
  }

  // Refresh token periodically (every 25 minutes)
  setInterval(fetchStreamToken, 25 * 60 * 1000);

  // Load community posts persisted locally
  try {
    const rawComm = localStorage.getItem('dnm_community_posts');
    if (rawComm) communityPosts = JSON.parse(rawComm);
  } catch(_) {}

  async function loadData() {
    // Fetch stream token and portal-data in parallel
    const tokenPromise = fetchStreamToken();

    try {
      // 1. Fetch real production portal-data.json
      const res = await fetch('./portal-data.json?t=' + Date.now());
      if (res.ok) {
        rawData = await res.json();
      }
    } catch(err) {
      console.warn('portal-data.json local fetch note:', err);
    }

    // 2. Fetch from Google Apps Script live production backend if local json fetch failed
    if (!rawData && window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) {
      try {
        const gasRes = await fetch(window.DNM_CONFIG.gasUrl + '?action=getData');
        const json = await gasRes.json();
        if (json.success && json.data) rawData = json.data;
      } catch(e) {
        console.error('GAS loadData failed:', e);
      }
    }

    await tokenPromise;

    if (rawData) {
      // Clean duplicate clients by slug/id
      const seenSlugs = new Set();
      clientsList = (rawData.clients || []).filter(c => {
        if (!c.slug) return false;
        if (seenSlugs.has(c.slug)) return false;
        seenSlugs.add(c.slug);
        return true;
      });

      clientsList.forEach(c => {
        // Ensure real logo from database
        clientsMap[c.id] = c;
        clientsMap[c.slug] = c;
      });

      // Strictly approved, playable reels (filtering out macOS AppleDouble dot files)
      approvedReels = (rawData.reels || []).filter(r => 
        r.status === 'approved' && 
        !r.hidden && 
        (!r.title || !r.title.trim().startsWith('.'))
      );
    }

    // 3. Merge locally cached uploaded posts immediately
    try {
      const storedUploads = JSON.parse(localStorage.getItem('dnm_uploaded_posts') || '[]');
      if (Array.isArray(storedUploads) && storedUploads.length) {
        const existingIds = new Set(approvedReels.map(r => r.id));
        storedUploads.forEach(p => {
          if (!existingIds.has(p.id)) {
            approvedReels.unshift(p);
            existingIds.add(p.id);
          }
        });
      }
    } catch(_) {}

    // 4. Live Server Sync: fetch real-time community & client uploads from Google Apps Script
    if (window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) {
      fetch(window.DNM_CONFIG.gasUrl + '?action=getData&_cb=' + Date.now())
        .then(r => r.json())
        .then(json => {
          if (json && json.success && json.data && Array.isArray(json.data.reels)) {
            let hasNew = false;
            const existingIds = new Set(approvedReels.map(r => r.id));
            json.data.reels.forEach(r => {
              if (!existingIds.has(r.id) && r.status === 'approved' && !r.hidden && (!r.title || !r.title.trim().startsWith('.'))) {
                approvedReels.unshift(r);
                existingIds.add(r.id);
                hasNew = true;
              }
            });
            if (hasNew) {
              window.dispatchEvent(new CustomEvent('dnm-data-synced'));
            }
          }
        })
        .catch(() => {});
    }

    return {
      clients: clientsList,
      reels: approvedReels,
      communityPosts: communityPosts
    };
  }

  function getClients() {
    return clientsList;
  }

  function getClient(idOrSlug) {
    if (!idOrSlug) return null;
    return clientsMap[idOrSlug] || clientsMap[idOrSlug.toLowerCase()] || null;
  }

  function getAllApprovedReels(includeHidden = false) {
    if (includeHidden) return approvedReels;
    return approvedReels.filter(r => !r.hidden);
  }

  function getClientReels(clientId) {
    return approvedReels.filter(r => r.c === clientId || r.c === clientsMap[clientId]?.id);
  }

  function getCommunityPosts() {
    return communityPosts;
  }

  function addCommunityPost(post) {
    addUploadedPost(post);
  }

  function addUploadedPost(post) {
    if (!post) return;
    const existingIdx = approvedReels.findIndex(r => r.id === post.id);
    if (existingIdx !== -1) {
      approvedReels[existingIdx] = post;
    } else {
      approvedReels.unshift(post);
    }

    const cIdx = communityPosts.findIndex(p => p.id === post.id);
    if (cIdx !== -1) {
      communityPosts[cIdx] = post;
    } else {
      communityPosts.unshift(post);
    }

    try {
      const stored = JSON.parse(localStorage.getItem('dnm_uploaded_posts') || '[]');
      const sIdx = stored.findIndex(p => p.id === post.id);
      if (sIdx !== -1) stored[sIdx] = post;
      else stored.unshift(post);
      localStorage.setItem('dnm_uploaded_posts', JSON.stringify(stored));
      localStorage.setItem('dnm_community_posts', JSON.stringify(communityPosts));
    } catch(_) {}

    window.dispatchEvent(new CustomEvent('dnm-post-added', { detail: { post } }));
  }

  function getSavedPosts() {
    const savedIds = new Set(JSON.parse(localStorage.getItem('dnm_saved_posts') || '[]'));
    return approvedReels.filter(r => savedIds.has(r.id));
  }

  function extractDriveId(str) {
    if (!str || typeof str !== 'string') return null;
    if (!str.includes('drive.google.com') && !str.includes('docs.google.com') && !str.includes('drive.usercontent.google.com')) {
      return null;
    }
    const match = str.match(/[-\w]{25,}/);
    return match ? match[0] : null;
  }

  function getStreamUrl(reel) {
    if (!reel) return '';
    const fileId = (reel.fileId && !reel.fileId.startsWith('drive_') && !reel.fileId.startsWith('post_') && !reel.fileId.startsWith('r'))
      ? reel.fileId
      : (extractDriveId(reel.url) || extractDriveId(reel.mediaUrl));
    if (fileId) {
      const tok = streamToken || (function() { try { return sessionStorage.getItem('dn_st'); } catch(_) { return ''; } })();
      const tokParam = tok ? `&token=${encodeURIComponent(tok)}` : '';
      return `https://daynight-portal.pages.dev/api/video?id=${encodeURIComponent(fileId)}${tokParam}&v=3`;
    }
    return reel.url || reel.mediaUrl || '';
  }

  function getMediaUrl(item) {
    if (!item) return '';
    if (typeof item.mediaUrl === 'string' && item.mediaUrl.startsWith('data:')) return item.mediaUrl;
    if (typeof item.coverUrl === 'string' && item.coverUrl.startsWith('data:')) return item.coverUrl;
    
    const fileId = (item.fileId && !item.fileId.startsWith('drive_') && !item.fileId.startsWith('post_') && !item.fileId.startsWith('r'))
      ? item.fileId
      : (extractDriveId(item.mediaUrl) || extractDriveId(item.url) || extractDriveId(item.coverUrl));

    if (fileId) {
      const tok = streamToken || (function() { try { return sessionStorage.getItem('dn_st'); } catch(_) { return ''; } })();
      const tokParam = tok ? `&token=${encodeURIComponent(tok)}` : '';
      return `https://daynight-portal.pages.dev/api/video?id=${encodeURIComponent(fileId)}${tokParam}&v=3`;
    }

    if (typeof item.mediaUrl === 'string' && !item.mediaUrl.includes('drive.google.com/file/d/')) {
      return item.mediaUrl;
    }
    if (typeof item.coverUrl === 'string' && !item.coverUrl.includes('drive.google.com/file/d/')) {
      return item.coverUrl;
    }
    return item.mediaUrl || item.coverUrl || item.url || '';
  }

  async function deletePost(postId) {
    if (!postId) return false;
    const targetId = String(postId).trim();

    approvedReels = approvedReels.filter(r => String(r.id).trim() !== targetId);
    communityPosts = communityPosts.filter(p => String(p.id).trim() !== targetId);

    try {
      const stored = JSON.parse(localStorage.getItem('dnm_uploaded_posts') || '[]');
      const filtered = stored.filter(p => String(p.id).trim() !== targetId);
      localStorage.setItem('dnm_uploaded_posts', JSON.stringify(filtered));
      localStorage.setItem('dnm_community_posts', JSON.stringify(communityPosts));

      const saved = JSON.parse(localStorage.getItem('dnm_saved_posts') || '[]');
      localStorage.setItem('dnm_saved_posts', JSON.stringify(saved.filter(id => id !== targetId)));
    } catch(_) {}

    if (window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) {
      fetch(window.DNM_CONFIG.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'deleteReel', id: targetId })
      }).catch(err => console.warn('GAS delete error:', err));
    }

    window.dispatchEvent(new CustomEvent('dnm-post-deleted', { detail: { postId: targetId } }));
    return true;
  }

  async function toggleHidePost(postId) {
    if (!postId) return false;
    const targetId = String(postId).trim();
    let currentHidden = false;

    const reel = approvedReels.find(r => String(r.id).trim() === targetId);
    if (reel) {
      reel.hidden = !reel.hidden;
      currentHidden = reel.hidden;
    }

    const cPost = communityPosts.find(p => String(p.id).trim() === targetId);
    if (cPost) {
      cPost.hidden = currentHidden;
    }

    try {
      const stored = JSON.parse(localStorage.getItem('dnm_uploaded_posts') || '[]');
      const sPost = stored.find(p => String(p.id).trim() === targetId);
      if (sPost) {
        sPost.hidden = currentHidden;
        localStorage.setItem('dnm_uploaded_posts', JSON.stringify(stored));
      }
      localStorage.setItem('dnm_community_posts', JSON.stringify(communityPosts));
    } catch(_) {}

    if (window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) {
      fetch(window.DNM_CONFIG.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'toggleHideReel', id: targetId })
      }).catch(err => console.warn('GAS toggleHide error:', err));
    }

    window.dispatchEvent(new CustomEvent('dnm-post-updated', { detail: { postId: targetId, hidden: currentHidden } }));
    return currentHidden;
  }

  async function updatePost(postId, updates = {}) {
    if (!postId) return null;
    const targetId = String(postId).trim();

    let updatedItem = null;
    const reel = approvedReels.find(r => String(r.id).trim() === targetId);
    if (reel) {
      Object.assign(reel, updates);
      updatedItem = reel;
    }

    const cPost = communityPosts.find(p => String(p.id).trim() === targetId);
    if (cPost) {
      Object.assign(cPost, updates);
      if (!updatedItem) updatedItem = cPost;
    }

    try {
      const stored = JSON.parse(localStorage.getItem('dnm_uploaded_posts') || '[]');
      const sPost = stored.find(p => String(p.id).trim() === targetId);
      if (sPost) {
        Object.assign(sPost, updates);
        localStorage.setItem('dnm_uploaded_posts', JSON.stringify(stored));
      }
      localStorage.setItem('dnm_community_posts', JSON.stringify(communityPosts));
    } catch(_) {}

    if (window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) {
      fetch(window.DNM_CONFIG.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'modifyReel',
          reel: {
            id: targetId,
            title: updates.title || updates.caption || ''
          }
        })
      }).catch(err => console.warn('GAS modifyReel error:', err));
    }

    window.dispatchEvent(new CustomEvent('dnm-post-updated', { detail: { post: updatedItem } }));
    return updatedItem;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function openPostManagementModal(post, onUpdated) {
    if (!post) return;
    const existing = document.getElementById('dnm-post-manage-modal');
    if (existing) existing.remove();

    const currentUser = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;
    const isOwner = currentUser && (
      post.authorId === currentUser.uid ||
      post.authorUsername === currentUser.username ||
      (currentUser.displayName && post.authorName === currentUser.displayName)
    );

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-post-manage-modal';
    scrim.innerHTML = `
      <div class="dnm-modal-dialog" style="max-width:320px;padding:0;overflow:hidden;border-radius:16px;text-align:center;">
        <div style="padding:16px 20px 12px;border-bottom:1px solid var(--ig-border);">
          <b style="font-size:15px;color:var(--ig-text-primary);display:block;margin-bottom:4px;">Manage Post</b>
          <span style="font-size:12px;color:var(--ig-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">${escapeHtml(post.title || 'Untitled Post')}</span>
          ${post.hidden ? '<span style="display:inline-block;margin-top:6px;font-size:11px;font-weight:700;color:var(--ig-accent);background:rgba(0,149,246,0.12);padding:2px 8px;border-radius:10px;">Hidden from Public Feed</span>' : ''}
        </div>
        
        <button type="button" id="dnm-pm-play" style="width:100%;padding:14px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-accent);font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>View / Play Post</span>
        </button>

        ${isOwner ? `
          <button type="button" id="dnm-pm-edit" style="width:100%;padding:14px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-text-primary);font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span>Edit Caption</span>
          </button>

          <button type="button" id="dnm-pm-hide" style="width:100%;padding:14px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-text-primary);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${post.hidden ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'}</svg>
            <span>${post.hidden ? 'Unhide (Make Public on Feed)' : 'Hide (Remove from Public Feed)'}</span>
          </button>

          <button type="button" id="dnm-pm-delete" style="width:100%;padding:14px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-error);font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>Delete Post</span>
          </button>
        ` : ''}

        <button type="button" id="dnm-pm-cancel" style="width:100%;padding:14px;background:none;border:none;color:var(--ig-text-secondary);font-size:14px;cursor:pointer;">
          <span>Cancel</span>
        </button>
      </div>
    `;
    document.body.appendChild(scrim);

    function close() { scrim.remove(); }
    scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
    scrim.querySelector('#dnm-pm-cancel')?.addEventListener('click', close);

    scrim.querySelector('#dnm-pm-play')?.addEventListener('click', () => {
      close();
      if (window.DNM_PLAYER) {
        window.DNM_PLAYER.openVideoPlaybackModal(post, [post]);
      }
    });

    scrim.querySelector('#dnm-pm-edit')?.addEventListener('click', () => {
      close();
      openEditCaptionModal(post, onUpdated);
    });

    scrim.querySelector('#dnm-pm-hide')?.addEventListener('click', async () => {
      close();
      const newHidden = await window.DNM_DATA.toggleHidePost(post.id);
      post.hidden = newHidden;
      if (window.DNM_FEED && window.DNM_FEED.showToast) {
        window.DNM_FEED.showToast(newHidden ? 'Post hidden from public feed' : 'Post is now visible on public feed');
      }
      if (onUpdated) onUpdated(post);
    });

    scrim.querySelector('#dnm-pm-delete')?.addEventListener('click', () => {
      close();
      openDeleteConfirmModal(post, onUpdated);
    });
  }

  function openEditCaptionModal(post, onUpdated) {
    if (!post) return;
    const existing = document.getElementById('dnm-edit-caption-modal');
    if (existing) existing.remove();

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-edit-caption-modal';
    scrim.innerHTML = `
      <div class="dnm-modal-dialog" style="max-width:360px;padding:20px;border-radius:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <b style="font-size:16px;color:var(--ig-text-primary);">Edit Caption</b>
          <button type="button" id="dnm-edit-close-x" style="background:none;border:none;font-size:20px;color:var(--ig-text-primary);cursor:pointer;">&times;</button>
        </div>
        <textarea id="dnm-edit-caption-input" style="width:100%;height:100px;background:var(--ig-surface);border:1px solid var(--ig-border);border-radius:10px;padding:10px 12px;color:var(--ig-text-primary);font-size:13.5px;resize:none;box-sizing:border-box;outline:none;" placeholder="Write a caption...">${escapeHtml(post.title || '')}</textarea>
        <div style="display:flex;gap:10px;margin-top:14px;">
          <button type="button" id="dnm-edit-cancel-btn" class="dnm-profile-btn" style="flex:1;padding:9px 0;">Cancel</button>
          <button type="button" id="dnm-edit-save-btn" class="dnm-profile-btn primary" style="flex:1;padding:9px 0;">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(scrim);

    function close() { scrim.remove(); }
    scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
    scrim.querySelector('#dnm-edit-close-x')?.addEventListener('click', close);
    scrim.querySelector('#dnm-edit-cancel-btn')?.addEventListener('click', close);

    scrim.querySelector('#dnm-edit-save-btn')?.addEventListener('click', async () => {
      const newTitle = scrim.querySelector('#dnm-edit-caption-input').value.trim();
      close();
      await window.DNM_DATA.updatePost(post.id, { title: newTitle, caption: newTitle });
      post.title = newTitle;
      post.caption = newTitle;
      if (window.DNM_FEED && window.DNM_FEED.showToast) {
        window.DNM_FEED.showToast('Caption updated successfully');
      }
      if (onUpdated) onUpdated(post);
    });
  }

  function openDeleteConfirmModal(post, onUpdated) {
    if (!post) return;
    const existing = document.getElementById('dnm-delete-confirm-modal');
    if (existing) existing.remove();

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-delete-confirm-modal';
    scrim.innerHTML = `
      <div class="dnm-modal-dialog" style="max-width:320px;padding:22px 20px;border-radius:16px;text-align:center;">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(237,73,86,0.12);color:var(--ig-error);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </div>
        <b style="font-size:16px;color:var(--ig-text-primary);display:block;margin-bottom:6px;">Delete Post?</b>
        <p style="font-size:13px;color:var(--ig-text-secondary);line-height:1.4;margin:0 0 18px;">Are you sure you want to delete this post? This action is permanent and cannot be undone.</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button type="button" id="dnm-confirm-delete-btn" style="width:100%;padding:11px;border-radius:10px;background:var(--ig-error);color:#FFF;border:none;font-weight:700;font-size:14px;cursor:pointer;">Delete</button>
          <button type="button" id="dnm-cancel-delete-btn" style="width:100%;padding:10px;border-radius:10px;background:var(--ig-surface);color:var(--ig-text-primary);border:1px solid var(--ig-border);font-size:13.5px;cursor:pointer;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(scrim);

    function close() { scrim.remove(); }
    scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
    scrim.querySelector('#dnm-cancel-delete-btn')?.addEventListener('click', close);

    scrim.querySelector('#dnm-confirm-delete-btn')?.addEventListener('click', async () => {
      close();
      await window.DNM_DATA.deletePost(post.id);
      if (window.DNM_FEED && window.DNM_FEED.showToast) {
        window.DNM_FEED.showToast('Post deleted');
      }
      if (onUpdated) onUpdated(post);
    });
  }

  window.DNM_MODALS = {
    openPostManagementModal,
    openEditCaptionModal,
    openDeleteConfirmModal
  };

  window.DNM_DATA = {
    loadData,
    getClients,
    getClient,
    getAllApprovedReels,
    getClientReels,
    getCommunityPosts,
    addCommunityPost,
    addUploadedPost,
    getSavedPosts,
    getStreamUrl,
    getMediaUrl,
    deletePost,
    toggleHidePost,
    updatePost
  };

})(window);
