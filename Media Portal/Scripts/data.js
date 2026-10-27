/**
 * Daynight-Media: Shared Data Layer
 * Syncs approved contents from Client Portal & Google Drive backend
 */
(function(window) {
  'use strict';

  let rawData = null;
  let clientsMap = {};
  let approvedReels = [];
  let communityPosts = [];

  // Load community posts persisted locally
  try {
    const rawComm = localStorage.getItem('dnm_community_posts');
    if (rawComm) communityPosts = JSON.parse(rawComm);
  } catch(_) {}

  async function loadData() {
    try {
      // 1. Fetch portal-data.json
      const res = await fetch('/portal-data.json?t=' + Date.now());
      if (res.ok) {
        rawData = await res.json();
      }
    } catch(err) {
      console.warn('Local portal-data.json fetch notice, checking fallback:', err);
    }

    // Fallback to GAS backend if local json fetch failed
    if (!rawData && window.DNM_CONFIG && window.DNM_CONFIG.gasUrl) {
      try {
        const gasRes = await fetch(window.DNM_CONFIG.gasUrl + '?action=getData');
        const json = await gasRes.json();
        if (json.success && json.data) rawData = json.data;
      } catch(e) {
        console.error('GAS loadData failed:', e);
      }
    }

    if (rawData) {
      (rawData.clients || []).forEach(c => {
        clientsMap[c.id] = c;
        if (c.slug) clientsMap[c.slug] = c;
      });

      // Strictly approved reels only!
      approvedReels = (rawData.reels || []).filter(r => r.status === 'approved' && !r.hidden);
    }

    return {
      clients: rawData ? (rawData.clients || []) : [],
      reels: approvedReels,
      communityPosts: communityPosts
    };
  }

  function getClient(idOrSlug) {
    return clientsMap[idOrSlug] || null;
  }

  function getAllApprovedReels() {
    return approvedReels;
  }

  function getClientReels(clientId) {
    return approvedReels.filter(r => r.c === clientId);
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
      return `/api/video?id=${encodeURIComponent(fileId)}&v=3`;
    }
    return reel.url || '';
  }

  window.DNM_DATA = {
    loadData,
    getClient,
    getAllApprovedReels,
    getClientReels,
    getCommunityPosts,
    addCommunityPost,
    getStreamUrl
  };

})(window);
