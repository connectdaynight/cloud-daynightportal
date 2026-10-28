/**
 * Daynight-Media: Shared Real Data Layer
 * Syncs real approved contents and real client brand logos from portal-data.json
 */
(function(window) {
  'use strict';

  let rawData = null;
  let clientsList = [];
  let clientsMap = {};
  let basePortalReels = [];
  let firestorePostsList = [];
  let approvedReels = [];
  let communityPosts = [];
  // Stream token - loaded from storage adapter
  let streamToken = '';

  // Pre-warm authenticated video stream token for zero-buffer streaming
  async function fetchStreamToken() {
    try {
      const token = await window.DNM_STORAGE?.auth?.get('stream_token');
      if (token) {
        streamToken = token;
      } else {
        // Fallback to API call
        const apiUrl = window.DNM_CONFIG_HELPERS?.getApiUrl?.('/token') || '/api/token';
        const res = await fetch(apiUrl);
        if (res.ok) {
          const d = await res.json();
          if (d && d.token) {
            streamToken = d.token;
            await window.DNM_STORAGE?.auth?.set('stream_token', d.token);
          }
        }
      }
    } catch(_) {}
  }

  // Refresh token periodically (every 25 minutes) - with cleanup
  let tokenRefreshInterval = null;
  function startTokenRefresh() {
    if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = setInterval(fetchStreamToken, 25 * 60 * 1000);
  }
  function stopTokenRefresh() {
    if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
  }
  // Start on load
  startTokenRefresh();
  // Cleanup on unload
  window.addEventListener('beforeunload', stopTokenRefresh);

  function mergeAllReels() {
    const existingMap = new Map();
    const merged = [];

    // 1. Add all Firestore community/user posts (latest uploads first)
    firestorePostsList.forEach(p => {
      if (p && p.id && !p.hidden && !existingMap.has(String(p.id))) {
        existingMap.set(String(p.id), p);
        merged.push(p);
      }
    });

    // 2. Add base portal reels (brand reels)
    basePortalReels.forEach(r => {
      if (r && r.id && !r.hidden && !existingMap.has(String(r.id))) {
        existingMap.set(String(r.id), r);
        merged.push(r);
      }
    });

    approvedReels = merged;
    communityPosts = approvedReels.filter(r => !r.c || r.c === 'community' || !clientsMap[r.c]);
    window.dispatchEvent(new CustomEvent('dnm-data-synced'));
  }

  async function fetchFirestorePosts() {
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.ready) {
      try { await window.DNM_FIREBASE.ready(); } catch(_) {}
    }
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.db) {
      try {
        const snap = await window.DNM_FIREBASE.db.collection('posts')
          .where('status', '==', 'approved')
          .get();
        const posts = [];
        snap.forEach(doc => {
          const d = doc.data();
          if (d && !d.hidden) posts.push(Object.assign({ id: doc.id }, d));
        });
        posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        firestorePostsList = posts;
      } catch(err) {
        console.warn('Initial Firestore posts fetch:', err);
      }
    }
  }

  let firestorePostsSubscribed = false;
  function initFirestorePostsSync() {
    if (firestorePostsSubscribed) return;
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.syncPosts) {
      firestorePostsSubscribed = true;
      window.DNM_FIREBASE.syncPosts((posts) => {
        if (Array.isArray(posts)) {
          posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          firestorePostsList = posts;
          mergeAllReels();
        }
      });
    }
  }

  async function loadData() {
    // Fetch stream token, portal-data, and live Firestore posts in parallel
    const tokenPromise = fetchStreamToken();
    const firestorePromise = fetchFirestorePosts();

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

    await Promise.all([tokenPromise, firestorePromise]);

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
        clientsMap[c.id] = c;
        clientsMap[c.slug] = c;
      });

      // Strictly approved, playable brand reels
      basePortalReels = (rawData.reels || []).filter(r => 
        r.status === 'approved' && 
        !r.hidden && 
        (!r.title || !r.title.trim().startsWith('.'))
      );
    }

    // 3. Merge live Firestore posts and brand reels
    mergeAllReels();

    // 4. Listen for real-time Firestore post updates continuously
    initFirestorePostsSync();

    // 5. Background sync from GAS if needed
    if (window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) {
      fetch(window.DNM_CONFIG.gasUrl + '?action=getData&_cb=' + Date.now())
        .then(r => r.json())
        .then(json => {
          if (json && json.success && json.data && Array.isArray(json.data.reels)) {
            const existingMap = new Map(basePortalReels.map(r => [r.id, r]));
            json.data.reels.forEach(r => {
              if (r.status === 'approved' && !r.hidden && (!r.title || !r.title.trim().startsWith('.'))) {
                if (!existingMap.has(r.id)) {
                  basePortalReels.push(r);
                  existingMap.set(r.id, r);
                }
              }
            });
            mergeAllReels();
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

  async function addUploadedPost(post) {
    if (!post) return;
    const existingIdx = firestorePostsList.findIndex(p => p.id === post.id);
    if (existingIdx !== -1) {
      firestorePostsList[existingIdx] = post;
    } else {
      firestorePostsList.unshift(post);
    }
    mergeAllReels();

    try {
      const dataStorage = window.DNM_STORAGE_DATA || (window.DNM_STORAGE_DATA = new (window.StorageAdapter || window.DNM_STORAGE?.StorageAdapter)({ namespace: 'data' }));
      const stored = await dataStorage.getItem('uploaded_posts') || [];
      const sIdx = stored.findIndex(p => p.id === post.id);
      if (sIdx !== -1) stored[sIdx] = post;
      else stored.unshift(post);
      await dataStorage.setItem('uploaded_posts', stored);
      await dataStorage.setItem('community_posts', communityPosts);
    } catch (_) {}

    window.dispatchEvent(new CustomEvent('dnm-post-added', { detail: { post } }));
  }

  function isPhoto(item) {
    if (!item) return false;
    if (item.type === 'photo' || item.type === 'image') return true;
    if (item.type === 'reel' || item.type === 'video') return false;
    if (item.mimeType && item.mimeType.startsWith('image/')) return true;
    if (item.mimeType && item.mimeType.startsWith('video/')) return false;
    const testStr = `${item.mediaUrl || ''} ${item.coverUrl || ''} ${item.url || ''} ${item.filename || ''} ${item.title || ''}`;
    if (/\.(jpg|jpeg|png|webp|gif|avif|heic|bmp)(\?|$)/i.test(testStr)) return true;
    if (typeof item.mediaUrl === 'string' && item.mediaUrl.startsWith('data:image/')) return true;
    if (typeof item.coverUrl === 'string' && item.coverUrl.startsWith('data:image/') && (!item.mediaUrl || item.mediaUrl === item.coverUrl)) return true;
    return false;
  }

  function getAuthorInfo(item) {
    if (!item) return { isClient: false, name: 'Creator', handle: 'creator', avatar: './Logo/logo.png', isVerified: false };

    const clientObj = (item.c && item.c !== 'community') ? getClient(item.c) : null;
    if (clientObj) {
      return {
        isClient: true,
        name: clientObj.name,
        handle: clientObj.slug,
        avatar: clientObj.logo || './Logo/logo.png',
        isVerified: true
      };
    }

    const currentUser = (window.DNM_AUTH && window.DNM_AUTH.getCurrentUser) ? window.DNM_AUTH.getCurrentUser() : null;

    let isCurrentUser = false;
    if (currentUser) {
      if (item.authorId && item.authorId === currentUser.uid) isCurrentUser = true;
      if (item.authorUsername && currentUser.username && item.authorUsername.toLowerCase() === currentUser.username.toLowerCase()) isCurrentUser = true;
      if (currentUser.displayName && item.authorName && item.authorName.toLowerCase() === currentUser.displayName.toLowerCase()) isCurrentUser = true;

      try {
        const dataStorage = window.DNM_STORAGE_DATA || (window.DNM_STORAGE_DATA = new (window.StorageAdapter || window.DNM_STORAGE?.StorageAdapter)({ namespace: 'data' }));
        const stored = dataStorage.get('uploaded_posts', []) || [];
        if (Array.isArray(stored) && stored.some(p => p.id === item.id || (p.fileId && p.fileId === item.fileId))) {
          isCurrentUser = true;
        }
      } catch(_) {}
    }

    let rawName = item.authorName;
    let rawHandle = item.authorUsername;
    let rawAvatar = item.authorAvatar;

    if (isCurrentUser && currentUser) {
      if (!rawName || rawName === 'Creator') rawName = currentUser.displayName || currentUser.username;
      if (!rawHandle || rawHandle === 'creator') rawHandle = currentUser.username;
      if (!rawAvatar || rawAvatar.includes('Logo/logo.png')) rawAvatar = currentUser.photoURL;
    }

    const handle = (rawHandle && rawHandle !== 'creator') 
      ? rawHandle 
      : (rawName ? rawName.toLowerCase().replace(/[^a-z0-9_.]/g, '') : 'creator');

    let name = (rawName && rawName !== 'Creator') ? rawName : (handle !== 'creator' ? handle : 'Community Member');

    let avatar = rawAvatar;
    if (!avatar || avatar.includes('Logo/logo.png')) {
      if (isCurrentUser && currentUser && currentUser.photoURL && !currentUser.photoURL.includes('Logo/logo.png')) {
        avatar = currentUser.photoURL;
      } else {
        avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=262626&color=ffffff&bold=true`;
      }
    }

    return {
      isClient: false,
      name: name,
      handle: handle,
      avatar: avatar,
      isVerified: false
    };
  }

  async function getUserPosts(user) {
    if (!user) return [];
    let storedUploads = [];
    try {
      const dataStorage = window.DNM_STORAGE_DATA || (window.DNM_STORAGE_DATA = new (window.StorageAdapter || window.DNM_STORAGE?.StorageAdapter)({ namespace: 'data' }));
      storedUploads = await dataStorage.getItem('uploaded_posts') || [];
    } catch(_) {}

    const localIds = new Set(storedUploads.map(p => p.id));
    const localFileIds = new Set(storedUploads.map(p => p.fileId).filter(Boolean));
    const uName = (user.username || '').toLowerCase();
    const dName = (user.displayName || '').toLowerCase();
    const uid = user.uid;

    const all = getAllApprovedReels(true);
    const matched = all.filter(p => {
      if (localIds.has(p.id)) return true;
      if (p.fileId && localFileIds.has(p.fileId)) return true;
      if (uid && p.authorId === uid) return true;
      if (uName && p.authorUsername && p.authorUsername.toLowerCase() === uName) return true;
      if (dName && p.authorName && p.authorName.toLowerCase() === dName) return true;
      return false;
    });

    const matchedIds = new Set(matched.map(p => p.id));
    storedUploads.forEach(p => {
      if (!matchedIds.has(p.id)) {
        matched.unshift(p);
        matchedIds.add(p.id);
      }
    });

    return matched;
  }

  async function getSavedPosts() {
    try {
      const feedStorage = window.DNM_STORAGE_FEED || (window.DNM_STORAGE_FEED = new StorageAdapter({ namespace: 'feed' }));
      const savedIds = new Set(await feedStorage.getItem('saved_posts') || []);
      return approvedReels.filter(r => savedIds.has(r.id));
    } catch (_) {
      return [];
    }
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
      const tok = streamToken;
      const tokParam = tok ? `&token=${encodeURIComponent(tok)}` : '';
      // Use config helper if available, fallback to hardcoded
      const baseUrl = window.DNM_CONFIG_HELPERS?.getStreamUrl
        ? window.DNM_CONFIG_HELPERS.getStreamUrl(fileId, tok)
        : `https://daynight-portal.pages.dev/api/video?id=${encodeURIComponent(fileId)}${tokParam}&v=3`;
      return baseUrl;
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
      const tok = streamToken;
      const tokParam = tok ? `&token=${encodeURIComponent(tok)}` : '';
      const baseUrl = window.DNM_CONFIG_HELPERS?.getStreamUrl
        ? window.DNM_CONFIG_HELPERS.getStreamUrl(fileId, tok)
        : `https://daynight-portal.pages.dev/api/video?id=${encodeURIComponent(fileId)}${tokParam}&v=3`;
      return baseUrl;
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

    firestorePostsList = firestorePostsList.filter(p => String(p.id).trim() !== targetId);
    basePortalReels = basePortalReels.filter(r => String(r.id).trim() !== targetId);
    mergeAllReels();

    // Use StorageAdapter for local storage
    try {
      const stored = await window.DNM_STORAGE?.cache?.get('uploaded_posts', []);
      const filtered = stored.filter(p => String(p.id).trim() !== targetId);
      await window.DNM_STORAGE?.cache?.set('uploaded_posts', filtered);
      await window.DNM_STORAGE?.cache?.set('community_posts', communityPosts);

      const saved = await window.DNM_STORAGE?.social?.get('saved_posts', []);
      await window.DNM_STORAGE?.social?.set('saved_posts', saved.filter(id => id !== targetId));
    } catch(_) {}

    // Cloud Firestore Delete
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.deletePost) {
      window.DNM_FIREBASE.deletePost(targetId).catch(e => console.warn('Firestore delete error:', e));
    }

    // GAS Delete - use config helper
    const gasUrl = window.DNM_CONFIG_HELPERS?.getGasUrl?.('deleteReel', { id: targetId }) ||
      (window.DNM_CONFIG?.gasUrl ? `${window.DNM_CONFIG.gasUrl}?action=deleteReel&id=${targetId}` : '');
    if (gasUrl) {
      fetch(gasUrl, {
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

    const post = firestorePostsList.find(p => String(p.id).trim() === targetId) || basePortalReels.find(r => String(r.id).trim() === targetId);
    if (post) {
      post.hidden = !post.hidden;
      currentHidden = post.hidden;
    }
    mergeAllReels();

    // Use StorageAdapter for local storage
    try {
      const stored = await window.DNM_STORAGE?.cache?.get('uploaded_posts', []);
      const sPost = stored.find(p => String(p.id).trim() === targetId);
      if (sPost) {
        sPost.hidden = currentHidden;
        await window.DNM_STORAGE?.cache?.set('uploaded_posts', stored);
      }
      await window.DNM_STORAGE?.cache?.set('community_posts', communityPosts);
    } catch(_) {}

    // Cloud Firestore Update
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.updatePost) {
      window.DNM_FIREBASE.updatePost(targetId, { hidden: currentHidden }).catch(e => console.warn('Firestore updatePost error:', e));
    }

    // GAS Update - use config helper
    const gasUrl = window.DNM_CONFIG_HELPERS?.getGasUrl?.('toggleHideReel', { id: targetId }) ||
      (window.DNM_CONFIG?.gasUrl ? `${window.DNM_CONFIG.gasUrl}?action=toggleHideReel&id=${targetId}` : '');
    if (gasUrl) {
      fetch(gasUrl, {
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
    const post = firestorePostsList.find(p => String(p.id).trim() === targetId) || basePortalReels.find(r => String(r.id).trim() === targetId);
    if (post) {
      Object.assign(post, updates);
      updatedItem = post;
    }
    mergeAllReels();

    // Use StorageAdapter for local storage
    try {
      const stored = await window.DNM_STORAGE?.cache?.get('uploaded_posts', []);
      const sPost = stored.find(p => String(p.id).trim() === targetId);
      if (sPost) {
        Object.assign(sPost, updates);
        await window.DNM_STORAGE?.cache?.set('uploaded_posts', stored);
      }
      await window.DNM_STORAGE?.cache?.set('community_posts', communityPosts);
    } catch(_) {}

    // Cloud Firestore Update
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.updatePost) {
      window.DNM_FIREBASE.updatePost(targetId, updates).catch(e => console.warn('Firestore updatePost error:', e));
    }

    // GAS Update - use config helper
    const gasUrl = window.DNM_CONFIG_HELPERS?.getGasUrl?.('modifyReel', { id: targetId, title: updates.title || updates.caption || '' }) ||
      (window.DNM_CONFIG?.gasUrl ? `${window.DNM_CONFIG.gasUrl}?action=modifyReel&id=${targetId}&title=${encodeURIComponent(updates.title || updates.caption || '')}` : '');
    if (gasUrl) {
      fetch(gasUrl, {
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
    const userPosts = currentUser ? getUserPosts(currentUser) : [];
    const isOwner = currentUser && (
      post.authorId === currentUser.uid ||
      (post.authorUsername && currentUser.username && post.authorUsername.toLowerCase() === currentUser.username.toLowerCase()) ||
      (currentUser.displayName && post.authorName && post.authorName.toLowerCase() === currentUser.displayName.toLowerCase()) ||
      userPosts.some(up => up.id === post.id || (up.fileId && up.fileId === post.fileId))
    );

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-post-manage-modal';
    scrim.style.cssText = 'z-index: 1000000 !important; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.75); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);';
    
    const mediaThumb = window.DNM_DATA.getMediaUrl ? window.DNM_DATA.getMediaUrl(post) : (post.coverUrl || post.mediaUrl || './Logo/logo.png');
    const author = window.DNM_DATA.getAuthorInfo(post);

    scrim.innerHTML = `
      <div class="dnm-modal-dialog" style="max-width:340px;width:90%;padding:0;overflow:hidden;border-radius:22px;background:var(--ig-surface, #1e1e1e);border:1px solid rgba(255,255,255,0.12);box-shadow:0 24px 60px rgba(0,0,0,0.8);text-align:center;animation:dnmScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <!-- Post Preview Strip Header -->
        <div style="padding:18px 18px 14px;border-bottom:1px solid var(--ig-border);display:flex;align-items:center;gap:12px;text-align:left;">
          <div style="width:50px;height:50px;border-radius:12px;overflow:hidden;background:#000;flex-shrink:0;border:1px solid rgba(255,255,255,0.1);">
            <img src="${mediaThumb}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='./Logo/logo.png';">
          </div>
          <div style="flex:1;min-width:0;">
            <b style="font-size:14.5px;color:var(--ig-text-primary);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(post.title || post.caption || 'Community Post')}</b>
            <span style="font-size:12px;color:var(--ig-text-secondary);display:block;margin-top:2px;">@${escapeHtml(author.handle)}</span>
            ${post.hidden ? '<span style="display:inline-block;margin-top:4px;font-size:10.5px;font-weight:700;color:var(--ig-accent);background:rgba(0,149,246,0.14);padding:2px 8px;border-radius:8px;">Hidden from Public Feed</span>' : ''}
          </div>
        </div>
        
        <button type="button" id="dnm-pm-play" style="width:100%;padding:14px 18px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-accent);font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:background 0.15s ease;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>View / Play Post</span>
        </button>

        ${isOwner ? `
          <button type="button" id="dnm-pm-edit" style="width:100%;padding:14px 18px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-text-primary);font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:background 0.15s ease;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span>Edit Caption</span>
          </button>

          <button type="button" id="dnm-pm-hide" style="width:100%;padding:14px 18px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-text-primary);font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:background 0.15s ease;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">${post.hidden ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'}</svg>
            <span>${post.hidden ? 'Unhide (Make Public on Feed)' : 'Hide (Remove from Public Feed)'}</span>
          </button>

          <button type="button" id="dnm-pm-delete" style="width:100%;padding:14px 18px;background:none;border:none;border-bottom:1px solid var(--ig-border);color:var(--ig-error);font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:background 0.15s ease;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>Delete Post</span>
          </button>
        ` : ''}

        <button type="button" id="dnm-pm-cancel" style="width:100%;padding:14px;background:none;border:none;color:var(--ig-text-secondary);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s ease;">
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
    scrim.style.cssText = 'z-index: 1000000 !important; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.75); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);';
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
    scrim.style.cssText = 'z-index: 1000000 !important; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.75); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);';
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
    getUserPosts,
    getAuthorInfo,
    isPhoto,
    getSavedPosts,
    getStreamUrl,
    getMediaUrl,
    deletePost,
    toggleHidePost,
    updatePost
  };

})(window);
