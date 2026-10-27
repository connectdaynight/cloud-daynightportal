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
  let streamToken = '';

  // Pre-warm authenticated video stream token
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

  function getAllApprovedReels() {
    return approvedReels;
  }

  function getClientReels(clientId) {
    return approvedReels.filter(r => r.c === clientId || r.c === clientsMap[clientId]?.id);
  }

  function getCommunityPosts() {
    return communityPosts;
  }

  function addCommunityPost(post) {
    communityPosts.unshift(post);
    try {
      localStorage.setItem('dnm_community_posts', JSON.stringify(communityPosts));
    } catch(_) {}
    window.dispatchEvent(new CustomEvent('dnm-post-added', { detail: { post } }));
  }

  function getStreamUrl(reel) {
    if (!reel) return '';
    const fileId = reel.fileId || (reel.url ? (reel.url.match(/[-\w]{25,}/) || [])[0] : null);
    if (fileId) {
      const tok = streamToken || (function() { try { return sessionStorage.getItem('dn_st'); } catch(_) { return ''; } })();
      const tokParam = tok ? `&token=${encodeURIComponent(tok)}` : '';
      return `https://daynight-portal.pages.dev/api/video?id=${encodeURIComponent(fileId)}${tokParam}&v=3`;
    }
    return reel.url || '';
  }

  window.DNM_DATA = {
    loadData,
    getClients,
    getClient,
    getAllApprovedReels,
    getClientReels,
    getCommunityPosts,
    addCommunityPost,
    getStreamUrl
  };

})(window);
