  (function() {
    'use strict';

    // Application State & Configuration (100% Cloud-Driven)
    let DATA = {
      settings: {
        agency: "Day Night Media",
        agencySub: "Production Company",
        slogan: "Creating impact that brands remember",
        introDuration: 6,
        sitePaused: false,
        sitePauseMsg: "Day Night Media Portal is temporarily undergoing scheduled updates. Please check back shortly.",
        downloadsPaused: false,
        sharesPaused: false,
        showSocialLinks: true,
        social: {
          instagram: "",
          youtube: "",
          facebook: "",
          whatsapp: "",
          x: "",
          linkedin: "",
          email: ""
        }
      },
      clients: [],
      reels: [],
      deletedReelIds: [],
      deletedClientIds: []
    };

    // Load cloud cache immediately for instant startup (using StorageAdapter)
    async function loadInitialCache() {
      try {
        // Wait for storage adapter to be ready
        await new Promise(r => {
          if (window.DNM_STORAGE) r();
          else document.addEventListener('DOMContentLoaded', r, { once: true });
        });
        const cached = await window.DNM_STORAGE.cache.get('cloud_cache');
        if (cached) {
          if (Array.isArray(cached.clients)) DATA.clients = cached.clients;
          if (Array.isArray(cached.reels)) DATA.reels = cached.reels;
          if (cached.settings) DATA.settings = Object.assign(DATA.settings, cached.settings);
          if (Array.isArray(cached.deletedReelIds)) DATA.deletedReelIds = cached.deletedReelIds;
          if (Array.isArray(cached.deletedClientIds)) DATA.deletedClientIds = cached.deletedClientIds;
        }
      } catch(e) {
        console.warn('Initial cache load failed:', e);
      }
    }
    loadInitialCache();

    // Immediate fallback if local cache is empty
    if (!DATA.clients || DATA.clients.length === 0) {
      try {
        fetch('/portal-data.json')
          .then(r => r.json())
          .then(snap => {
            if (snap && Array.isArray(snap.clients) && (!DATA.clients || DATA.clients.length === 0)) {
              DATA.clients = snap.clients;
              if (Array.isArray(snap.reels) && (!DATA.reels || DATA.reels.length === 0)) DATA.reels = snap.reels;
              if (snap.settings && !DATA.settings) DATA.settings = snap.settings;
            }
          })
          .catch(() => {});
      } catch(_) {}
    }

    // Pre-warm authenticated video stream token for zero-buffer playback
    try {
      fetch('/api/token')
        .then(r => r.json())
        .then(d => {
          if (d && d.token) {
            window.__DN_STREAM_TOKEN__ = d.token;
            try {
              window.DNM_STORAGE?.auth?.set('stream_token', d.token);
              sessionStorage.setItem('dn_st', d.token);
            } catch(_) {}
          }
        })
        .catch(() => {});
    } catch(_) {}

    const syncHub = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('daynight_live_sync') : null;

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const MCOL = ['#2F7DF6','#E8457A','#17A598','#F2992E','#6C5CE7','#1FAF64','#E5533D','#0EA5C6','#C2410C','#D946EF','#8B5E34','#DC2626'];
    const BCOL = ['#E8457A','#17A598','#F2992E','#6C5CE7','#2F7DF6','#1FAF64'];
    const RCOL = ['#B0174B','#0F7C73','#C9701A','#5144C9','#1F5FC9','#16884D','#9C2A2A'];
    const TAGCOL = ['#E53225','#2F7DF6','#1FAF64','#F2992E','#6C5CE7','#E8457A','#17A598'];
    const TODAY = new Date();
    const app = document.getElementById('app');
    const toastContainer = document.getElementById('toasts');

    // Configuration loaded from runtime config (injected at build time)
    const RUNTIME_CONFIG = window.DNM_RUNTIME_CONFIG || {};
    const CONFIG_HELPERS = window.DNM_CONFIG_HELPERS || {};

    const DEFAULT_GAS_URL = RUNTIME_CONFIG.gasUrl || 'https://script.google.com/macros/s/AKfycbxTaYOdXlJ8Sy-yfbh68gq4iJn1ThlQXoTY83Bc75tlPYcQrbz1lv_WWfDySu4CYaGE/exec';
    const ADMIN_PASSKEY = RUNTIME_CONFIG.adminPasskey || 'DN@2026';

    // Load gasUrl from config storage (with fallback to runtime config)
    async function getGasUrl() {
      try {
        const stored = await window.DNM_STORAGE?.config?.get('gas_url');
        return stored || DEFAULT_GAS_URL;
      } catch {
        return DEFAULT_GAS_URL;
      }
    }

    function isMasterAdminAuth(val) {
      if (!val) return false;
      const s = String(val).trim();
      return s === ADMIN_PASSKEY;
    }

    const CONFIG = {
      get gasUrl() { return getGasUrl(); },
      adminPasskey: ADMIN_PASSKEY,
      // Admin features are strictly hidden from client portal unless URL explicitly has ?admin=1
      isAdmin: location.search.includes('admin=1')
    };

    async function activateAdminMode() {
      CONFIG.isAdmin = true;
      await window.DNM_STORAGE?.auth?.set('admin_auth', ADMIN_PASSKEY);
      toast('Admin Mode Active', 'success');
    }

    let connectionState = {
      status: 'testing',
      message: 'Checking Google Drive...'
    };

    let view = {
      screen: 'splash',
      client: null,
      year: TODAY.getFullYear(),
      month: null,
      branch: null,
      album: null,
      tabMode: 'months', // 'months' | 'branches' | 'albums'
      contentType: 'all', // 'all' | 'reels' | 'stories' | 'posters'
      searchQuery: '',
      gridCols: 2, // 2 | 3 | 1
      monthPickerOpen: false
    };

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const W = '#fff';

    const dnLogo = cls => `<svg class="dn ${cls}" viewBox="0 0 100 100" role="img" aria-label="Day Night"><circle cx="50" cy="50" r="50" fill="#E53225"/><path class="scrib" pathLength="1" d="M26 42C40 33 55 27 62 29C68 31 64 36 56 41L30 55C22 60 24 64 33 61C49 55 68 47 76 47C82 47 80 52 72 58L50 71C43 76 45 78 53 76L66 72" fill="none" stroke="#F4F4F4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const ic = {
      back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12294A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
      play: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
      view: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
      dl: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13m0 0l-4-4m4 4l4-4"/><path d="M5 21h14"/></svg>',
      share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
      copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      wa: `<svg width="17" height="17" viewBox="0 0 24 24" fill="${W}"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm5.6 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1a17 17 0 01-1.7-.6 13 13 0 01-5-4.4c-.4-.5-1-1.5-1-2.8s.7-2 1-2.3c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.3 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.4z"/></svg>`,
      tg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="${W}"><path d="M21.5 4.3L2.9 11.5c-1 .4-1 1.6 0 1.9l4.6 1.4 1.8 5.5c.2.7 1.1.9 1.6.4l2.6-2.4 4.7 3.5c.6.4 1.4.1 1.6-.6l3.2-15.4c.2-.9-.6-1.6-1.5-1.5zM9.8 14.4l-.4 3.6-1.4-4.2 9.6-6.3-7.8 6.9z"/></svg>`,
      pin: `<svg width="24" height="24" viewBox="0 0 24 24" fill="${W}"><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/></svg>`,
      folder: `<svg width="24" height="24" viewBox="0 0 24 24" fill="${W}"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`,
      key: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${W}" stroke-width="2.2" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9m-4 4l3 3m-6 0l2 2"/></svg>`,
      film: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#B8935A" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9h18M7 5v4M12 5v4M17 5v4M10 12.5v4l3.5-2z"/></svg>',
      arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14m-6-6l6 6-6 6"/></svg>',
      gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#12294A" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>'
    };

    const motif = `<svg class="motif" viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="1.4"><circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="34" stroke-dasharray="2 4"/><circle cx="50" cy="50" r="22"/>${Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return `<path d="M50 50 Q${(50+Math.cos(a-.3)*30).toFixed(1)} ${(50+Math.sin(a-.3)*30).toFixed(1)} ${(50+Math.cos(a)*42).toFixed(1)} ${(50+Math.sin(a)*42).toFixed(1)} Q${(50+Math.cos(a+.3)*30).toFixed(1)} ${(50+Math.sin(a+.3)*30).toFixed(1)} 50 50"/>`}).join('')}</svg>`;

    function getFallbackThumbnailSvg(title, subtitle) {
      const cleanTitle = (title || 'Video Reel').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const cleanSub = (subtitle || 'Day Night VIP').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 960" width="540" height="960">
  <defs>
    <linearGradient id="fbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d"/>
      <stop offset="45%" stop-color="#141e33"/>
      <stop offset="100%" stop-color="#060913"/>
    </linearGradient>
    <linearGradient id="fgold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F6D365"/>
      <stop offset="100%" stop-color="#FDA085"/>
    </linearGradient>
    <radialGradient id="fglow" cx="50%" cy="45%" r="45%">
      <stop offset="0%" stop-color="#2F7DF6" stop-opacity="0.32"/>
      <stop offset="60%" stop-color="#1E3A8A" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#060913" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="540" height="960" fill="url(#fbg)"/>
  <rect width="540" height="960" fill="url(#fglow)"/>
  <rect x="24" y="24" width="492" height="912" rx="28" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
  <g transform="translate(270, 72)">
    <rect x="-70" y="-16" width="140" height="32" rx="16" fill="rgba(255,255,255,0.05)" stroke="rgba(212,175,55,0.4)" stroke-width="1"/>
    <text x="0" y="5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="#d4af37" letter-spacing="2">DAY NIGHT</text>
  </g>
  <g transform="translate(270, 430)">
    <circle cx="0" cy="0" r="56" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
    <circle cx="0" cy="0" r="44" fill="url(#fgold)"/>
    <polygon points="-8,-16 16,0 -8,16" fill="#0b1329"/>
  </g>
  <g transform="translate(270, 740)">
    <rect x="-220" y="-75" width="440" height="126" rx="20" fill="rgba(10,15,29,0.72)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="0" y="-26" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="#ffffff" letter-spacing="0.3">${cleanTitle}</text>
    <text x="0" y="8" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500" fill="rgba(255,255,255,0.6)" letter-spacing="1">${cleanSub}</text>
    <text x="0" y="34" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="#2F7DF6" letter-spacing="1.5">PREVIEW REEL</text>
  </g>
</svg>`;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    const client = () => (DATA.clients || []).find(c => c.id === view.client) || null;

    function isClientMatch(rCid, targetCid) {
      if (!rCid || !targetCid) return false;
      if (rCid === targetCid) return true;
      if ((rCid === 'tcs' || rCid === 'cmvje2zfy') && (targetCid === 'tcs' || targetCid === 'cmvje2zfy')) return true;
      return false;
    }

    function driveId(u) {
      if (!u) return null;
      const m = u.match(/\/d\/([\w-]{15,})/) || u.match(/[?&]id=([\w-]{15,})/) || u.match(/([\w-]{25,})/);
      return m ? m[1] : null;
    }

    const viewUrl = u => {
      const id = driveId(u);
      return id ? `https://drive.google.com/file/d/${id}/view` : u;
    };

    const previewUrl = u => {
      const id = driveId(u);
      return id ? `https://drive.google.com/file/d/${id}/preview` : u;
    };

    const dlUrl = u => {
      const id = driveId(u);
      return id ? `https://drive.google.com/uc?export=download&id=${id}` : u;
    };

    function getStreamUrl(reel) {
      if (!reel) return '';
      const id = reel.fileId || driveId(reel.url);
      if (!id) return reel.url || '';
      if (typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        const tok = window.__DN_STREAM_TOKEN__ || window.DNM_STORAGE?.auth?.get('stream_token') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('dn_st') : '') || '';
        return CONFIG_HELPERS.getApiUrl ? CONFIG_HELPERS.getApiUrl(`/video?id=${encodeURIComponent(id)}${tok ? '&token=' + encodeURIComponent(tok) : ''}&v=3`) : `/api/video?id=${encodeURIComponent(id)}${tok ? '&token=' + encodeURIComponent(tok) : ''}&v=3`;
      }
      return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
    }
    window.getStreamUrl = getStreamUrl;

    // Filter contents by year, month, branch, album, and type (strictly for active client, real data only)
    const contentsFor = (y, m, b, alb, type) => (DATA.reels || []).filter(r => {
      if (!view.client || !isClientMatch(r.c, view.client)) return false;
      if (!CONFIG.isAdmin && r.hidden === true) return false;
      if (!CONFIG.isAdmin && r.status !== 'approved') return false;
      if (y != null && r.y !== y) return false;
      if (m != null && r.m !== m) return false;
      if (b != null && b !== 'all') {
        const tb = b.toLowerCase();
        const rb = (r.b || r.album || '').toLowerCase();
        if (!rb.includes(tb) && !tb.includes(rb)) return false;
      }
      if (alb != null && alb !== 'all' && r.album !== alb) return false;
      if (type) {
        if (type === 'reels' || type === 'reel') return !r.type || r.type === 'reel' || r.type === 'video';
        if (type === 'stories' || type === 'story') return r.type === 'story';
        if (type === 'posters' || type === 'poster') return r.type === 'poster';
      }
      return true;
    }).sort((a,b) => {
      if (a.order != null && b.order != null) return a.order - b.order;
      return 0; // Preserves real-time custom video arrangement from admin
    });
    const reelsFor = (y, m, b, alb) => contentsFor(y, m, b, alb, 'reels');

    const fmtDate = d => {
      try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short' }); }
      catch(e) { return d; }
    };

    const bColor = (b, list) => {
      const c = client();
      const arr = list || (c && c.branches ? c.branches : []);
      return BCOL[Math.max(0, arr.indexOf(b)) % BCOL.length];
    };

    const clientLogo = (c, cls='') => (c && c.logo) ? `<img class="${cls}" src="${esc(c.logo)}" alt="${esc(c.name)}">` : `<div class="wordmark ${cls}">${esc(c ? c.name : 'Client')}</div>`;

    function tagSpans(c) {
      if (!c) return '';
      const t = c.tagline || '';
      const w = c.accent || '';
      const st = w ? t.indexOf(w) : -1;
      let k = 0;
      return [...t].map((ch, i) => {
        const col = (st >= 0 && i >= st && i < st + w.length && ch !== ' ') ? TAGCOL[(k++) % TAGCOL.length] : '';
        return `<span class="ch"${col ? ` style="color:${col}"` : ''}>${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`;
      }).join('');
    }

    const topbar = (small, title) => `
      <div class="top">
        <button class="back" data-act="back" aria-label="Back">${ic.back}</button>
        <div class="crumb"><small>${esc(small)}</small><span>${esc(title)}</span></div>
        ${dnLogo('mini')}
      </div>`;

    // Client Authentication Persistence (Session & Local) - using StorageAdapter
    function isClientAuthenticated(cid) {
      if (!cid) return false;
      try {
        const auth = window.DNM_STORAGE?.auth?.get('client_' + cid);
        if (typeof auth === 'boolean') return auth;
        return sessionStorage.getItem('dn_auth_' + cid) === 'true';
      } catch {
        return sessionStorage.getItem('dn_auth_' + cid) === 'true';
      }
    }
    function setClientAuthenticated(cid) {
      if (!cid) return;
      try { window.DNM_STORAGE?.auth?.set('client_' + cid, true); } catch(_) {}
      sessionStorage.setItem('dn_auth_' + cid, 'true');
    }
    function clearClientAuthentication(cid) {
      if (!cid) return;
      try { window.DNM_STORAGE?.auth?.delete('client_' + cid); } catch(_) {}
      sessionStorage.removeItem('dn_auth_' + cid);
    }

    let isClosingModalViaHistory = false;
    let isProgrammaticHistoryBack = false;

    function go(p, isBack = false) {
      Object.assign(view, p);
      if (!isBack) {
        try { window.history.pushState({ view: { ...view } }, ''); } catch(e) {}
      }
      render();
      window.scrollTo(0, 0);
    }

    // Initialize initial state in history with manual scroll restoration
    if ('scrollRestoration' in history) {
      try { history.scrollRestoration = 'manual'; } catch(_) {}
    }
    try { window.history.replaceState({ view: { ...view } }, ''); } catch(e) {}

    // Back Button Navigation Handling (Prevents closing website on back swipe/press)
    window.addEventListener('popstate', e => {
      if (isProgrammaticHistoryBack) {
        isProgrammaticHistoryBack = false;
        return;
      }
      const scrims = document.querySelectorAll('.scrim');
      if (scrims.length > 0) {
        isClosingModalViaHistory = true;
        scrims.forEach(s => {
          s.querySelectorAll('video').forEach(v => { try { v.pause(); v.src = ''; } catch(_) {} });
          s.remove();
        });
        document.body.classList.remove('has-modal');
        document.documentElement.classList.remove('has-modal');
        const bNav = document.querySelector('.client-bottom-nav');
        if (bNav) bNav.style.display = '';
        isClosingModalViaHistory = false;
        return;
      }
      // If user is inside client portal and already at genesis root, stay on genesis - never logout!
      if (view.client && (view.screen === 'genesis' || !BACK[view.screen])) {
        return;
      }
      if (e.state && e.state.view) {
        // Protect client portal session from accidental unauthenticated history states
        if (view.client && (e.state.view.screen === 'landing' || e.state.view.screen === 'splash' || !e.state.view.client)) {
          go({ screen: 'genesis', client: view.client }, true);
          return;
        }
        Object.assign(view, e.state.view);
        render();
        window.scrollTo(0, 0);
      } else if (BACK[view.screen]) {
        go(BACK[view.screen], true);
      }
    });

    const BACK = {
      'dn-intro': { screen: 'splash', client: null },
      'client-pin': { screen: 'splash', client: null },
      landing: { screen: 'splash', client: null },
      'client-landing': { screen: 'splash', client: null },
      genesis: null, // Keep on genesis when back is pressed while authenticated; do not logout!
      preapproval: { screen: 'genesis' },
      months: { screen: 'genesis' },
      branches: { screen: 'genesis', branch: null },
      collections: { screen: 'genesis', album: null },
      albums: { screen: 'genesis', album: null },
      reels: { screen: 'genesis', branch: null, album: null },
      favorites: { screen: 'genesis' },
      profile: { screen: 'genesis' }
    };

    // Zero Legacy Alert Toast System
    function toast(msg, type = 'info') {
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      toastContainer.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-10px)';
        el.style.transition = 'all 0.3s ease';
        setTimeout(() => el.remove(), 300);
      }, 2600);
    }

    // Global Website Loading Indicator (Issue #7)
    function showSiteLoader() {
      const el = document.getElementById('site-global-loader');
      if (el) el.classList.add('active');
    }
    function hideSiteLoader() {
      const el = document.getElementById('site-global-loader');
      if (el) el.classList.remove('active');
    }

    // Custom Modal Bottom / Center Sheet (Protected against accidental backdrop close)
    function sheet(html, onMount, center, customClass) {
      const savedScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (customClass !== 'share-modal-scrim') {
        document.querySelectorAll('.scrim:not(.share-modal-scrim)').forEach(el => el.remove());
      }
      const sc = document.createElement('div');
      sc.className = 'scrim' + (center ? ' center' : '') + (customClass ? ' ' + customClass : '');
      const isVideoModal = customClass === 'video-modal-scrim';
      sc.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${(center || isVideoModal) ? '' : '<div class="grab"></div>'}${html}</div>`;
      sc.addEventListener('click', e => {
        if (e.target.closest('[data-close]') || (customClass === 'share-modal-scrim' && e.target === sc)) sc.remove();
      });
      document.body.appendChild(sc);
      document.body.classList.add('has-modal');
      document.documentElement.classList.add('has-modal');
      const bNav = document.querySelector('.client-bottom-nav');
      if (bNav) bNav.style.display = 'none';

      // Silence & halt all background feed videos when any sheet/modal is created
      if (feedAutoplayObserver) {
        try { feedAutoplayObserver.disconnect(); } catch(_) {}
        feedAutoplayObserver = null;
      }
      document.querySelectorAll('.dn-feed-video').forEach(v => {
        try {
          v.pause();
          v.muted = true;
        } catch(_) {}
        const w = v.closest('.dn-feed-media-wrap');
        if (w) w.classList.remove('is-playing');
      });

      // Track modal in browser history for back button support
      try { window.history.pushState({ modalOpen: true, t: Date.now() }, ''); } catch(e) {}
      const origRemove = sc.remove.bind(sc);
      sc.remove = function() {
        try {
          sc.querySelectorAll('video, audio, iframe').forEach(m => {
            try {
              m.pause();
              m.muted = true;
              m.removeAttribute('src');
              m.load();
            } catch(_) {}
          });
        } catch(_) {}
        origRemove();
        if (!document.querySelector('.scrim')) {
          document.body.classList.remove('has-modal');
          document.documentElement.classList.remove('has-modal');
          const nav = document.querySelector('.client-bottom-nav');
          if (nav && view.client && view.screen !== 'splash' && view.screen !== 'client-pin') {
            nav.style.display = '';
          }
          if (view.screen === 'genesis') {
            setTimeout(() => {
              try { initFeedAutoplay(); } catch(_) {}
            }, 120);
          }
        }
        window.scrollTo({ top: savedScrollY, behavior: 'instant' });
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedScrollY, behavior: 'instant' });
        });
        let hasModalHistory = false;
        try { hasModalHistory = !!(window.history.state && window.history.state.modalOpen); } catch(_) {}
        if (!isClosingModalViaHistory && hasModalHistory) {
          isProgrammaticHistoryBack = true;
          try { window.history.back(); } catch(e) {}
          setTimeout(() => { isProgrammaticHistoryBack = false; }, 350);
        }
      };

      // Swiping down bottom sheets (like share modal) = closing it
      const sheetEl = sc.querySelector('.sheet');
      if (sheetEl && !center && !isVideoModal) {
        let touchStartY = 0, currentDeltaY = 0, isDragging = false;

        sheetEl.addEventListener('touchstart', e => {
          if (e.touches.length === 1 && sheetEl.scrollTop <= 0) {
            touchStartY = e.touches[0].clientY;
            currentDeltaY = 0;
            isDragging = true;
          }
        }, { passive: true });

        sheetEl.addEventListener('touchmove', e => {
          if (!isDragging) return;
          const diff = e.touches[0].clientY - touchStartY;
          if (diff > 0) {
            currentDeltaY = diff;
            sheetEl.style.transition = 'none';
            sheetEl.style.transform = `translateY(${diff}px)`;
          } else {
            sheetEl.style.transform = '';
          }
        }, { passive: true });

        const finishDrag = () => {
          if (!isDragging) return;
          isDragging = false;
          if (currentDeltaY > 70) {
            sheetEl.style.transition = 'transform 0.22s ease-out, opacity 0.22s ease-out';
            sheetEl.style.transform = 'translateY(100%)';
            sheetEl.style.opacity = '0';
            setTimeout(() => sc.remove(), 220);
          } else {
            sheetEl.style.transition = 'transform 0.24s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
            sheetEl.style.transform = '';
          }
        };

        sheetEl.addEventListener('touchend', finishDrag, { passive: true });
        sheetEl.addEventListener('touchcancel', finishDrag, { passive: true });
      }

      onMount && onMount(sc);
      return sc;
    }

    // Custom Confirmation Dialog (Preserves exact scroll position)
    function confirmModal(title, message, onConfirm, confirmText = 'Confirm', isDanger = false, explicitScrollY = null) {
      const savedScrollY = explicitScrollY != null ? explicitScrollY : (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0);
      sheet(`
        <h4>${esc(title)}</h4>
        <p>${esc(message)}</p>
        <button class="go" id="c-yes" style="${isDanger ? 'background:var(--red)' : ''}">${esc(confirmText)}</button>
        <button class="ghost" data-close>Cancel</button>`, sc => {
        sc.querySelector('#c-yes').addEventListener('click', () => {
          sc.remove();
          onConfirm && onConfirm();
          window.scrollTo({ top: savedScrollY, behavior: 'instant' });
          requestAnimationFrame(() => {
            window.scrollTo({ top: savedScrollY, behavior: 'instant' });
          });
        });
        const cancelBtn = sc.querySelector('[data-close]');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            requestAnimationFrame(() => {
              window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            });
          });
        }
      }, true);
    }

    // Custom Prompt Dialog (No window.prompt)
    function promptModal(title, label, defaultValue, onSubmit, placeholder = '') {
      sheet(`
        <h4>${esc(title)}</h4>
        <div class="field">
          <label for="p-val">${esc(label)}</label>
          <input id="p-val" value="${esc(defaultValue || '')}" placeholder="${esc(placeholder)}" autofocus>
        </div>
        <button class="go" id="p-submit">Submit</button>
        <button class="ghost" data-close>Cancel</button>`, sc => {
        const inp = sc.querySelector('#p-val');
        sc.querySelector('#p-submit').addEventListener('click', () => {
          const val = inp.value.trim();
          if (val) {
            sc.remove();
            onSubmit && onSubmit(val);
          }
        });
        inp.onkeydown = e => { if (e.key === 'Enter') sc.querySelector('#p-submit').click(); };
        setTimeout(() => inp.focus(), 120);
      }, true);
    }

    // Google Apps Script Engine API
    async function gasApi(action, payload = {}) {
      const gasUrl = await CONFIG.gasUrl;
      if (!gasUrl) throw new Error('Backend URL not configured');
      payload.action = action;
      payload.passkey = CONFIG.adminPasskey;

      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    }

    // Network Upload via standard fetch with progress simulation (CORS preflight-safe)
    async function gasApiWithProgress(action, payload, onProgress) {
      const gasUrl = await CONFIG.gasUrl;
      if (!gasUrl) throw new Error('Backend URL not configured');
      payload.action = action;
      payload.passkey = CONFIG.adminPasskey;

      const totalBytes = payload.base64Data ? payload.base64Data.length : 1000000;
      let currentPct = 10;
      let progressTimer = null;

      if (onProgress) {
        onProgress({ loaded: Math.round(totalBytes * 0.1), total: totalBytes, percent: 10 });
        progressTimer = setInterval(() => {
          if (currentPct < 90) {
            currentPct += Math.max(1, Math.round((90 - currentPct) / 6));
            const loaded = Math.round(totalBytes * (currentPct / 100));
            onProgress({ loaded, total: totalBytes, percent: currentPct });
          }
        }, 300);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 65000);

      try {
        const bodyStr = JSON.stringify(payload);
        const res = await fetch(CONFIG.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: bodyStr,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (progressTimer) clearInterval(progressTimer);
        if (onProgress) {
          onProgress({ loaded: totalBytes, total: totalBytes, percent: 100 });
        }
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        if (progressTimer) clearInterval(progressTimer);
        if (err.name === 'AbortError') {
          throw new Error('Upload timed out. Google Apps Script cannot handle large base64 files. Please deploy Code.gs in script.google.com to enable direct Google Drive streaming.');
        }
        throw err;
      }
    }

    // Video Thumbnail Generation Engine (Optimized Zero-Leak Lightweight Frame Extraction)
    function generateVideoThumbnail(file, targetSec = 1.0) {
      return new Promise((resolve, reject) => {
        if (!file || (!(file.type && file.type.startsWith('video/')) && !file.name.match(/\.(mp4|mov|webm|m4v)$/i))) {
          return reject(new Error('Selected file is not a supported video format'));
        }
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        const blobUrl = URL.createObjectURL(file);
        video.src = blobUrl;

        let resolved = false;
        const cleanup = () => {
          try {
            video.pause();
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(blobUrl);
            video.remove();
          } catch(e) {}
        };

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(new Error('Thumbnail extraction timed out'));
          }
        }, 12000);

        video.onloadedmetadata = () => {
          const duration = video.duration || 30;
          const seekTo = Math.min(Math.max(0.2, targetSec), Math.max(0.2, duration - 0.2));
          video.currentTime = seekTo;
        };

        video.onseeked = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          try {
            // Downscale to lightweight thumbnail dimensions (max 480w, max 854h) to avoid canvas OOM crashes
            const rawW = video.videoWidth || 720;
            const rawH = video.videoHeight || 1280;
            const maxW = 480;
            const maxH = 854;
            let targetW = rawW;
            let targetH = rawH;

            if (targetW > maxW) {
              targetH = Math.round((targetH * maxW) / targetW);
              targetW = maxW;
            }
            if (targetH > maxH) {
              targetW = Math.round((targetW * maxH) / targetH);
              targetH = maxH;
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, targetW, targetH);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.76);
            canvas.width = 0;
            canvas.height = 0;

            const durationSec = Math.floor(video.duration) || 0;
            const m = Math.floor(durationSec / 60);
            const s = durationSec % 60;
            const durStr = `${m}:${s < 10 ? '0' : ''}${s}`;

            cleanup();

            resolve({
              dataUrl,
              durationStr: durStr,
              durationSec,
              width: targetW,
              height: targetH,
              sizeBytes: file.size
            });
          } catch (err) {
            cleanup();
            reject(err);
          }
        };

        video.onerror = err => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          reject(new Error('Video decoding failed in browser'));
        };
      });
    }

    // (Removed unused _legacyThumb stub)

    // Real-Time Cross-Tab Event Listeners
    if (syncHub) {
      syncHub.onmessage = async e => {
        if (e.data && e.data.type === 'REEL_DELETED' && e.data.id) {
          try {
            let delIds = await window.DNM_STORAGE?.cache?.get('deleted_reel_ids') || [];
            if (!delIds.includes(e.data.id)) {
              delIds.push(e.data.id);
              await window.DNM_STORAGE?.cache?.set('deleted_reel_ids', delIds);
            }
          } catch (_) {
            const delIds = JSON.parse(localStorage.getItem('dn_deleted_reel_ids') || '[]');
            if (!delIds.includes(e.data.id)) {
              delIds.push(e.data.id);
              localStorage.setItem('dn_deleted_reel_ids', JSON.stringify(delIds));
            }
          }
          DATA.reels = (DATA.reels || []).filter(x => x.id !== e.data.id);
          render();
          return;
        }
        if (e.data && e.data.type === 'DATA_MUTATED' && e.data.data) {
          try {
            const delIds = await window.DNM_STORAGE?.cache?.get('deleted_reel_ids') || [];
            DATA = e.data.data;
            DATA.deletedReelIds = delIds;
            DATA.reels = (DATA.reels || []).filter(r => !delIds.includes(r.id));
            await window.DNM_STORAGE?.cache?.set('cloud_cache', DATA);
          } catch (_) {
            const delIds = JSON.parse(localStorage.getItem('dn_deleted_reel_ids') || '[]');
            DATA = e.data.data;
            DATA.deletedReelIds = delIds;
            DATA.reels = (DATA.reels || []).filter(r => !delIds.includes(r.id));
            localStorage.setItem('dn_cloud_cache', JSON.stringify(DATA));
          }
          render();
        }
      };
    }

    window.addEventListener('storage', async e => {
      if (e.key === 'dn_deleted_reel_ids') {
        try {
          const delIds = await window.DNM_STORAGE?.cache?.get('deleted_reel_ids') || [];
          DATA.reels = (DATA.reels || []).filter(r => !delIds.includes(r.id));
        } catch (_) {
          const delIds = JSON.parse(localStorage.getItem('dn_deleted_reel_ids') || '[]');
          DATA.reels = (DATA.reels || []).filter(r => !delIds.includes(r.id));
        }
        render();
      } else if (e.key === 'dn_cloud_cache' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed === 'object') {
            try {
              const delIds = await window.DNM_STORAGE?.cache?.get('deleted_reel_ids') || [];
              parsed.reels = (parsed.reels || []).filter(r => !delIds.includes(r.id));
            } catch (_) {
              const delIds = JSON.parse(localStorage.getItem('dn_deleted_reel_ids') || '[]');
              parsed.reels = (parsed.reels || []).filter(r => !delIds.includes(r.id));
            }
            if (!DATA._updatedAt || !parsed._updatedAt || parsed._updatedAt >= DATA._updatedAt) {
              DATA = parsed;
              render();
            }
          }
        } catch(err) {}
      }
    });

    let liveDataPromise = null;
    let isFetchingLiveData = false;

    async function fetchLiveData(force = false) {
      if (liveDataPromise && !force) return liveDataPromise;
      if (!CONFIG.gasUrl || CONFIG.gasUrl === OLD_GAS_URL || CONFIG.gasUrl.includes('AKfycbxo')) {
        CONFIG.gasUrl = DEFAULT_GAS_URL;
        try {
          await window.DNM_STORAGE?.config?.set('gas_url', DEFAULT_GAS_URL);
        } catch (_) {
          localStorage.setItem('dn_gas_url', DEFAULT_GAS_URL);
        }
      }
      isFetchingLiveData = true;
      liveDataPromise = (async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);
          const cb = '&_cb=' + Date.now();
          const res = await fetch(CONFIG.gasUrl + '?action=getData' + cb, { signal: controller.signal });
          clearTimeout(timeoutId);
          const json = await res.json();
          if (json.success && json.data) {
            connectionState = { status: 'online', message: 'Google Drive connected' };

            let deletedReelIds = Array.isArray(json.data.deletedReelIds) ? json.data.deletedReelIds : [];
            let deletedClientIds = Array.isArray(json.data.deletedClientIds) ? json.data.deletedClientIds : [];

            try {
              const locReels = await window.DNM_STORAGE?.cache?.get('deleted_reel_ids') || [];
              if (Array.isArray(locReels)) locReels.forEach(id => { if (!deletedReelIds.includes(id)) deletedReelIds.push(id); });
              const locClients = await window.DNM_STORAGE?.cache?.get('deleted_client_ids') || [];
              if (Array.isArray(locClients)) locClients.forEach(id => { if (!deletedClientIds.includes(id)) deletedClientIds.push(id); });
            } catch(e) {
              try {
                const locReels = JSON.parse(localStorage.getItem('dn_deleted_reel_ids') || '[]');
                if (Array.isArray(locReels)) locReels.forEach(id => { if (!deletedReelIds.includes(id)) deletedReelIds.push(id); });
                const locClients = JSON.parse(localStorage.getItem('dn_deleted_client_ids') || '[]');
                if (Array.isArray(locClients)) locClients.forEach(id => { if (!deletedClientIds.includes(id)) deletedClientIds.push(id); });
              } catch(e) {}
            }

            DATA.deletedReelIds = deletedReelIds;
            DATA.deletedClientIds = deletedClientIds;

            DATA.clients = (json.data.clients || []).filter(c => !deletedClientIds.includes(c.id));
            DATA.reels = (json.data.reels || []).filter(r => !deletedReelIds.includes(r.id));
            if (json.data.settings) {
              DATA.settings = Object.assign({}, DATA.settings, json.data.settings);
            }

            DATA._updatedAt = Date.now();
            try {
              await window.DNM_STORAGE?.cache?.set('cloud_cache', {
                clients: DATA.clients,
                reels: DATA.reels,
                settings: DATA.settings,
                deletedReelIds: DATA.deletedReelIds,
                deletedClientIds: DATA.deletedClientIds
              });
            } catch(e) {
              try {
                localStorage.setItem('dn_cloud_cache', JSON.stringify({
                  clients: DATA.clients,
                  reels: DATA.reels,
                  settings: DATA.settings,
                  deletedReelIds: DATA.deletedReelIds,
                  deletedClientIds: DATA.deletedClientIds
                }));
              } catch(e) {}
            }

            try {
              if (syncHub) syncHub.postMessage({ type: 'DATA_MUTATED', data: DATA, time: DATA._updatedAt });
            } catch(e) {}

            const urlParams = new URLSearchParams(window.location.search);
            const targetSlug = urlParams.get('client') || urlParams.get('c') || window.location.hash.replace(/^#[/]?/, '').toLowerCase();
            if (targetSlug) {
              const matchedClient = (DATA.clients || []).find(c => c.slug === targetSlug || c.id === targetSlug);
              if (matchedClient) {
                view.client = matchedClient.id;
                const logo = (matchedClient.id === 'tcs' ? '/Logo/tcs-logo.png' : (matchedClient.logo || '/Logo/logo.png'));
                setFavicon(logo);
                document.title = matchedClient.name + ' | DAY NIGHT';
                if (isClientAuthenticated(matchedClient.id)) {
                  view.screen = 'landing';
                }
              }
            }

            if (view.screen !== 'splash' && view.screen !== 'dn-intro') {
              render();
            } else {
              const startBtn = document.getElementById('dn-start-btn');
              if (startBtn) {
                const c = client();
                startBtn.innerHTML = c ? 'Access ' + esc(c.name) + ' ' + ic.arrow : 'Start ' + ic.arrow;
              }
            }
          }
        } catch (e) {
          console.warn('Live fetch notice:', e);
        } finally {
          isFetchingLiveData = false;
        }
      })();
      return liveDataPromise;
    }

    async function checkConnection() {
      // Immediately run fast background fetch without waiting for ping
      fetchLiveData(true);
    }

    async function persist(msg) {
      document.querySelector('.scrim')?.remove();
      DATA._updatedAt = Date.now();
      try {
        await window.DNM_STORAGE?.cache?.set('cloud_cache', DATA);
      } catch (_) {
        localStorage.setItem('dn_cloud_cache', JSON.stringify(DATA));
      }
      try {
        if (syncHub) syncHub.postMessage({ type: 'DATA_MUTATED', data: DATA, time: DATA._updatedAt });
      } catch(e) {}
      render();
      toast('Saving changes...', 'info');
      try {
        if (CONFIG.gasUrl) {
          await gasApi('syncData', { data: DATA });
          toast(msg || 'Saved to Google Drive', 'success');
        } else {
          toast(msg || 'Saved locally', 'amber');
        }
      } catch (e) {
        toast('Saved locally (Sync: ' + (e.message || 'offline') + ')', 'amber');
      }
    }

    // --------------------------------------------------------------------------
    // DYNAMIC FAVICON & TITLE SYSTEM
    // --------------------------------------------------------------------------
    function setFavicon(iconUrl) {
      const href = iconUrl || '/Logo/logo.png';
      let link = document.getElementById('dynamic-favicon');
      if (!link) {
        link = document.createElement('link');
        link.id = 'dynamic-favicon';
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.type = href.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png';
      link.href = href;

      let apple = document.getElementById('dynamic-apple-icon') || document.querySelector('link[rel="apple-touch-icon"]');
      if (apple) {
        apple.href = href.startsWith('data:image/svg') ? (href.includes('tcs') ? '/Logo/tcs-logo.png' : '/Logo/logo.png') : href;
      }
    }

    // Favorites persistence helpers (using StorageAdapter)
    function getFavorites(cid) {
      const clientKey = cid || (view.client || 'tcs');
      try {
        const favs = window.DNM_STORAGE?.cache?.get('favs_' + clientKey);
        if (Array.isArray(favs)) return favs;
        return JSON.parse(localStorage.getItem('dn_favs_' + clientKey) || '[]');
      } catch(e) {
        return [];
      }
    }

    function isFavorited(id) {
      if (!view.client || !id) return false;
      try {
        const favs = getFavorites(view.client);
        return favs.includes(id);
      } catch(e) { return false; }
    }

    function toggleFavorite(id) {
      if (!view.client || !id) return;
      const key = 'favs_' + view.client;
      let favs = getFavorites(view.client);
      const pos = favs.indexOf(id);
      if (pos > -1) {
        favs.splice(pos, 1);
        toast('Removed from Favorites', 'info');
      } else {
        favs.push(id);
        toast('Saved to Favorites', 'success');
      }
      try { window.DNM_STORAGE?.cache?.set(key, favs); } catch(e) {}
      render();
    }

    // --------------------------------------------------------------------------
    // ANIMATED FLOATING SOCIAL MEDIA & EMAIL DOCK (Intro Screen Only)
    // --------------------------------------------------------------------------
    function renderSocialDock() {
      const existing = document.getElementById('dn-social-dock');
      const s = DATA.settings || {};

      // Strictly only display social dock on the Intro / Splash screen
      const sp = app.querySelector('.splash') || app.querySelector('.dn-intro');
      const isIntro = !!sp && (view.screen === 'splash' || view.screen === 'dn-intro');

      if (!isIntro || s.showSocialLinks === false || s.sitePaused) {
        if (existing) existing.remove();
        return;
      }

      const soc = s.social || {};
      const links = [
        { key: 'instagram', label: 'Instagram', url: soc.instagram || 'https://instagram.com', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>' },
        { key: 'youtube', label: 'YouTube', url: soc.youtube || 'https://youtube.com', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>' },
        { key: 'facebook', label: 'Facebook', url: soc.facebook || 'https://facebook.com', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>' },
        { key: 'whatsapp', label: 'WhatsApp', url: soc.whatsapp || 'https://wa.me', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' },
        { key: 'x', label: 'X (Twitter)', url: soc.x || 'https://twitter.com', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' },
        { key: 'linkedin', label: 'LinkedIn', url: soc.linkedin || 'https://linkedin.com', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>' },
        { key: 'email', label: 'Email', url: soc.email ? (soc.email.startsWith('mailto:') ? soc.email : `mailto:${soc.email}`) : 'mailto:hello@daynightmedia.com', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' }
      ];

      let dock = existing;
      if (!dock) {
        dock = document.createElement('div');
        dock.id = 'dn-social-dock';
        dock.className = 'dn-social-dock dock-waiting';
        sp.appendChild(dock);
      } else if (dock.parentElement !== sp) {
        sp.appendChild(dock);
      }

      if (sp.classList.contains('ready')) {
        dock.classList.remove('dock-waiting');
        dock.classList.add('cinematic-in');
      } else {
        dock.classList.add('dock-waiting');
        dock.classList.remove('cinematic-in');
      }

      dock.innerHTML = links.map(l => `
        <a href="${esc(l.url)}" class="dn-social-btn ${l.key}" target="_blank" rel="noopener noreferrer" aria-label="${l.label}">
          ${l.icon}
          <span class="soc-tooltip">${l.label}</span>
        </a>
      `).join('');
    }

    // Luxury Milk-White Bottom Navigation Bar (Navbar - Synchronized Across Portal)
    
    // Video Playback Color & Visual Calibration (Brightness, Contrast, Saturation)
    let videoFilters = {
      brightness: 100,
      contrast: 100,
      saturation: 100
    };
    try {
      const savedFilters = window.DNM_STORAGE?.cache?.get('video_filters') || {};
      if (savedFilters && typeof savedFilters.brightness === 'number') {
        videoFilters = Object.assign(videoFilters, savedFilters);
      }
    } catch(_) {
      try {
        const savedFilters = JSON.parse(localStorage.getItem('dn_video_filters') || '{}');
        if (savedFilters && typeof savedFilters.brightness === 'number') {
          videoFilters = Object.assign(videoFilters, savedFilters);
        }
      } catch(_) {}
    }

    function applyVideoFilters(videoEl) {
      if (!videoEl) return;
      const b = videoFilters.brightness || 100;
      const c = videoFilters.contrast || 100;
      const s = videoFilters.saturation || 100;
      if (b === 100 && c === 100 && s === 100) {
        videoEl.style.filter = '';
      } else {
        videoEl.style.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
      }
    }

    // --------------------------------------------------------------------------
    // PRE-APPROVAL & INSTAGRAM PLAYER ENHANCEMENTS
    // --------------------------------------------------------------------------
    function formatViews(n) {
      if (n == null || isNaN(n)) return '0';
      const num = Number(n);
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return String(num);
    }

    function isLiked(id) {
      const c = client();
      try {
        const liked = window.DNM_STORAGE?.cache?.get('likes_' + (c ? c.id : 'tcs'));
        if (Array.isArray(liked)) return liked.includes(id);
        return (JSON.parse(localStorage.getItem('dn_likes_' + (c ? c.id : 'tcs')) || '[]')).includes(id);
      } catch(e) { return false; }
    }

    function toggleLike(id) {
      const c = client();
      const key = 'likes_' + (c ? c.id : 'tcs');
      try {
        let liked = window.DNM_STORAGE?.cache?.get(key);
        if (!Array.isArray(liked)) liked = JSON.parse(localStorage.getItem('dn_likes_' + (c ? c.id : 'tcs')) || '[]');
        const idx = liked.indexOf(id);
        if (idx === -1) liked.push(id);
        else liked.splice(idx, 1);
        try { window.DNM_STORAGE?.cache?.set(key, liked); } catch(_) {}
        try { localStorage.setItem('dn_likes_' + (c ? c.id : 'tcs'), JSON.stringify(liked)); } catch(_) {}
        return idx === -1;
      } catch(e) { return false; }
    }

    function getLikesCount(r) {
      const base = Number(r.likes || 0);
      const liked = isLiked(r.id);
      return formatViews(liked ? base + 1 : base);
    }

    async function recordWatchHistory(r) {
      const c = client();
      if (!r || !c) return;
      try {
        const key = 'history_' + c.id;
        let list = await window.DNM_STORAGE?.cache?.get(key) || [];
        list = list.filter(x => x.id !== r.id);
        list.unshift({
          id: r.id,
          title: r.title,
          b: r.b || r.album || '',
          date: r.date,
          coverUrl: r.coverUrl || '',
          dur: r.dur || '',
          time: Date.now()
        });
        await window.DNM_STORAGE?.cache?.set(key, list.slice(0, 30));
      } catch(e) {
        try {
          const key = 'dn_history_' + c.id;
          let list = JSON.parse(localStorage.getItem(key) || '[]');
          list = list.filter(x => x.id !== r.id);
          list.unshift({
            id: r.id,
            title: r.title,
            b: r.b || r.album || '',
            date: r.date,
            coverUrl: r.coverUrl || '',
            dur: r.dur || '',
            time: Date.now()
          });
          localStorage.setItem(key, JSON.stringify(list.slice(0, 30)));
        } catch(e) {}
      }
    }

    async function setReelApprovalStatus(reelId, newStatus) {
      const savedScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const r = (DATA.reels || []).find(x => String(x.id).trim() === String(reelId).trim());
      if (!r) return;
      r.status = newStatus;
      DATA._updatedAt = Date.now();
      try { window.DNM_STORAGE?.cache?.set('cloud_cache', DATA); } catch(e) { try { localStorage.setItem('dn_cloud_cache', JSON.stringify(DATA)); } catch(e) {} }
      try { if (syncHub) syncHub.postMessage({ type: 'DATA_MUTATED', data: DATA, time: DATA._updatedAt }); } catch(e) {}
      if (newStatus === 'review') {
        toast('Content status set to Under Review', 'info');
      } else {
        toast(newStatus === 'approved' ? 'Content marked as Approved' : 'Content marked as Denied / Edits Requested', newStatus === 'approved' ? 'success' : 'amber');
      }
      if (CONFIG.gasUrl) {
        gasApi('updateReelStatus', { id: r.id, reelId: r.id, status: newStatus })
          .catch(() => gasApi('syncData', { data: DATA }).catch(() => {}));
      }
      render();
      window.scrollTo({ top: savedScrollY, behavior: 'instant' });
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedScrollY, behavior: 'instant' });
      });
    }

    function submitReelComment(reelId, text, type = 'suggestion', parentId = null) {
      if (!text || !text.trim()) return;
      const r = (DATA.reels || []).find(x => String(x.id).trim() === String(reelId).trim());
      if (!r) return;
      const c = client();
      r.comments = r.comments || [];
      const newComment = {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        parentId: parentId || null,
        text: text.trim(),
        author: c ? (c.name + ' (Client)') : 'Client',
        authorRole: 'client',
        type: type,
        time: Date.now(),
        dateStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      r.comments.push(newComment);
      DATA._updatedAt = Date.now();
      try { window.DNM_STORAGE?.cache?.set('cloud_cache', DATA); } catch(e) { try { localStorage.setItem('dn_cloud_cache', JSON.stringify(DATA)); } catch(e) {} }
      try { if (syncHub) syncHub.postMessage({ type: 'DATA_MUTATED', data: DATA, time: DATA._updatedAt }); } catch(e) {}
      toast(parentId ? 'Reply posted in real time' : 'Suggestion sent to Day Night Media admin in real time', 'success');
      if (CONFIG.gasUrl) {
        gasApi('modifyReel', { reel: r })
          .catch(() => gasApi('syncData', { data: DATA }).catch(() => {}));
      }
      render();
    }

    // --------------------------------------------------------------------------
    // FEEDS TAB AUTOPLAY OBSERVER & CONTROLLER
    // --------------------------------------------------------------------------
    let feedAutoplayObserver = null;
    let isFeedAudioMuted = true;
    (async () => {
      try { isFeedAudioMuted = await window.DNM_STORAGE?.cache?.get('feed_muted') !== false; } catch (_) { try { isFeedAudioMuted = localStorage.getItem('dn_feed_muted') !== 'false'; } catch(_) { isFeedAudioMuted = true; } }
      window.isFeedAudioMuted = isFeedAudioMuted;
    })();

    function initFeedAutoplay() {
      if (feedAutoplayObserver) {
        feedAutoplayObserver.disconnect();
        feedAutoplayObserver = null;
      }

      let isEnabled = true;
      try { isEnabled = window.DNM_STORAGE?.cache?.get('feed_autoplay') !== false; } catch (_) { isEnabled = true; }

      const btn = document.getElementById('feed-autoplay-toggle');
      if (btn) btn.classList.toggle('active', isEnabled);

      const wraps = document.querySelectorAll('.dn-feed-media-wrap');
      if (!wraps.length) return;

      // Ensure media wrap matches natural video aspect ratio with zero black pillarbox bars
      wraps.forEach(wrap => {
        const vid = wrap.querySelector('.dn-feed-video');
        if (vid) {
          const syncRatio = () => {
            if (vid.videoWidth && vid.videoHeight) {
              wrap.style.aspectRatio = `${vid.videoWidth} / ${vid.videoHeight}`;
            }
          };
          if (vid.videoWidth && vid.videoHeight) {
            syncRatio();
          } else {
            vid.addEventListener('loadedmetadata', syncRatio, { once: true });
          }
        }
      });

      if (!isEnabled) {
        wraps.forEach(wrap => {
          const vid = wrap.querySelector('.dn-feed-video');
          if (vid) { try { vid.pause(); } catch(_) {} }
          wrap.classList.remove('is-playing');
        });
        return;
      }

      feedAutoplayObserver = new IntersectionObserver((entries) => {
        // If any modal, scrim, or reel player overlay is open, immediately halt and silence all feed videos
        if (document.body.classList.contains('has-modal') || document.querySelector('.scrim') || document.querySelector('.video-modal-scrim') || document.querySelector('.ig-player-wrapper')) {
          document.querySelectorAll('.dn-feed-video').forEach(v => {
            try {
              v.pause();
              v.muted = true;
            } catch(_) {}
            const w = v.closest('.dn-feed-media-wrap');
            if (w) w.classList.remove('is-playing');
          });
          return;
        }

        entries.forEach(entry => {
          const wrap = entry.target;
          const vid = wrap.querySelector('.dn-feed-video');
          if (!vid) return;

          let isStillEnabled = true;
          try { isStillEnabled = window.DNM_STORAGE?.cache?.get('feed_autoplay') !== false; } catch (_) { isStillEnabled = true; }

          if (entry.isIntersecting && entry.intersectionRatio >= 0.45 && isStillEnabled) {
            // Pause and mute any other playing feed video so only ONE audio track plays
            document.querySelectorAll('.dn-feed-video').forEach(otherVid => {
              if (otherVid !== vid) {
                try {
                  otherVid.pause();
                  otherVid.muted = true;
                } catch(_) {}
                const otherWrap = otherVid.closest('.dn-feed-media-wrap');
                if (otherWrap) otherWrap.classList.remove('is-playing');
              }
            });

            // Synchronize sound across scrolling videos (respects unmuted state)
            vid.muted = isFeedAudioMuted;
            const playPromise = vid.play();
            if (playPromise !== undefined) {
              playPromise.then(() => {
                wrap.classList.add('is-playing');
              }).catch(() => {
                // If browser restricted unmuted autoplay, mute and retry seamlessly
                if (!vid.muted) {
                  vid.muted = true;
                  vid.play().then(() => {
                    wrap.classList.add('is-playing');
                  }).catch(() => {});
                }
              });
            }
          } else {
            try {
              vid.pause();
              vid.muted = true;
            } catch(_) {}
            wrap.classList.remove('is-playing');
          }
        });
      }, {
        root: null,
        rootMargin: '0px',
        threshold: [0, 0.45, 0.8]
      });

      wraps.forEach(wrap => feedAutoplayObserver.observe(wrap));
    }

    // --------------------------------------------------------------------------
    // INTELLIGENT SMART-HIDE HEADER ON SCROLL
    // --------------------------------------------------------------------------
    (function initSmartHeaderScroll() {
      let lastScrollY = window.scrollY || 0;
      let ticking = false;
      let downAccum = 0;

      window.addEventListener('scroll', () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const currentY = window.scrollY || document.documentElement.scrollTop || 0;
            const topHeader = document.querySelector('.top') || document.querySelector('.client-feeds-top');
            if (!topHeader) {
              lastScrollY = currentY;
              ticking = false;
              return;
            }

            // Always show header at top of the page or inside active modals
            if (currentY <= 25 || document.body.classList.contains('has-modal')) {
              topHeader.classList.remove('top-hidden');
              downAccum = 0;
              lastScrollY = currentY;
              ticking = false;
              return;
            }

            const diff = currentY - lastScrollY;

            if (diff > 0) {
              // Scrolling DOWN: accumulate downward scroll
              downAccum += diff;
              if (downAccum > 20 && currentY > 50) {
                topHeader.classList.add('top-hidden');
              }
            } else if (diff < -2) {
              // Scrolling UP: instantly bring header back!
              downAccum = 0;
              topHeader.classList.remove('top-hidden');
            }

            lastScrollY = currentY;
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
    })();

    // --------------------------------------------------------------------------
    // FEEDS TAB RENDERER (Instagram & YouTube Style Social Feed with Floating Approval Card)
    // --------------------------------------------------------------------------
    function renderFeedsPage(c) {
      if (!c) return '';
      function isClientMatch(rCid, targetCid) {
        if (!rCid || !targetCid) return false;
        if (rCid === targetCid) return true;
        if ((rCid === 'tcs' || rCid === 'cmvje2zfy') && (targetCid === 'tcs' || targetCid === 'cmvje2zfy')) return true;
        return false;
      }
      // Strictly show ONLY approved content in the feeds tab
      let clientReels = (DATA.reels || []).filter(r => isClientMatch(r.c, c.id) && (!r.hidden || CONFIG.isAdmin) && r.status === 'approved');

      // Calculate last updated relative string
      let lastUpdatedStr = 'Just now';
      if (DATA._updatedAt) {
        const diffMs = Date.now() - DATA._updatedAt;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) lastUpdatedStr = 'Just now';
        else if (diffMins < 60) lastUpdatedStr = `${diffMins}m ago`;
        else if (diffMins < 1440) lastUpdatedStr = `${Math.floor(diffMins / 60)}h ago`;
        else lastUpdatedStr = new Date(DATA._updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else if (clientReels.length && clientReels[0].date) {
        lastUpdatedStr = new Date(clientReels[0].date).toLocaleDateString([], { month: 'short', day: 'numeric' });
      }

      // Sort newest reels first
      clientReels.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });

      const favs = getFavorites();
      let isFeedAutoplayOn = true;
      let isFeedMuted = true;
      try { isFeedAutoplayOn = window.DNM_STORAGE?.cache?.get('feed_autoplay') !== false; } catch (_) { isFeedAutoplayOn = true; }
      try { isFeedMuted = window.DNM_STORAGE?.cache?.get('feed_muted') !== false; } catch (_) { isFeedMuted = true; }

      return `
        <!-- Top Header: Client Logo on Left, Title, Day Night Logo on Right -->
        <div class="top client-feeds-top">
          <div class="top-brand-left">
            <div class="top-client-avatar">
              ${clientLogo(c, 'top-avatar-img')}
            </div>
            <div class="crumb">
              <small>${esc(c.name)}</small>
              <span>Home</span>
            </div>
          </div>
          <div class="top-brand-right">
            <button type="button" class="dn-ap-toggle-btn ${isFeedAutoplayOn ? 'active' : ''}" data-act="toggle-feed-autoplay" id="feed-autoplay-toggle" title="Autoplay videos on scroll (Default: ON)" aria-label="Toggle Autoplay">
              <span class="dn-ap-label">Autoplay</span>
              <span class="dn-ap-track"><span class="dn-ap-thumb"></span></span>
            </button>
            ${dnLogo('mini')}
          </div>
        </div>

        <!-- INSTAGRAM / YOUTUBE SOCIAL FEED -->
        <div class="dn-feeds-container">
          ${clientReels.length ? clientReels.map(r => {
            const isFav = favs.includes(r.id);
            const cover = r.coverUrl || (r.fileId ? `https://drive.google.com/thumbnail?id=${r.fileId}&sz=w1000` : '');
            const commentsCount = (r.comments || []).length;
            const dateStr = r.date ? new Date(r.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Delivered';
            return `
              <article class="dn-feed-card" data-reel-id="${r.id}">
                <!-- Feed Post Header -->
                <header class="dn-feed-header">
                  <div class="dn-feed-author-wrap">
                    <div class="dn-feed-avatar-ring">
                      <div class="dn-feed-avatar-inner">
                        ${clientLogo(c, 'dn-feed-avatar')}
                      </div>
                    </div>
                    <div class="dn-feed-author-meta">
                      <div class="dn-feed-author-name-row">
                        <span class="dn-feed-author-name">${esc(c.name)}</span>
                        <span class="dn-verified-badge" title="Verified Brand"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></span>
                      </div>
                      <div class="dn-feed-subtitle-row">
                        ${r.b ? `<span class="dn-feed-branch-pill">${esc(r.b)}</span>` : ''}
                        <span>${dateStr}</span>
                      </div>
                    </div>
                  </div>
                  <button type="button" class="dn-feed-btn" data-act="open-reel-modal" data-id="${r.id}" aria-label="Open Reel View">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                  </button>
                </header>

                <!-- Media Area (Vertical Video Container with Auto-Play on Scroll) -->
                <div class="dn-feed-media-wrap" data-act="feed-media-click" data-id="${r.id}">
                  <video class="dn-feed-video"
                         src="${getStreamUrl(r)}"
                         poster="${esc(cover)}"
                         playsinline
                         webkit-playsinline
                         ${isFeedMuted ? 'muted' : ''}
                         loop
                         preload="metadata"
                         data-id="${r.id}"></video>
                  ${cover ? `<img src="${esc(cover)}" class="dn-feed-poster" alt="${esc(r.title)}" loading="lazy">` : ''}
                  <div class="dn-feed-play-overlay">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                  <button type="button" class="dn-feed-sound-btn" data-act="toggle-feed-sound" data-id="${r.id}" title="Toggle Sound" aria-label="Toggle Sound">
                    <svg class="sound-icon-muted" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:${isFeedMuted ? 'inline-block' : 'none'};"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    <svg class="sound-icon-audio" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:${isFeedMuted ? 'none' : 'inline-block'};"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  </button>
                  <div class="dn-feed-dur-badge">${esc(r.dur || '0:30')}</div>
                </div>

                <!-- Interactive Action Row -->
                <div class="dn-feed-actions">
                  <div class="dn-feed-actions-left">
                    <button type="button" class="dn-feed-btn heart ${isFav ? 'active' : ''}" data-act="toggle-fav" data-id="${r.id}" aria-label="Favorite">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <button type="button" class="dn-feed-btn comment" data-act="feed-comment" data-id="${r.id}" aria-label="Comments">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                      ${commentsCount ? `<span>${commentsCount}</span>` : ''}
                    </button>
                    <button type="button" class="dn-feed-btn share" data-act="feed-share" data-id="${r.id}" aria-label="Share">
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                  </div>
                  <button type="button" class="dn-feed-btn download" data-act="direct-dl" data-id="${r.id}" aria-label="Download">
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                </div>

                <!-- Feed Content Details -->
                <div class="dn-feed-content-body">
                  <div class="dn-feed-views-count">${(r.views || 0).toLocaleString()} views</div>
                  <div class="dn-feed-caption">
                    <strong>${esc(c.name)}</strong>${esc(r.title)}
                  </div>
                  <div class="dn-feed-audio-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    <span>Day Night Media • Original Audio</span>
                  </div>
                  <div class="dn-feed-tags-row">
                    ${r.b ? `<span class="dn-feed-tag">#${esc(r.b.replace(/\s+/g, ''))}</span>` : ''}
                    ${r.album ? `<span class="dn-feed-tag">#${esc(r.album.replace(/\s+/g, ''))}</span>` : ''}
                    <span class="dn-feed-tag">#DayNightReels</span>
                  </div>
                </div>
              </article>
            `;
          }).join('') : `
            <div style="text-align:center;padding:40px 20px;color:var(--mute);">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:0.6;"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/></svg>
              <h3 style="margin:0 0 6px;color:var(--navy);">No Feed Videos Yet</h3>
              <p style="margin:0;font-size:13px;">Delivered reels will appear here in your social feed.</p>
            </div>
          `}
        </div>

        ${renderBottomNav()}
      `;
    }

    // Pre-Approval Screen Renderer (Replaces Home Page Buttons & Provides Pre-Approval Screen)
    function renderPreApprovalPage(c, isHome = false) {
      const currentMonth = view.month != null ? view.month : 9; // October default (0-indexed 9)
      const currentPhase = view.preappPhase || view.phase || 'all';
      view.phase = currentPhase;
      view.preappPhase = currentPhase;
      const currentStatus = view.statusFilter || 'all';
      const currentViewMode = view.preappViewMode || (function() {
        try { return localStorage.getItem('dn_preapp_view_mode') || 'grid'; } catch(_) { return 'grid'; }
      })();

      // Get real reels for this client (Strictly real data only, zero fakes)
      function isClientMatch(rCid, targetCid) {
        if (!rCid || !targetCid) return false;
        if (rCid === targetCid) return true;
        if ((rCid === 'tcs' || rCid === 'cmvje2zfy') && (targetCid === 'tcs' || targetCid === 'cmvje2zfy')) return true;
        return false;
      }
      let clientReels = (DATA.reels || []).filter(r => isClientMatch(r.c, c.id) );

      // Determine Active Wave Label
      const clientWaves = (c.waves && Array.isArray(c.waves) && c.waves.length) ? c.waves : ['Phase 1', 'Phase 2', 'Phase 3'];
      let currentWaveLabel = 'All Waves';
      if (currentPhase && currentPhase !== 'all') {
        if (currentPhase.startsWith('wave_')) {
          const idx = parseInt(currentPhase.replace('wave_', ''), 10);
          currentWaveLabel = clientWaves[idx] || currentPhase;
        } else if (currentPhase.startsWith('phase')) {
          const idx = (parseInt(currentPhase.replace('phase', ''), 10) || 1) - 1;
          currentWaveLabel = clientWaves[idx] || currentPhase;
        } else {
          currentWaveLabel = currentPhase;
        }
      }

      // Filter by Month
      if (currentMonth != null) {
        clientReels = clientReels.filter(r => {
          if (r.m != null) return r.m === currentMonth;
          if (r.date) {
            const d = new Date(r.date);
            return !isNaN(d) && d.getMonth() === currentMonth;
          }
          return true;
        });
      }

      // Filter by Status
      if (currentStatus === 'pending') {
        clientReels = clientReels.filter(r => r.status === 'review' || (!r.status || (r.status !== 'approved' && r.status !== 'denied')));
      } else if (currentStatus === 'approved') {
        clientReels = clientReels.filter(r => r.status === 'approved');
      } else if (currentStatus === 'denied') {
        clientReels = clientReels.filter(r => r.status === 'denied');
      }

      // Filter by Phase / Wave (Supports custom wave names like Week 1, Phase 1, etc.)
      const activeWaves = (c.waves && Array.isArray(c.waves) && c.waves.length) ? c.waves : ['Phase 1', 'Phase 2', 'Phase 3'];
      let selectedWaveIdx = 0;
      if (currentPhase && currentPhase.startsWith('wave_')) {
        selectedWaveIdx = parseInt(currentPhase.replace('wave_', ''), 10) || 0;
      } else if (currentPhase && currentPhase.startsWith('phase')) {
        selectedWaveIdx = (parseInt(currentPhase.replace('phase', ''), 10) || 1) - 1;
      } else if (currentPhase && activeWaves.includes(currentPhase)) {
        selectedWaveIdx = activeWaves.indexOf(currentPhase);
      }

      // Filter by custom Delivery Wave / Phase (Supports custom wave names, indices, and aliases)
      if (currentPhase && currentPhase !== 'all') {
        const waveName = (activeWaves[selectedWaveIdx] || '').toLowerCase();
        clientReels = clientReels.filter(r => {
          const rw = (r.wave || r.phase || '').toLowerCase();
          if (rw) {
            if (rw === currentPhase.toLowerCase() ||
                rw === ('wave_' + selectedWaveIdx) ||
                rw === waveName ||
                rw === ('phase' + (selectedWaveIdx + 1))) {
              return true;
            }
          }
          if (selectedWaveIdx === 0 && !rw) return true;
          const titleLower = (r.title || '').toLowerCase();
          return waveName && titleLower.includes(waveName);
        });
      }

      // Filter by Branch
      if (view.branch && view.branch !== 'all') {
        const targetB = view.branch.toLowerCase();
        clientReels = clientReels.filter(r => {
          const rb = (r.b || r.album || '').toLowerCase();
          return rb.includes(targetB) || targetB.includes(rb);
        });
      }

      // Preserve real-time custom video arrangement from admin
      clientReels.sort((a,b) => {
        if (a.order != null && b.order != null) return a.order - b.order;
        return 0;
      });

      const activeBranch = (view.branch && view.branch !== 'all') ? (view.branch.toUpperCase() + ' BRANCH') : 'ALL BRANCHES';
      const bannerSrc = c.banner || c.heroBanner || c.bannerUrl || '';
      const logoSrc = c.logo || (c.id === 'tcs' ? '/Logo/tcs-logo.png' : '/Logo/logo.png');

      return `
        <!-- Approval Portal Top Bar Header -->
        <div class="preapp-topbar">
          <button class="preapp-back-btn" data-act="back" aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div class="preapp-title-group">
            <span class="preapp-sub">${esc(c.name || 'Client Portal')}</span>
            <h1 class="preapp-heading">Pre-Approval</h1>
          </div>
          <div class="preapp-top-right">
            <div class="preapp-code-chip" data-act="lock-portal" title="Portal Protected by Access PIN (Click to Lock Portal)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>PIN Secured</span>
            </div>
            <div class="preapp-brand-mark" data-act="bnav-profile" title="Client Profile & Security">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          </div>
        </div>

        <!-- Approval Portal Hero Banner -->
        <div class="preapp-hero-banner ${bannerSrc ? 'has-custom-bg' : 'has-gradient-bg'}">
          ${bannerSrc ? `<img src="${esc(bannerSrc)}" class="preapp-banner-bg" alt="">` : ''}
          <div class="preapp-banner-overlay"></div>
          <div class="preapp-banner-content">
            <div class="preapp-banner-logo-wrap">
              <img src="${esc(logoSrc)}" alt="${esc(c.name)}">
            </div>
            <h2 class="preapp-banner-title">Content Pre-Approval</h2>
            <div class="preapp-banner-sub">Review &amp; Feedback for ${esc(c.name)}</div>
            <button type="button" class="preapp-branch-pill" data-act="open-branch-picker" title="Switch Branch Filter" aria-label="Switch Branch Filter" style="cursor:pointer;border:none;outline:none;">
              <span>${esc(activeBranch)}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:4px;"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="preapp-flourish">
              <svg width="34" height="8" viewBox="0 0 34 8" fill="currentColor"><path d="M0 4 Q 8.5 0, 17 4 T 34 4" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="17" cy="4" r="1.8"/></svg>
            </div>
          </div>
        </div>

        <!-- Filter Controls Row 1: Month & Wave Dropdowns (Left) + View Mode Switcher (Right) -->
        <div class="preapp-controls-row1">
          <div class="preapp-dropdowns-group">
            <button class="preapp-month-btn" data-act="open-month-dropdown" aria-label="Select Month">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>${MONTHS[currentMonth]}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>

            <button class="preapp-month-btn preapp-wave-btn" data-act="open-wave-dropdown" aria-label="Select Delivery Wave / Category">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c.6 0 1.2-.4 1.4-1 1.2-3 4-3 5.2 0 .4.9 1.4 1.5 2.4 1.5s2-.6 2.4-1.5c1.2-3 4-3 5.2 0 .2.6.8 1 1.4 1s1.2-.4 1.4-1c.6-1.5 1.8-2.5 3.2-2.5"/><path d="M2 18c.6 0 1.2-.4 1.4-1 1.2-3 4-3 5.2 0 .4.9 1.4 1.5 2.4 1.5s2-.6 2.4-1.5c1.2-3 4-3 5.2 0 .2.6.8 1 1.4 1s1.2-.4 1.4-1c.6-1.5 1.8-2.5 3.2-2.5"/></svg>
              <span>${esc(currentWaveLabel)}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>

          <!-- View Mode Switcher (Grid & List) - Permanently Visible on Right -->
          <div class="preapp-view-toggle">
            <button type="button" class="preapp-vbtn ${currentViewMode === 'grid' ? 'active' : ''}" data-act="set-view-mode" data-mode="grid" title="Grid View" aria-label="Grid View">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
            </button>
            <button type="button" class="preapp-vbtn ${currentViewMode === 'list' ? 'active' : ''}" data-act="set-view-mode" data-mode="list" title="List View" aria-label="List View">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Filter Controls Row 3: Status Pills -->
        <div class="preapp-controls-row2">
          <div class="preapp-status-group">
            <button class="preapp-status-btn ${currentStatus === 'all' ? 'active' : ''}" data-act="set-status-filter" data-status="all">
              All
            </button>
            <button class="preapp-status-btn ${currentStatus === 'pending' ? 'active' : ''}" data-act="set-status-filter" data-status="pending">
              <span class="status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
              Pending
            </button>
            <button class="preapp-status-btn ${currentStatus === 'approved' ? 'active' : ''}" data-act="set-status-filter" data-status="approved">
              <span class="status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1FAF64" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>
              Approved
            </button>
            <button class="preapp-status-btn ${currentStatus === 'denied' ? 'active' : ''}" data-act="set-status-filter" data-status="denied">
              <span class="status-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E53225" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span>
              Denied
            </button>
          </div>
        </div>

        <!-- Video Content: List or Grid View -->
        ${clientReels.length ? (
          currentViewMode === 'list' ? `
            <div class="preapp-list-container">
              ${clientReels.map((r, i) => {
                const commentsCount = (r.comments || []).length;
                return `
                  <div class="preapp-list-card" data-id="${r.id}">
                    <div class="preapp-list-top">
                      <!-- Thumbnail Left -->
                      <div class="preapp-list-thumb" data-act="play-video" data-id="${r.id}" aria-label="Play ${esc(r.title)}">
                        <img src="${esc(r.coverUrl || getFallbackThumbnailSvg(r.title, r.b || ''))}" alt="${esc(r.title)}" loading="lazy" onerror="this.onerror=null;this.src=getFallbackThumbnailSvg('${esc(r.title)}', '${esc(r.b || '')}');">
                        <div class="preapp-play-btn">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                        </div>
                        ${r.dur ? `<span class="preapp-dur-pill">${esc(r.dur)}</span>` : ''}
                      </div>

                      <!-- Content Right -->
                      <div class="preapp-list-content">
                        <!-- Title -->
                        <h3 class="preapp-list-title" data-act="play-video" data-id="${r.id}">${esc(r.title)}</h3>
                        
                        <!-- Meta: Branch, Date, Views -->
                        <div class="preapp-list-meta">
                          <span>${esc(r.b || r.album || 'General')}</span>
                          <span>·</span>
                          <span>${fmtDate(r.date)}</span>
                          <span>·</span>
                          <span style="display:inline-flex;align-items:center;gap:3px;">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            ${formatViews(r.views || 0)}
                          </span>
                        </div>

                        <!-- Action Buttons Row: Approve, Deny, Download, Share in Bottom-Right -->
                        <div class="preapp-list-actions">
                          <button type="button" class="preapp-act-btn approve ${r.status === 'approved' ? 'active' : ''}" data-act="preapp-approve" data-id="${r.id}" title="Approve Reel" aria-label="Approve Reel">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>
                          <button type="button" class="preapp-act-btn denied ${r.status === 'denied' ? 'active' : ''}" data-act="preapp-denied" data-id="${r.id}" title="Request Edits / Deny" aria-label="Request Edits / Deny">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                          <button type="button" class="preapp-act-btn dl" data-act="direct-dl" data-id="${r.id}" title="Download Master MP4" aria-label="Download Master MP4">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 20h16"/></svg>
                          </button>
                          <button type="button" class="preapp-act-btn share" data-act="share" data-id="${r.id}" title="Share Reel" aria-label="Share Reel">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    ${commentsCount > 0 ? `
                      <div class="preapp-list-comments-thread" data-act="open-comments" data-id="${r.id}">
                        ${r.comments.slice(-2).map(cItem => `
                          <div class="preapp-thread-row">
                            <span class="preapp-thread-tag ${cItem.authorRole || 'client'}">${cItem.authorRole === 'admin' ? 'Admin' : 'Client'}</span>
                            <span class="preapp-thread-text">${esc(cItem.text)}</span>
                            <span class="preapp-thread-time">${cItem.dateStr || ''}</span>
                          </div>
                        `).join('')}
                      </div>` : ''
                    }
                  </div>`;
              }).join('')}
            </div>
          ` : `
            <div class="preapp-grid">
              ${clientReels.map((r, i) => {
                const commentsCount = (r.comments || []).length;
                return `
                  <div class="preapp-card" data-id="${r.id}">
                    <!-- Thumbnail Area -->
                    <div class="preapp-thumb-wrap" data-act="play-video" data-id="${r.id}" aria-label="Play ${esc(r.title)}">
                      <img src="${esc(r.coverUrl || getFallbackThumbnailSvg(r.title, r.b || ''))}" class="preapp-thumb-img" alt="${esc(r.title)}" loading="lazy" onerror="this.onerror=null;this.src=getFallbackThumbnailSvg('${esc(r.title)}', '${esc(r.b || '')}');">

                      <!-- Top Right Duration & Direct Download -->
                      <div class="preapp-thumb-top-right">
                        ${r.dur ? `<span class="preapp-dur-pill">${esc(r.dur)}</span>` : ''}
                        <button type="button" class="preapp-thumb-dl" data-act="direct-dl" data-id="${r.id}" title="Download Master MP4">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 20h16"/></svg>
                        </button>
                      </div>

                      <!-- Center Play Button (Translucent Frosted Glass Circle) -->
                      <div class="preapp-play-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                      </div>

                      <!-- Bottom Left Views Count -->
                      <div class="preapp-views-pill">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>${formatViews(r.views || 0)}</span>
                      </div>
                    </div>

                    <!-- Action Buttons Row (Icons Only - Ultra Modern & Clean) -->
                    <div class="preapp-actions-row">
                      <button type="button" class="preapp-act-btn approve ${r.status === 'approved' ? 'active' : ''}" data-act="preapp-approve" data-id="${r.id}" title="Approve Reel" aria-label="Approve Reel">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                      <button type="button" class="preapp-act-btn denied ${r.status === 'denied' ? 'active' : ''}" data-act="preapp-denied" data-id="${r.id}" title="Request Edits / Deny" aria-label="Request Edits / Deny">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>`;
              }).join('')}
            </div>`
        ) : `
          <div class="empty" style="margin:40px 0;">
            <div style="width:58px;height:58px;border-radius:50%;background:rgba(13,59,46,0.08);color:#0D3B2E;display:grid;place-items:center;margin:0 auto 10px;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <b style="font-size:16px;color:#0D3B2E;">No content in this selection</b>
            <span style="font-size:12px;color:var(--mute);">Upload new videos in Admin Panel or switch filters above to review delivered reels.</span>
          </div>`
        }
        ${renderBottomNav()}`;
    }

    function renderBottomNav() {
      document.getElementById('dn-social-dock')?.remove();
      if (!view.client || view.screen === 'splash' || view.screen === 'client-pin' || view.screen === 'landing' || view.screen === 'client-landing' || document.querySelector('.scrim')) return '';
      const isHome = view.screen === 'genesis';
      const isReels = view.screen === 'reels';
      const isBranches = view.screen === 'branches';
      const isPreApp = view.screen === 'preapproval';
      const isCollections = view.screen === 'collections' || view.screen === 'albums';

      return `
        <nav class="client-bottom-nav" aria-label="Client Navigation">
          <button class="bnav-btn ${isHome ? 'active' : ''}" data-act="bnav-home">
            <span class="bnav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>
            <span class="bnav-label">Home</span>
          </button>
          <button class="bnav-btn ${isReels ? 'active' : ''}" data-act="bnav-reels">
            <span class="bnav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/></svg></span>
            <span class="bnav-label">Reels</span>
          </button>
          <button class="bnav-btn ${isBranches ? 'active' : ''}" data-act="bnav-branches">
            <span class="bnav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg></span>
            <span class="bnav-label">Branches</span>
          </button>
          <button class="bnav-btn ${isPreApp ? 'active' : ''}" data-act="bnav-preapproval">
            <span class="bnav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg></span>
            <span class="bnav-label">Pre-Approval</span>
          </button>
          <button class="bnav-btn ${isCollections ? 'active' : ''}" data-act="bnav-collections">
            <span class="bnav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
            <span class="bnav-label">Collections</span>
          </button>
        </nav>
      `;
    }

    function openBranchPicker(c) {
      const branches = (c && c.branches && Array.isArray(c.branches) && c.branches.length) ? c.branches : [];
      const curB = view.branch || 'all';
      sheet(`
        <div style="padding:10px 4px 6px;">
          <div class="mp-title">
            <h3>Select Store Branch</h3>
            <button class="ghost" data-close style="padding:4px 12px;border-radius:999px;font-size:12px;">Close</button>
          </div>
          <p style="font-size:12px;color:var(--mute);margin:0 0 14px;">Filter video reels and promotional content by showroom location.</p>
          <div class="branch-picker-list" style="display:flex;flex-direction:column;gap:8px;">
            <button class="branch-picker-btn ${curB === 'all' ? 'active' : ''}" data-act="select-dropdown-branch" data-branch="all" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:${curB === 'all' ? 'var(--navy)' : 'var(--card)'};color:${curB === 'all' ? '#fff' : 'var(--ink)'};font-weight:600;font-size:14px;cursor:pointer;">
              <span style="display:flex;align-items:center;gap:10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                All Branches / Locations
              </span>
              ${curB === 'all' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
            </button>
            ${branches.length ? branches.map(br => {
              const isAct = curB.toLowerCase() === br.toLowerCase();
              return `
                <button class="branch-picker-btn ${isAct ? 'active' : ''}" data-act="select-dropdown-branch" data-branch="${esc(br)}" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:${isAct ? 'var(--navy)' : 'var(--card)'};color:${isAct ? '#fff' : 'var(--ink)'};font-weight:600;font-size:14px;cursor:pointer;">
                  <span style="display:flex;align-items:center;gap:10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"/></svg>
                    ${esc(br)} Branch
                  </span>
                  ${isAct ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                </button>
              `;
            }).join('') : `
              <div style="padding:14px;background:var(--soft);border-radius:10px;text-align:center;font-size:12.5px;color:var(--mute);">
                No separate showroom branches configured for ${esc(c.name || 'this client')}.
              </div>
            `}
          </div>
        </div>
      `, sc => {}, false, 'branch-picker-scrim');
    }

    function openWavePicker(c) {
      const clientWaves = (c && c.waves && Array.isArray(c.waves) && c.waves.length) ? c.waves : ['Phase 1', 'Phase 2', 'Phase 3'];
      const curPhase = view.preappPhase || 'all';
      sheet(`
        <div style="padding:10px 4px 6px;">
          <div class="mp-title">
            <h3>Select Delivery Wave / Category</h3>
            <button class="ghost" data-close style="padding:4px 12px;border-radius:999px;font-size:12px;">Close</button>
          </div>
          <p style="font-size:12px;color:var(--mute);margin:0 0 14px;">Filter content by production wave, phase, or release batch.</p>
          <div class="wave-picker-list" style="display:flex;flex-direction:column;gap:8px;">
            <button class="wave-picker-btn ${curPhase === 'all' ? 'active' : ''}" data-act="select-dropdown-wave" data-phase="all" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:${curPhase === 'all' ? 'var(--navy)' : 'var(--card)'};color:${curPhase === 'all' ? '#fff' : 'var(--ink)'};font-weight:600;font-size:14px;cursor:pointer;">
              <span style="display:flex;align-items:center;gap:10px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${curPhase === 'all' ? 'var(--gold)' : '#ccc'};"></span>
                All Waves
              </span>
              ${curPhase === 'all' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
            </button>
            ${clientWaves.map((waveName, wIdx) => {
              const waveKey = 'wave_' + wIdx;
              const isAct = curPhase === waveKey || curPhase === waveName || curPhase === ('phase' + (wIdx + 1));
              return `
                <button class="wave-picker-btn ${isAct ? 'active' : ''}" data-act="select-dropdown-wave" data-phase="${waveKey}" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:${isAct ? 'var(--navy)' : 'var(--card)'};color:${isAct ? '#fff' : 'var(--ink)'};font-weight:600;font-size:14px;cursor:pointer;">
                  <span style="display:flex;align-items:center;gap:10px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:${isAct ? 'var(--gold)' : '#ccc'};"></span>
                    ${esc(waveName)}
                  </span>
                  ${isAct ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `, sc => {}, false, 'wave-picker-scrim');
    }

    function openMonthPicker() {
      const currentM = view.month != null ? view.month : TODAY.getMonth();
      const currentY = view.year || TODAY.getFullYear();
      sheet(`
        <div style="padding:10px 4px 6px;">
          <div class="mp-title">
            <h3>Select Delivery Month</h3>
            <button class="ghost" data-close style="padding:4px 12px;border-radius:999px;font-size:12px;">Close</button>
          </div>
          <p style="font-size:12px;color:var(--mute);margin:0 0 14px;">Browse delivered video reels, festive stories, and posters by month.</p>
          <div class="mp-grid">
            ${MONTHS.map((mn, idx) => {
              const count = contentsFor(currentY, idx).length;
              const isSel = currentM === idx;
              return `
                <button class="mp-btn ${isSel ? 'active' : ''}" data-act="select-dropdown-month" data-m="${idx}">
                  <span>${mn.slice(0, 3)}</span>
                  <small>${count ? `${count} content${count === 1 ? '' : 's'}` : '0 items'}</small>
                </button>`;
            }).join('')}
          </div>
        </div>
      `, sc => {}, false, 'month-picker-scrim');
    }


    function attachWaveScroller() {
      const track = document.getElementById('preapp-phase-track');
      if (!track || track._hasScroller) return;
      track._hasScroller = true;

      track.addEventListener('wheel', e => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          track.scrollLeft += e.deltaY;
        }
      }, { passive: false });

      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;
      track.addEventListener('mousedown', e => {
        isDown = true;
        track.classList.add('grabbing');
        startX = e.pageX - track.offsetLeft;
        scrollLeft = track.scrollLeft;
      });
      window.addEventListener('mouseup', () => {
        if (isDown) {
          isDown = false;
          track.classList.remove('grabbing');
        }
      });
      track.addEventListener('mousemove', e => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - track.offsetLeft;
        const walk = (x - startX) * 1.5;
        track.scrollLeft = scrollLeft - walk;
      });
    }

    // --------------------------------------------------------------------------
    // SCREENS RENDERER
    // --------------------------------------------------------------------------
    function render() {
      const s = DATA.settings || {}, c = client();
      clearTimers();
      if (view.screen !== 'genesis' && feedAutoplayObserver) {
        feedAutoplayObserver.disconnect();
        feedAutoplayObserver = null;
      }

      // Dynamic favicon & title: Client logo for client screens, Logo folder icon for splash/general
      if (view.screen === 'splash' || !view.client || !c) {
        setFavicon('/Logo/logo.png');
        document.title = (s.agency || 'Day Night Media') + ' | DAY NIGHT';
      } else {
        const logo = (c.id === 'tcs' ? '/Logo/tcs-logo.png' : (c.logo || '/Logo/logo.png'));
        setFavicon(logo);
        document.title = `${c.name || 'Client'} | DAY NIGHT`;
      }


      // 0. Website Global Pause / Maintenance Mode Check
      if (DATA.settings?.sitePaused && !CONFIG.isAdmin && sessionStorage.getItem('dn_admin_auth') !== CONFIG.adminPasskey) {
        document.getElementById('dn-social-dock')?.remove();
        app.innerHTML = `
          <div class="site-paused-screen">
            <div class="site-paused-card">
              <div class="site-paused-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </div>
              <div class="mark-wrap">${dnLogo('mini')}</div>
              <h2 style="font-size:22px;color:var(--navy);font-weight:700;margin:0;">${esc(s.agency || 'Day Night Media')}</h2>
              <span style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--mute);">${esc(s.agencySub || 'Production Company')}</span>
              <p style="font-size:13.5px;color:var(--mute);line-height:1.6;margin:8px 0 16px;">${esc(s.sitePauseMsg || 'Day Night Media Portal is temporarily undergoing scheduled updates. Please check back shortly.')}</p>
              <div style="display:flex;gap:10px;justify-content:center;">
                <button type="button" class="btn-portal" id="btn-maint-unlock" style="font-size:12px;padding:6px 16px;border-radius:999px;">Staff Unlock</button>
              </div>
            </div>
          </div>`;
        const maintBtn = document.getElementById('btn-maint-unlock');
        if (maintBtn) maintBtn.onclick = () => verifyAdminAccess();
        return;
      }

      // 0B. Individual Client Pause / Block Notice
      if (c && !CONFIG.isAdmin && sessionStorage.getItem('dn_admin_auth') !== CONFIG.adminPasskey) {
        if (c.status === 'blocked' && view.screen !== 'splash' && view.screen !== 'dn-intro') {
          clearClientAuthentication(c.id);
          document.getElementById('dn-social-dock')?.remove();
          app.innerHTML = `
            <div class="site-paused-screen">
              <div class="site-paused-card">
                <div class="site-paused-icon" style="background:rgba(229,50,37,0.1);color:var(--red);">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
                <div class="mark-wrap">${dnLogo('mini')}</div>
                <h2 style="font-size:20px;color:var(--navy);font-weight:700;margin:0;">Access Suspended</h2>
                <span style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--mute);">${esc(c.name)} Portal</span>
                <p style="font-size:13.5px;color:var(--mute);line-height:1.6;margin:8px 0 16px;">This client portal has been deactivated. Please contact Day Night Media administration for assistance.</p>
                <div style="display:flex;gap:10px;justify-content:center;">
                  <button type="button" class="btn-portal" onclick="window.location.href='/'" style="font-size:12px;padding:6px 16px;border-radius:999px;">Return to Main Hub</button>
                </div>
              </div>
            </div>`;
          return;
        }
        if (c.status === 'paused' && view.screen !== 'splash' && view.screen !== 'dn-intro') {
          clearClientAuthentication(c.id);
          document.getElementById('dn-social-dock')?.remove();
          app.innerHTML = `
            <div class="site-paused-screen">
              <div class="site-paused-card">
                <div class="site-paused-icon" style="background:rgba(242,153,46,0.1);color:var(--amber);">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>
                </div>
                <div class="mark-wrap">${dnLogo('mini')}</div>
                <h2 style="font-size:20px;color:var(--navy);font-weight:700;margin:0;">Portal On Hold</h2>
                <span style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--mute);">${esc(c.name)} Portal</span>
                <p style="font-size:13.5px;color:var(--mute);line-height:1.6;margin:8px 0 16px;">This client delivery portal is temporarily paused for updates. Please check back shortly.</p>
                <div style="display:flex;gap:10px;justify-content:center;">
                  <button type="button" class="btn-portal" onclick="window.location.href='/'" style="font-size:12px;padding:6px 16px;border-radius:999px;">Return to Main Hub</button>
                </div>
              </div>
            </div>`;
          return;
        }
      }

      // Screen 1: Day Night Signature Loading / Splash Animation (Home Screen)
      if (view.screen === 'splash' || view.screen === 'dn-intro' || !view.client || !c) {
        if (app.querySelector('.splash')) {
          // Splash screen is already active and running — do not wipe DOM or restart animation!
          return;
        }
        app.innerHTML = `
          <section class="splash">
            <div class="hero">
              <div class="mark-wrap">${dnLogo('mark')}</div>
              <div class="a2">
                <h1>${esc(s.agency || 'Day Night Media')}</h1>
                <p class="sub">${esc(s.agencySub || 'Production Company')}</p>
              </div>
              <p class="slogan a3">${esc(s.slogan || 'Creating impact that brands remember')}</p>
            </div>

            <button type="button" class="btn start" data-act="start" id="dn-start-btn">${c ? `Access ${esc(c.name)} ${ic.arrow}` : `Start ${ic.arrow}`}</button>
          </section>`;

        playIntro(() => {
          const sp = app.querySelector('.splash');
          if (sp) sp.classList.add('ready');
          if (c && isClientAuthenticated(c.id)) {
            go({ screen: 'landing', client: c.id });
          }
        });
      }

      // Screen 1C: Client-Specific 4-Digit Access PIN
      else if (view.screen === 'client-pin') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        if (isClientAuthenticated(c.id)) {
          go({ screen: 'landing', client: c.id });
          return;
        }
        app.innerHTML = `
          <div class="top">
            <button class="back" data-act="back" aria-label="Back">${ic.back}</button>
            <div class="crumb"><small>${esc(c.name)}</small><span>Private Access</span></div>
            ${dnLogo('mini')}
          </div>
          <section class="client-pin-screen">
            <div class="client-pin-card">
              <div class="client-pin-logo-box">
                ${clientLogo(c)}
              </div>
              <h2 class="client-pin-title">${esc(c.name)}</h2>
              <span class="client-pin-badge">Private Client Portal</span>
              <p class="client-pin-desc">Enter 4-digit PIN for ${esc(c.name)}</p>

              <div class="pins" id="c-pins">
                ${[0, 1, 2, 3].map(i => `<input id="c-pin${i}" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" aria-label="Digit ${i + 1}">`).join('')}
              </div>
              <div class="code-msg" id="c-pin-msg">&nbsp;</div>

              <div class="client-pin-footer">
                <small>Day Night Media &middot; Executive Private Delivery</small>
              </div>
            </div>
          </section>`;
        setupClientPinInput(c);
      }

      // Screen 1L: Client Dedicated Landing Screen with Individual Custom Loading Animation
      else if (view.screen === 'landing' || view.screen === 'client-landing') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        app.innerHTML = `
          <div class="top">
            <button class="back" data-act="back" aria-label="Back">${ic.back}</button>
            <div class="crumb"><small>${esc(c.name)}</small><span>VIP Client Portal</span></div>
            ${dnLogo('mini')}
          </div>
          <section class="client-landing">
            <canvas class="canvas-fx" aria-hidden="true"></canvas>

            <div class="client-landing-logo-wrap">
              ${clientLogo(c, 'client-landing-logo')}
            </div>

            <h1 class="client-landing-title">${esc(c.name)}</h1>
            <span class="client-landing-badge">Exclusive Delivery Portal</span>

            <div class="tagline client-landing-tagline" aria-label="${esc(c.tagline || '')}">
              ${tagSpans(c)}<i class="caret"></i>
            </div>

            <div class="client-landing-loader">
              <div class="client-landing-status">
                <span class="client-landing-spinner"></span>
                <span id="client-landing-msg">Curating ${esc(c.name)} Showcase...</span>
              </div>
              <div class="client-landing-progress-bar">
                <div class="client-landing-progress-fill" id="client-progress-fill"></div>
              </div>
            </div>

            <button type="button" class="btn go-btn client-enter-btn" data-act="enter-client-portal" id="dn-enter-portal">
              Explore Delivered Reels ${ic.arrow}
            </button>
          </section>`;

        // Trigger individual custom animation (confetti, pulse, shimmer, rings) and tagline typewriter
        playAnimation(c.animStyle || 'confetti', c);
        playTagline();

        // Animate loading progress bar
        const fill = app.querySelector('#client-progress-fill');
        requestAnimationFrame(() => {
          if (fill) fill.style.width = '100%';
        });

        // Reveal enter button after 1100ms
        later(() => {
          const lnd = app.querySelector('.client-landing');
          if (lnd) lnd.classList.add('ready');
        }, 1100);

        // Auto-navigate into client preapproval / genesis reels portal after animation completes (2.8s)
        later(() => {
          if (view.screen === 'landing' || view.screen === 'client-landing') {
            go({ screen: 'genesis', client: c.id });
          }
        }, 2800);
      }

      // Screen 2: Client Genesis Screen (Home / Feeds Tab)
      else if (view.screen === 'genesis') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        app.innerHTML = renderFeedsPage(c);
        initFeedAutoplay();
      }

      // Screen 2A: Dedicated Client Approval Portal (Assigned Code Protected)
      else if (view.screen === 'preapproval') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        if (!isClientAuthenticated(c.id)) {
          openCode(c, 'preapproval');
          return;
        }
        app.innerHTML = renderPreApprovalPage(c, false);
        attachWaveScroller();
      }

      // Screen 2B: Dedicated Store Branches Screen
      else if (view.screen === 'branches') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        const list = c.branches || [];
        const total = (DATA.reels || []).filter(r => isClientMatch(r.c, c.id) && (!r.hidden || CONFIG.isAdmin) && r.status === 'approved').length;
        app.innerHTML = `
          ${topbar(c.name, 'Store Branches')}
          <div class="head">
            ${c.logo ? `<img class="clogo" src="${esc(c.logo)}" alt="">` : ''}
            <div class="row-between">
              <h2>Store Branches</h2>
            </div>
            <small>${list.length} location${list.length === 1 ? '' : 's'} · ${total} delivered content${total === 1 ? '' : 's'}</small>
          </div>
          ${list.length ? `
            <div class="branches">
              ${list.map(b => {
                const n = contentsFor(null, null, b).length;
                const cover = (c.branchCovers && c.branchCovers[b]) || '';
                return `
                  <button class="branch ${cover ? 'has-cover' : 'no-cover'}" style="--c:${bColor(b, list)}" data-act="branch" data-b="${esc(b)}">
                    <div class="branch-cover-wrap">
                      ${cover 
                        ? `<img src="${esc(cover)}" alt="" class="branch-cover-img">` 
                        : `<div class="branch-cover-placeholder"><span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:var(--navy);">${esc(b.slice(0, 2).toUpperCase())}</span><span style="font-size:11px;color:var(--mute);">${esc(b)} Branch</span></div>`
                      }
                      ${CONFIG.isAdmin ? `
                        <span class="branch-cov-btn" data-act="cover-branch" data-b="${esc(b)}" title="Set cover image (Upload or Link)">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        </span>` : ''}
                    </div>
                    <div class="branch-meta-wrap">
                      <span class="bn"><small>Store Branch</small><b>${esc(b)}</b></span>
                      <span class="cnt"><strong>${n}</strong> content${n === 1 ? '' : 's'}</span>
                    </div>
                  </button>`;
              }).join('')}
            </div>` : '<div class="empty">No store branches configured</div>'}
          ${CONFIG.isAdmin ? '<button class="fab-add" data-act="add" aria-label="Add reel">+</button>' : ''}
          ${renderBottomNav()}`;
      }

      // Screen 2C: Dedicated Collections Screen
      else if (view.screen === 'collections' || view.screen === 'albums') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        const list = c.albums || [];
        const total = (DATA.reels || []).filter(r => isClientMatch(r.c, c.id) && (!r.hidden || CONFIG.isAdmin) && r.status === 'approved').length;
        app.innerHTML = `
          ${topbar(c.name, 'Collections')}
          <div class="head">
            ${c.logo ? `<img class="clogo" src="${esc(c.logo)}" alt="">` : ''}
            <div class="row-between">
              <h2>Festive &amp; Campaign Collections</h2>
            </div>
            <small>${list.length} collection${list.length === 1 ? '' : 's'} · ${total} delivered content${total === 1 ? '' : 's'}</small>
          </div>
          ${list.length ? `
            <div class="branches">
              ${list.map(alb => {
                const n = contentsFor(null, null, null, alb).length;
                const cover = (c.albumCovers && c.albumCovers[alb]) || '';
                return `
                  <button class="branch ${cover ? 'has-cover' : 'no-cover'}" style="--c:${bColor(alb, list)}" data-act="album" data-alb="${esc(alb)}">
                    <div class="branch-cover-wrap">
                      ${cover 
                        ? `<img src="${esc(cover)}" alt="" class="branch-cover-img">` 
                        : `<div class="branch-cover-placeholder"><span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:var(--navy);">${esc(alb.slice(0, 2).toUpperCase())}</span><span style="font-size:11px;color:var(--mute);">${esc(alb)}</span></div>`
                      }
                      ${CONFIG.isAdmin ? `
                        <span class="branch-cov-btn" data-act="cover-album" data-alb="${esc(alb)}" title="Set cover image (Upload or Link)">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        </span>` : ''}
                    </div>
                    <div class="branch-meta-wrap">
                      <span class="bn"><small>Collection</small><b>${esc(alb)}</b></span>
                      <span class="cnt"><strong>${n}</strong> content${n === 1 ? '' : 's'}</span>
                    </div>
                  </button>`;
              }).join('')}
            </div>` : '<div class="empty">No collections configured</div>'}
          ${CONFIG.isAdmin ? '<button class="fab-add" data-act="add" aria-label="Add reel">+</button>' : ''}
          ${renderBottomNav()}`;
      }

      // Screen 3: Library Navigator (Months Calendar view if explicitly requested)
      else if (view.screen === 'months') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        const y = view.year;
        const total = (DATA.reels || []).filter(r => isClientMatch(r.c, c.id) && (!r.hidden || CONFIG.isAdmin) && (CONFIG.isAdmin || r.status === 'approved')).length;
        const availableYears = Array.from(new Set([TODAY.getFullYear(), ...(DATA.reels || []).map(r => r.y)])).sort();
        const hasBranches = !!(c.branches && c.branches.length);
        const hasAlbums = !!(c.albums && c.albums.length);

        if (view.tabMode === 'branches' && !hasBranches) view.tabMode = 'months';
        if (view.tabMode === 'albums' && !hasAlbums) view.tabMode = 'months';

        let tabContent = '';
        if (view.tabMode === 'months') {
          tabContent = `
            <div class="months">
              ${MONTHS.map((mn, i) => {
                const n = reelsFor(y, i).length;
                const now = y === TODAY.getFullYear() && i === TODAY.getMonth();
                const fut = y > TODAY.getFullYear() || (y === TODAY.getFullYear() && i > TODAY.getMonth());
                return `
                  <button class="month ${n ? 'has' : ''} ${now ? 'now' : ''} ${fut && !n ? 'off' : ''}" style="--c:${MCOL[i]}" data-act="month" data-m="${i}">
                    <span class="cal">${mn.slice(0, 3).toUpperCase()}</span>
                    <span class="mn">${mn}</span>
                    <span class="ct">${n ? `${n} reel${n > 1 ? 's' : ''}` : (now ? 'In progress' : 'No reels')}</span>
                  </button>`;
              }).join('')}
            </div>`;
        } else if (view.tabMode === 'branches') {
          const list = c.branches || [];
          tabContent = list.length ? `
            <div class="branches">
              ${list.map(b => {
                const n = contentsFor(null, null, b).length;
                const cover = (c.branchCovers && c.branchCovers[b]) || '';
                return `
                  <button class="branch ${cover ? 'has-cover' : 'no-cover'}" style="--c:${bColor(b, list)}" data-act="branch" data-b="${esc(b)}">
                    <div class="branch-cover-wrap">
                      ${cover 
                        ? `<img src="${esc(cover)}" alt="" class="branch-cover-img">` 
                        : `<div class="branch-cover-placeholder"><span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:var(--navy);">${esc(b.slice(0, 2).toUpperCase())}</span><span style="font-size:11px;color:var(--mute);">${esc(b)} Branch</span></div>`
                      }
                      ${CONFIG.isAdmin ? `
                        <span class="branch-cov-btn" data-act="cover-branch" data-b="${esc(b)}" title="Set cover image (Upload or Link)">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        </span>` : ''}
                    </div>
                    <div class="branch-meta-wrap">
                      <span class="bn"><small>Store Branch</small><b>${esc(b)}</b></span>
                      <span class="cnt"><strong>${n}</strong> content${n === 1 ? '' : 's'}</span>
                    </div>
                  </button>`;
              }).join('')}
            </div>` : '<div class="empty">No store branches configured</div>';
        } else if (view.tabMode === 'albums') {
          const list = c.albums || [];
          tabContent = list.length ? `
            <div class="branches">
              ${list.map(alb => {
                const n = contentsFor(null, null, null, alb).length;
                const cover = (c.albumCovers && c.albumCovers[alb]) || '';
                return `
                  <button class="branch ${cover ? 'has-cover' : 'no-cover'}" style="--c:${bColor(alb, list)}" data-act="album" data-alb="${esc(alb)}">
                    <div class="branch-cover-wrap">
                      ${cover 
                        ? `<img src="${esc(cover)}" alt="" class="branch-cover-img">` 
                        : `<div class="branch-cover-placeholder"><span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:var(--navy);">${esc(alb.slice(0, 2).toUpperCase())}</span><span style="font-size:11px;color:var(--mute);">${esc(alb)}</span></div>`
                      }
                      ${CONFIG.isAdmin ? `
                        <span class="branch-cov-btn" data-act="cover-album" data-alb="${esc(alb)}" title="Set cover image (Upload or Link)">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        </span>` : ''}
                    </div>
                    <div class="branch-meta-wrap">
                      <span class="bn"><small>Collection</small><b>${esc(alb)}</b></span>
                      <span class="cnt"><strong>${n}</strong> content${n === 1 ? '' : 's'}</span>
                    </div>
                  </button>`;
              }).join('')}
            </div>` : '<div class="empty">No collections configured</div>';
        }

        app.innerHTML = `
          ${topbar(c.name, 'Content Library')}
          <div class="head">
            ${c.logo ? `<img class="clogo" src="${esc(c.logo)}" alt="">` : ''}
            <div class="row-between">
              <h2>Explore Contents</h2>
              <div class="years">
                ${availableYears.map(yy => `<button data-act="year" data-y="${yy}" aria-pressed="${yy === y}">${yy}</button>`).join('')}
              </div>
            </div>
            <small>${total} delivered content${total === 1 ? '' : 's'}</small>
          </div>

          ${(hasBranches || hasAlbums) ? `
          <div class="view-switcher">
            <button class="view-btn ${view.tabMode === 'months' ? 'active' : ''}" data-act="tab" data-tab="months">Months</button>
            ${hasBranches ? `<button class="view-btn ${view.tabMode === 'branches' ? 'active' : ''}" data-act="tab" data-tab="branches">Branches</button>` : ''}
            ${hasAlbums ? `<button class="view-btn ${view.tabMode === 'albums' ? 'active' : ''}" data-act="tab" data-tab="albums">Albums</button>` : ''}
          </div>` : ''}

          ${tabContent}
          ${CONFIG.isAdmin ? '<button class="fab-add" data-act="add" aria-label="Add reel">+</button>' : ''}
          ${renderBottomNav()}`;
      }

      // Screen 4: Reels Gallery & Content Hub (Reference Concept UI)
      else if (view.screen === 'reels') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        const { year: y, month: m, branch: b, album: alb } = view;
        const currentType = view.contentType || 'all';
        const allList = contentsFor(m != null ? y : null, m, b, alb);
        const reelsList = contentsFor(m != null ? y : null, m, b, alb, 'reels');
        const storiesList = contentsFor(m != null ? y : null, m, b, alb, 'stories');
        const postersList = contentsFor(m != null ? y : null, m, b, alb, 'posters');
        const gridCols = view.gridCols || 2;

        // Banner Image (Only use client's real configured bannerUrl; otherwise use luxury gradient)
        const heroBanner = c.banner || c.heroBanner || c.bannerUrl || '';

        // Unified Gallery View for Reels, Stories, and Posters (Reference Concept Card Listing)
        let displayList = currentType === 'all'
          ? allList
          : (currentType === 'reels' ? reelsList : (currentType === 'stories' ? storiesList : postersList));

        if (view.searchQuery) {
          const q = view.searchQuery.toLowerCase();
          displayList = displayList.filter(r => (r.title || '').toLowerCase().includes(q) || (r.b || '').toLowerCase().includes(q) || (r.album || '').toLowerCase().includes(q));
        }

        const emptyIcon = currentType === 'stories'
          ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="3"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>'
          : (currentType === 'posters'
            ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
            : ic.film);

        const emptyTitle = view.searchQuery
          ? `No contents matching "${esc(view.searchQuery)}"`
          : (currentType === 'stories'
            ? 'No Stories in this section yet'
            : (currentType === 'posters'
              ? 'No Posters in this section yet'
              : (currentType === 'reels' ? 'No Reels in this section yet' : 'No contents in this section yet')));

        const emptySub = view.searchQuery
          ? 'Try another search term.'
          : (currentType === 'stories'
            ? 'Delivered vertical festive stories will appear here.'
            : (currentType === 'posters'
              ? 'Delivered campaign posters and creatives will appear here.'
              : 'Delivered reels will appear here automatically.'));

        const contentBody = displayList.length ? `
          <div class="reels ${gridCols === 3 ? 'grid-3col' : (gridCols === 1 ? 'grid-1col' : 'grid-2col')}">
            ${displayList.map((r, i) => {
              const isVideo = (!r.type || r.type === 'reel' || r.type === 'video') ||
                (r.type === 'story' && r.url && (r.url.endsWith('.mp4') || r.url.endsWith('.mov') || r.url.includes('video')));
              const has = Boolean(r.url);
              const col = RCOL[i % RCOL.length];
              const isHidden = r.hidden === true;
              return `
                <div class="reel ${isHidden ? 'is-hidden' : ''}">
                  <div class="poster ${r.type === 'poster' ? 'is-square' : ''}" style="--c:${col}" data-act="${isVideo ? 'play-video' : 'view-image'}" data-id="${r.id}" aria-label="View ${esc(r.title)}">
                    <img class="custom-cover" src="${esc(r.coverUrl || getFallbackThumbnailSvg(r.title, r.b || (c && c.name) || ''))}" alt="${esc(r.title)}" loading="lazy" onerror="this.onerror=null;this.src=getFallbackThumbnailSvg('${esc(r.title)}', '${esc(r.b || '')}');">
                    <span class="zari"></span>
                    <button type="button" class="fav-toggle-btn ${isFavorited(r.id) ? 'is-fav' : ''}" data-act="toggle-fav" data-id="${r.id}" aria-label="Favorite">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="${isFavorited(r.id) ? '#E8457A' : 'none'}" stroke="${isFavorited(r.id) ? '#E8457A' : '#FFFFFF'}" stroke-width="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    ${r.dur ? `<span class="dur">${esc(r.dur)}</span>` : ''}
                    <span class="play" style="color:${col}">${isVideo ? ic.play : ic.view}</span>
                    <span class="views-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${r.views ? r.views + ' views' : 'Delivered'}</span>
                    <span class="cap">${esc(r.title)}<small>${fmtDate(r.date)}${r.b ? ` · ${esc(r.b)}` : (r.album ? ` · ${esc(r.album)}` : '')}</small></span>
                    <span class="border"></span>
                  </div>
                  <div class="acts">
                    <button class="act" data-act="${isVideo ? 'play-video' : 'view-image'}" data-id="${r.id}" aria-label="View ${esc(r.title)}">
                      <span class="act-icon">${ic.view}</span>
                      <span class="act-label">View</span>
                    </button>
                    <button type="button" class="act" ${has ? `data-act="direct-dl" data-id="${r.id}" aria-label="Download ${esc(r.title)}"` : 'aria-disabled="true"'}>
                      <span class="act-icon">${ic.dl}</span>
                      <span class="act-label">Download</span>
                    </button>
                    <button class="act" data-act="share" data-id="${r.id}" ${has ? `aria-label="Share ${esc(r.title)}"` : 'aria-disabled="true"'}>
                      <span class="act-icon">${ic.share}</span>
                      <span class="act-label">Share</span>
                    </button>
                  </div>
                  ${CONFIG.isAdmin ? `
                    <div class="admin-reel-bar">
                      <button class="btn-edit" data-act="edit-reel" data-id="${r.id}">Edit</button>
                      <button class="btn-hide" data-act="toggle-hide" data-id="${r.id}">${isHidden ? 'Unhide' : 'Hide'}</button>
                      <button class="btn-del" data-act="del" data-id="${r.id}">Delete</button>
                    </div>` : ''}
                </div>`;
            }).join('')}
          </div>`
          : `<div class="empty"><div style="width:54px;height:54px;border-radius:50%;background:rgba(18,41,74,0.06);display:grid;place-items:center;color:var(--navy);margin-bottom:4px;">${emptyIcon}</div><b>${emptyTitle}</b><span>${emptySub}</span></div>`;
        app.innerHTML = `
          ${topbar(c.name, 'Reels Gallery')}
          
          <!-- Top Brand Hero Banner (Reference Concept) -->
          <div class="client-hero-banner">
            ${heroBanner ? `<img src="${esc(heroBanner)}" class="hero-banner-img" alt="">` : ''}
            <div class="hero-banner-overlay">
              <span class="hero-brand-name">${esc(c.name)}</span>
              <span class="hero-brand-slogan">${esc(c.slogan || c.tagline || 'Private Client Delivery Portal')}</span>
            </div>
          </div>

          <!-- Floating Client Card & Month Selector (Reference Concept) -->
          <div class="client-header-card">
            <div class="ch-left">
              ${c.logo ? `<img class="ch-logo" src="${esc(c.logo)}" alt="">` : ''}
              <div class="ch-info">
                <h3>${esc(c.name)}</h3>
                <p>${esc(b ? `${b} Branch` : (alb ? alb : 'All Branches & Collections'))}</p>
              </div>
            </div>
            <button class="month-selector-btn" data-act="open-month-dropdown">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>${m != null ? `${MONTHS[m]} ${y}` : `${y || 2026}`}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>

          <!-- Gallery Title Row -->
          <div class="gallery-title-row">
            <h2 class="gallery-heading">Reels Gallery</h2>
            <p class="gallery-sub">Explore our latest collections, offers, behind the scenes and more.</p>
          </div>

          <!-- Search & Density Tools Bar (Reference Concept) -->
          <div class="gallery-tools-bar">
            <div class="gallery-search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" class="gallery-search-inp" id="gallery-search-inp" placeholder="Search videos, collections..." value="${esc(view.searchQuery || '')}">
              ${view.searchQuery ? `<button class="clear-search-btn" data-act="clear-search">&times;</button>` : ''}
            </div>
            <div class="density-switcher">
              <button class="density-btn ${gridCols === 2 ? 'active' : ''}" data-act="set-grid" data-cols="2" title="2 per row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
                <span>2 per row</span>
              </button>
              <button class="density-btn ${gridCols === 3 ? 'active' : ''}" data-act="set-grid" data-cols="3" title="3 per row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="5" height="18" rx="1"/><rect x="9.5" y="3" width="5" height="18" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/></svg>
                <span>3 per row</span>
              </button>
            </div>
          </div>

          <!-- Content Category Tabs -->
          <div class="content-type-switcher">
            <button class="ctype-btn ${currentType === 'all' ? 'active' : ''}" data-act="set-ctype" data-ctype="all">
              All (${allList.length})
            </button>
            <button class="ctype-btn ${currentType === 'reels' ? 'active' : ''}" data-act="set-ctype" data-ctype="reels">
              Reels (${reelsList.length})
            </button>
            <button class="ctype-btn ${currentType === 'stories' ? 'active' : ''}" data-act="set-ctype" data-ctype="stories">
              Stories (${storiesList.length})
            </button>
            <button class="ctype-btn ${currentType === 'posters' ? 'active' : ''}" data-act="set-ctype" data-ctype="posters">
              Posters (${postersList.length})
            </button>
          </div>

          ${contentBody}
          ${CONFIG.isAdmin ? '<button class="fab-add" data-act="add" aria-label="Add reel">+</button>' : ''}
          ${renderBottomNav()}`;

        // Wire real-time search input
        const searchInp = document.getElementById('gallery-search-inp');
        if (searchInp) {
          searchInp.oninput = e => {
            view.searchQuery = e.target.value.trim();
            render();
            // Restore focus
            const newInp = document.getElementById('gallery-search-inp');
            if (newInp) {
              newInp.focus();
              newInp.selectionStart = newInp.selectionEnd = newInp.value.length;
            }
          };
        }
      }

      // Screen 5: Saved Favorites Page
      else if (view.screen === 'favorites') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        const favIds = [];
        try { favIds.push(...JSON.parse(localStorage.getItem('dn_favs_' + c.id) || '[]')); } catch(e) {}
        const allFavs = (DATA.reels || []).filter(r => isClientMatch(r.c, c.id) && favIds.includes(r.id) && (CONFIG.isAdmin || (!r.hidden && r.status === 'approved')));
        const currentType = view.contentType || 'all';
        const gridCols = view.gridCols || 2;

        let displayList = currentType === 'all' ? allFavs : allFavs.filter(r => {
          if (currentType === 'reels') return !r.type || r.type === 'reel' || r.type === 'video';
          if (currentType === 'stories') return r.type === 'story';
          if (currentType === 'posters') return r.type === 'poster';
          return true;
        });

        if (view.searchQuery) {
          const q = view.searchQuery.toLowerCase();
          displayList = displayList.filter(r => (r.title || '').toLowerCase().includes(q) || (r.b || '').toLowerCase().includes(q) || (r.album || '').toLowerCase().includes(q));
        }

        app.innerHTML = `
          ${topbar(c.name, 'Saved Favorites')}
          <div class="gallery-title-row" style="margin-top:10px;">
            <h2 class="gallery-heading">Saved Favorites</h2>
            <p class="gallery-sub">Your curated library of favorited video reels, stories, and festive campaign creative.</p>
          </div>

          <div class="gallery-tools-bar">
            <div class="gallery-search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" class="gallery-search-inp" id="gallery-search-inp" placeholder="Search favorites..." value="${esc(view.searchQuery || '')}">
              ${view.searchQuery ? `<button class="clear-search-btn" data-act="clear-search">&times;</button>` : ''}
            </div>
            <div class="density-switcher">
              <button class="density-btn ${gridCols === 2 ? 'active' : ''}" data-act="set-grid" data-cols="2" title="2 per row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
                <span>2 per row</span>
              </button>
              <button class="density-btn ${gridCols === 3 ? 'active' : ''}" data-act="set-grid" data-cols="3" title="3 per row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="5" height="18" rx="1"/><rect x="9.5" y="3" width="5" height="18" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/></svg>
                <span>3 per row</span>
              </button>
            </div>
          </div>

          ${displayList.length ? `
            <div class="reels ${gridCols === 3 ? 'grid-3col' : (gridCols === 1 ? 'grid-1col' : 'grid-2col')}">
              ${displayList.map((r, i) => {
                const isVideo = !r.type || r.type === 'reel' || r.type === 'video';
                const has = !!r.url;
                const col = RCOL[i % RCOL.length];
                return `
                  <div class="reel">
                    <div class="poster ${r.type === 'poster' ? 'is-square' : ''}" style="--c:${col}" data-act="${isVideo ? 'play-video' : 'view-image'}" data-id="${r.id}">
                      <img class="custom-cover" src="${esc(r.coverUrl || getFallbackThumbnailSvg(r.title, r.b || (c && c.name) || ''))}" alt="${esc(r.title)}" loading="lazy" onerror="this.onerror=null;this.src=getFallbackThumbnailSvg('${esc(r.title)}', '${esc(r.b || '')}');">
                      <span class="zari"></span>
                      <button type="button" class="fav-toggle-btn is-fav" data-act="toggle-fav" data-id="${r.id}" aria-label="Favorite">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="#E8457A" stroke="#E8457A" stroke-width="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </button>
                      ${r.dur ? `<span class="dur">${esc(r.dur)}</span>` : ''}
                      <span class="play" style="color:${col}">${isVideo ? ic.play : ic.view}</span>
                      <span class="cap">${esc(r.title)}<small>${fmtDate(r.date)}${r.b ? ` · ${esc(r.b)}` : ''}</small></span>
                      <span class="border"></span>
                    </div>
                    <div class="acts">
                      <button class="act" data-act="${isVideo ? 'play-video' : 'view-image'}" data-id="${r.id}" aria-label="View ${esc(r.title)}">
                        <span class="act-icon">${ic.view}</span>
                        <span class="act-label">View</span>
                      </button>
                      <button type="button" class="act" ${has ? `data-act="direct-dl" data-id="${r.id}" aria-label="Download ${esc(r.title)}"` : 'aria-disabled="true"'}>
                        <span class="act-icon">${ic.dl}</span>
                        <span class="act-label">Download</span>
                      </button>
                      <button class="act" data-act="share" data-id="${r.id}" ${has ? `aria-label="Share ${esc(r.title)}"` : 'aria-disabled="true"'}>
                        <span class="act-icon">${ic.share}</span>
                        <span class="act-label">Share</span>
                      </button>
                    </div>
                  </div>`;
              }).join('')}
            </div>`
            : `<div class="empty">
                <div style="width:64px;height:64px;border-radius:50%;background:rgba(232,69,122,0.1);color:#E8457A;display:grid;place-items:center;margin:0 auto 12px;">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </div>
                <b>No favorites saved yet</b>
                <span>Tap the heart icon on any reel or poster to save your favorite creative here.</span>
                <button class="btn go-btn" data-act="bnav-reels" style="margin-top:16px;max-width:240px;">Explore Reels Gallery</button>
              </div>`
          }
          ${renderBottomNav()}`;

        const searchInp = document.getElementById('gallery-search-inp');
        if (searchInp) {
          searchInp.oninput = e => {
            view.searchQuery = e.target.value.trim();
            render();
            const newInp = document.getElementById('gallery-search-inp');
            if (newInp) {
              newInp.focus();
              newInp.selectionStart = newInp.selectionEnd = newInp.value.length;
            }
          };
        }
      }

      // Screen 6: Client Profile & Brand Security Page
      else if (view.screen === 'profile') {
        if (!c) { go({ screen: 'splash', client: null }); return; }
        const clientReels = (DATA.reels || []).filter(r => isClientMatch(r.c, c.id) && (CONFIG.isAdmin || (!r.hidden && r.status === 'approved')));
        const storiesCount = clientReels.filter(r => r.type === 'story').length;
        const postersCount = clientReels.filter(r => r.type === 'poster').length;
        const reelsCount = clientReels.filter(r => !r.type || r.type === 'reel' || r.type === 'video').length;
        const branches = c.branches || [];

        app.innerHTML = `
          ${topbar(c.name, 'Client Profile')}
          
          <div class="profile-card">
            <div class="profile-hero">
              <div class="profile-avatar-wrap">
                ${c.logo ? `<img src="${esc(c.logo)}" class="profile-avatar" alt="">` : `<div class="profile-avatar-ph">${esc(c.name.slice(0, 2).toUpperCase())}</div>`}
              </div>
              <h2 class="profile-name">${esc(c.name)}</h2>
              <p class="profile-slogan">${esc(c.tagline || c.slogan || 'Tradition · Elegance · Excellence')}</p>
              <span class="profile-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Authorized Client Delivery Portal</span>
              <div style="margin-top:10px;display:flex;gap:8px;justify-content:center;">
                <button type="button" data-act="replay-intro" style="font-size:11.5px;padding:6px 14px;border-radius:999px;background:var(--soft);border:1px solid var(--line);color:var(--navy);cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-weight:600;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                  Replay Custom Loading Animation
                </button>
              </div>
            </div>

            <div class="profile-stats-grid">
              <div class="pstat-item">
                <b>${reelsCount}</b>
                <small>Reels</small>
              </div>
              <div class="pstat-item">
                <b>${storiesCount}</b>
                <small>Stories</small>
              </div>
              <div class="pstat-item">
                <b>${postersCount}</b>
                <small>Posters</small>
              </div>
              <div class="pstat-item">
                <b>${branches.length}</b>
                <small>Branches</small>
              </div>
            </div>

            <!-- Saved Favorites Section inside Profile -->
            <div class="profile-media-section">
              <div class="profile-media-header">
                <h4>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#E8457A" stroke="#E8457A" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  Saved Favorites
                </h4>
                <small style="color:var(--mute);font-size:11px;">${getFavorites(c.id).length} saved</small>
              </div>
              <div class="profile-favs-grid">
                ${(function(){
                  const favIds = getFavorites(c.id);
                  const favReels = (DATA.reels || []).filter(r => isClientMatch(r.c, c.id) && favIds.includes(r.id) && (CONFIG.isAdmin || (!r.hidden && r.status === 'approved')));
                  if (!favReels.length) return '<p style="grid-column:1/-1;font-size:12px;color:var(--mute);padding:6px 0;">No favorites yet. Tap the bookmark icon on any reel to save it here for quick access.</p>';
                  return favReels.map(r => `
                    <div class="pfav-card" data-act="play-video" data-id="${r.id}">
                      ${r.coverUrl ? `<img src="${esc(r.coverUrl)}" alt="${esc(r.title)}">` : `<div style="width:100%;height:100%;background:#111;display:grid;place-items:center;color:#FFF;">${ic.film}</div>`}
                      <div class="pfav-overlay">
                        ${r.dur ? `<span>${esc(r.dur)}</span>` : ''}
                      </div>
                    </div>
                  `).join('');
                })()}
              </div>
            </div>

            <!-- Saved Watch History Section inside Profile -->
            <div class="profile-media-section" style="margin-top:16px;">
              <div class="profile-media-header">
                <h4>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Watch History
                </h4>
                <button type="button" class="ghost" data-act="clear-history" style="font-size:11px;padding:3px 10px;border-radius:99px;color:var(--red);">Clear</button>
              </div>
              <div class="history-list">
                ${(function(){
                  let hist = [];
                  try { hist = JSON.parse(localStorage.getItem('dn_history_' + c.id) || '[]'); } catch(e){}
                  if (!hist.length) return '<p style="font-size:12px;color:var(--mute);padding:6px 0;">No watch history yet. Videos you play will be recorded here.</p>';
                  return hist.slice(0, 6).map(item => `
                    <div class="history-item" data-act="play-video" data-id="${item.id}">
                      <div class="history-thumb-wrap"><img src="${esc(item.coverUrl || getFallbackThumbnailSvg(item.title || 'Reel', ''))}" class="history-thumb" alt="" onerror="this.onerror=null;this.src=getFallbackThumbnailSvg('${esc(item.title || 'Reel')}');"></div>
                      <div class="history-info">
                        <b>${esc(item.title)}</b>
                        <small>${item.b ? esc(item.b) + ' · ' : ''}${item.dur ? item.dur : ''} · ${new Date(item.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:var(--navy);flex:none;"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    </div>
                  `).join('');
                })()}
              </div>
            </div>

            <div class="profile-section">
              <h4>Store Branch Locations</h4>
              <div class="pbranch-list">
                ${branches.map(b => `
                  <div class="pbranch-item" data-act="go-branch" data-b="${esc(b)}">
                    <span>${esc(b)} Branch</span>
                    <small>${contentsFor(null, null, b).length} contents &rarr;</small>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="profile-section">
              <h4>Security &amp; Session Privacy</h4>
              <div class="paction-box">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <div>
                    <b style="font-size:13px;color:var(--navy);">Private Client PIN</b>
                    <p style="font-size:11px;color:var(--mute);margin:2px 0 0;">PIN Code: <span id="pin-display">••••</span></p>
                  </div>
                  <button type="button" class="ghost" id="btn-toggle-pin" style="padding:4px 12px;font-size:11px;border-radius:99px;">Show PIN</button>
                </div>
                <button type="button" class="btn-lock" data-act="lock-portal">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  Lock Portal Session
                </button>
              </div>
            </div>

            
          </div>

          ${renderBottomNav()}`;

        const togglePinBtn = document.getElementById('btn-toggle-pin');
        const pinDisplay = document.getElementById('pin-display');
        if (togglePinBtn && pinDisplay) {
          let visible = false;
          togglePinBtn.onclick = () => {
            visible = !visible;
            pinDisplay.textContent = visible ? (c.code || '—') : '••••';
            togglePinBtn.textContent = visible ? 'Hide PIN' : 'Show PIN';
          };
        }
      }

      // Manage bottom nav and intro screen classes on body
      if (view.client && view.screen !== 'splash' && view.screen !== 'client-pin') {
        document.body.classList.add('has-bnav');
      } else {
        document.body.classList.remove('has-bnav');
      }
      if (view.screen === 'splash' || view.screen === 'dn-intro') {
        document.body.classList.add('is-intro-screen');
      } else {
        document.body.classList.remove('is-intro-screen');
      }
      renderSocialDock();
    }

    // --------------------------------------------------------------------------
    // CALENDAR VIEW & IMAGE MODAL FOR STORIES & POSTERS
    // --------------------------------------------------------------------------
    function renderCalendarContent(y, m, items, type) {
      const targetYear = y || TODAY.getFullYear();
      const targetMonth = (m != null) ? m : TODAY.getMonth();
      const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const firstDay = new Date(targetYear, targetMonth, 1).getDay();
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const typeLabel = type === 'stories' ? 'Stories' : 'Posters';

      const itemsByDay = {};
      items.forEach(it => {
        if (it.date) {
          const parts = it.date.split('-');
          const d = parseInt(parts[2], 10);
          if (d) {
            itemsByDay[d] = itemsByDay[d] || [];
            itemsByDay[d].push(it);
          }
        }
      });

      const cells = [];
      for (let i = 0; i < firstDay; i++) {
        cells.push('<div class="cal-cell blank"></div>');
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const dayItems = itemsByDay[d] || [];
        const has = dayItems.length > 0;
        const isAct = view.selectedDay === d;
        cells.push(`
          <div class="cal-cell ${has ? 'has-item' : ''} ${isAct ? 'active' : ''}" data-act="select-cal-day" data-day="${d}" title="${d} ${MONTHS[targetMonth]}: ${dayItems.length} ${typeLabel}">
            <span>${d}</span>
            ${has ? (dayItems.length > 1 ? `<span class="cal-badge">${dayItems.length}</span>` : '<span class="cal-dot"></span>') : ''}
          </div>
        `);
      }

      const displayedItems = view.selectedDay ? (itemsByDay[view.selectedDay] || []) : items;

      return `
        <div class="cal-card">
          <div class="cal-top">
            <h3>${MONTHS[targetMonth]} ${targetYear} · ${typeLabel} Calendar</h3>
            ${CONFIG.isAdmin ? `
              <button type="button" class="cal-upload-btn" data-act="upload-image-prompt" data-type="${type}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> + Upload ${type === 'stories' ? 'Story' : 'Poster'}
              </button>` : ''}
          </div>
          <div class="cal-weekdays">
            ${weekdays.map(w => `<span>${w}</span>`).join('')}
          </div>
          <div class="cal-grid">
            ${cells.join('')}
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px;">
          <small style="font-size:12px;color:var(--mute);font-weight:600;">
            ${view.selectedDay ? `${MONTHS[targetMonth]} ${view.selectedDay}: ${displayedItems.length} ${typeLabel}` : `All ${typeLabel} in ${MONTHS[targetMonth]} (${displayedItems.length})`}
          </small>
          ${view.selectedDay ? '<button class="ghost" data-act="clear-cal-day" style="padding:3px 10px;font-size:11px;border-radius:99px;">Show All Month</button>' : ''}
        </div>

        ${displayedItems.length ? `
          <div class="reels">
            ${displayedItems.map((it, i) => `
              <div class="reel">
                <div class="poster ${type === 'posters' ? 'is-square' : 'is-story'}" style="--c:${RCOL[i % RCOL.length]}" data-act="view-image" data-id="${it.id}">
                  <img class="custom-cover" src="${esc(it.url || it.coverUrl)}" alt="${esc(it.title)}">
                  <span class="zari"></span>
                  <span class="no">${type === 'stories' ? 'STORY' : 'POSTER'} · ${esc(it.date.slice(5))}</span>
                  <span class="cap">${esc(it.title)}<small>${fmtDate(it.date)}${it.b ? ' · ' + esc(it.b) : ''}</small></span>
                  <span class="border"></span>
                </div>
                <div class="acts">
                  <button class="act" style="--k:var(--blue)" data-act="view-image" data-id="${it.id}"><span class="chip">${ic.view}</span>View</button>
                  <button type="button" class="act" style="--k:var(--green)" data-act="direct-dl" data-id="${it.id}"><span class="chip">${ic.dl}</span>Download</button>
                  <button class="act" style="--k:var(--amber)" data-act="share" data-id="${it.id}"><span class="chip">${ic.share}</span>Share</button>
                </div>
                ${CONFIG.isAdmin ? `
                  <div class="admin-reel-bar">
                    <button class="btn-edit" data-act="edit-reel" data-id="${it.id}">Edit</button>
                    <button class="btn-del" data-act="del" data-id="${it.id}">Delete</button>
                  </div>` : ''}
              </div>
            `).join('')}
          </div>` : `
          <div class="empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="margin:0 auto 10px;display:block;opacity:0.45;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <b>No ${typeLabel} for ${view.selectedDay ? `${MONTHS[targetMonth]} ${view.selectedDay}` : 'this month'}</b>
            <span>${CONFIG.isAdmin ? 'Tap + Upload to add festive image content.' : 'Festive campaign stories and posters will appear here.'}</span>
          </div>`
        }
      `;
    }

    function openImageModal(it) {
      if (!it) return;
      sheet(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div>
              <span style="font-size:10px;font-weight:700;color:var(--c);text-transform:uppercase;letter-spacing:0.06em;">${it.type === 'story' ? 'Instagram / WhatsApp Story (9:16)' : 'Festive Poster / Campaign'}</span>
              <h4 style="margin:3px 0 0;font-size:16px;color:var(--navy);font-weight:700;">${esc(it.title)}</h4>
              <p style="margin:2px 0 0;font-size:11px;color:var(--mute);">${fmtDate(it.date)}${it.b ? ' · ' + esc(it.b) : ''}</p>
            </div>
            <button class="ghost" data-close style="padding:6px 14px;border-radius:999px;font-size:12px;flex-shrink:0;">Close</button>
          </div>
          <div style="width:100%;max-height:65dvh;border-radius:18px;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 35px rgba(18,41,74,0.12);">
            <img src="${esc(it.url || it.coverUrl)}" alt="${esc(it.title)}" style="max-width:100%;max-height:65dvh;object-fit:contain;display:block;">
          </div>
          <div class="acts" style="width:100%;margin-top:2px;">
            <button type="button" class="act" style="--k:var(--green);cursor:pointer;" id="img-dl-btn">
              <span class="chip">${ic.dl}</span><span>Download</span>
            </button>
            <button type="button" class="act" style="--k:var(--amber);cursor:pointer;" id="img-share-btn">
              <span class="chip">${ic.share}</span><span>Share</span>
            </button>
            <button type="button" class="act" style="--k:var(--blue);cursor:pointer;" id="img-copy-btn">
              <span class="chip">${ic.copy}</span><span>Copy Link</span>
            </button>
          </div>
        </div>
      `, sc => {
        sc.querySelector('#img-dl-btn')?.addEventListener('click', () => triggerDirectDownload(it));
        sc.querySelector('#img-share-btn')?.addEventListener('click', () => openShare(it));
        sc.querySelector('#img-copy-btn')?.addEventListener('click', () => {
          navigator.clipboard.writeText(it.url || it.coverUrl).then(() => toast('Image link copied to clipboard!', 'success'));
        });
      }, true, 'image-modal-scrim');
    }

    function openCoverModal(client, type, name) {
      const coverProp = type === 'branch' ? 'branchCovers' : 'albumCovers';
      client[coverProp] = client[coverProp] || {};
      let currentCover = client[coverProp][name] || '';

      sheet(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <h3 style="margin:0;font-size:16px;color:var(--navy);font-weight:700;">Set Cover Page · ${esc(name)}</h3>
            <button class="ghost" data-close style="padding:4px 10px;font-size:12px;border-radius:999px;">Close</button>
          </div>
          <p style="font-size:12px;color:var(--mute);margin:0;">${type === 'branch' ? 'Store Branch' : 'Collection'} cover image for <b>${esc(client.name)}</b></p>

          <div style="width:100%;height:150px;border-radius:14px;background:var(--soft);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;" id="cov-prev-box">
            ${currentCover ? `<img src="${esc(currentCover)}" style="width:100%;height:100%;object-fit:cover;" id="cov-img-tag">` : '<span style="font-size:12px;color:var(--mute);">No cover image set yet</span>'}
          </div>

          <div class="field">
            <label style="font-size:11px;font-weight:700;color:var(--ink);">Option 1: Upload Cover Image (PNG, JPG, WebP)</label>
            <input type="file" id="cov-file-input" accept="image/png,image/jpeg,image/webp" style="font-size:12px;width:100%;">
            <small style="font-size:11px;color:var(--mute);display:block;margin-top:2px;">Auto-optimized for instant loading.</small>
          </div>

          <div class="field">
            <label style="font-size:11px;font-weight:700;color:var(--ink);">Option 2: Image URL or Google Drive Link</label>
            <input type="text" id="cov-url-input" value="${currentCover.startsWith('data:') ? '' : currentCover}" placeholder="https://... or Google Drive image link">
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
            ${currentCover ? '<button type="button" class="ghost" id="cov-del-btn" style="color:var(--red);border-color:#FCDAD7;">Remove Cover</button>' : '<span></span>'}
            <div style="display:flex;gap:8px;">
              <button type="button" class="ghost" data-close>Cancel</button>
              <button type="button" class="go" id="cov-save-btn">Save Cover</button>
            </div>
          </div>
        </div>
      `, sc => {
        const prevBox = sc.querySelector('#cov-prev-box');
        const fileInput = sc.querySelector('#cov-file-input');
        const urlInput = sc.querySelector('#cov-url-input');
        const saveBtn = sc.querySelector('#cov-save-btn');
        const delBtn = sc.querySelector('#cov-del-btn');

        function updatePreview(url) {
          currentCover = url;
          if (url) {
            prevBox.innerHTML = `<img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover;" id="cov-img-tag">`;
          } else {
            prevBox.innerHTML = '<span style="font-size:12px;color:var(--mute);">No cover image set yet</span>';
          }
        }

        fileInput.onchange = e => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 1200;
              let w = img.width, h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                else { w = Math.round((w * maxDim) / h); h = maxDim; }
              }
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
              updatePreview(dataUrl);
              urlInput.value = '';
            };
            img.src = reader.result;
          };
          reader.readAsDataURL(file);
        };

        urlInput.oninput = () => {
          let val = urlInput.value.trim();
          if (val) {
            const dId = driveId(val);
            if (dId) val = `https://drive.google.com/thumbnail?id=${dId}&sz=w1200`;
            updatePreview(val);
          }
        };

        if (delBtn) {
          delBtn.onclick = () => {
            delete client[coverProp][name];
            persist(`Cover removed for ${name}`);
            sc.remove();
          };
        }

        saveBtn.onclick = () => {
          if (currentCover) {
            client[coverProp][name] = currentCover;
            persist(`Cover saved for ${name}`);
            toast(`Cover page updated for ${name}!`, 'success');
          }
          sc.remove();
        };
      }, true);
    }

    function openClientImageUploadModal(initialType = 'story') {
      const c = client();
      if (!c) return;
      const m = view.month != null ? view.month : TODAY.getMonth();
      const y = view.year || TODAY.getFullYear();
      const defDay = String(view.selectedDay || 15).padStart(2, '0');
      const defDate = `${y}-${String(m + 1).padStart(2, '0')}-${defDay}`;

      sheet(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <h3 style="margin:0;font-size:16px;color:var(--navy);font-weight:700;">Upload Festive Content</h3>
            <button class="ghost" data-close style="padding:4px 10px;font-size:12px;border-radius:999px;">Close</button>
          </div>
          <p style="font-size:12px;color:var(--mute);margin:0;">Publish 9:16 Stories or Festive Posters for <b>${esc(c.name)}</b></p>

          <div style="display:flex;gap:8px;">
            <button type="button" class="ctype-btn ${initialType === 'story' ? 'active' : ''}" id="m-type-story" style="border:1px solid var(--line);">Story (9:16)</button>
            <button type="button" class="ctype-btn ${initialType === 'poster' ? 'active' : ''}" id="m-type-poster" style="border:1px solid var(--line);">Poster (Square/Feed)</button>
          </div>

          <div class="field">
            <label style="font-size:11px;font-weight:700;color:var(--ink);">Title / Caption</label>
            <input type="text" id="m-img-title" placeholder="e.g. Diwali Dhamaka Special Offer">
          </div>

          <div class="field">
            <label style="font-size:11px;font-weight:700;color:var(--ink);">Date</label>
            <input type="date" id="m-img-date" value="${defDate}">
          </div>

          ${(c.branches && c.branches.length) ? `
          <div class="field">
            <label style="font-size:11px;font-weight:700;color:var(--ink);">Branch (Optional)</label>
            <select id="m-img-branch">
              <option value="">All Branches</option>
              ${c.branches.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
            </select>
          </div>` : ''}

          <div style="width:100%;height:140px;border-radius:14px;background:var(--soft);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;" id="m-img-prev-box">
            <span style="font-size:12px;color:var(--mute);">Preview will appear here</span>
          </div>

          <div class="field">
            <label style="font-size:11px;font-weight:700;color:var(--ink);">Option 1: Upload Image (PNG, JPG, WebP)</label>
            <input type="file" id="m-img-file" accept="image/png,image/jpeg,image/webp">
          </div>

          <div class="field">
            <label style="font-size:11px;font-weight:700;color:var(--ink);">Option 2: Image URL or Google Drive Link</label>
            <input type="text" id="m-img-url" placeholder="https://... or Google Drive image link">
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
            <button type="button" class="ghost" data-close>Cancel</button>
            <button type="button" class="go" id="m-img-save-btn">Publish to Library</button>
          </div>
        </div>
      `, sc => {
        let curType = initialType;
        let imgUrl = '';
        const prevBox = sc.querySelector('#m-img-prev-box');
        const fileInp = sc.querySelector('#m-img-file');
        const urlInp = sc.querySelector('#m-img-url');
        const btnStory = sc.querySelector('#m-type-story');
        const btnPoster = sc.querySelector('#m-type-poster');

        btnStory.onclick = () => { curType = 'story'; btnStory.classList.add('active'); btnPoster.classList.remove('active'); };
        btnPoster.onclick = () => { curType = 'poster'; btnPoster.classList.add('active'); btnStory.classList.remove('active'); };

        function updatePrev(url) {
          imgUrl = url;
          if (url) prevBox.innerHTML = `<img src="${esc(url)}" style="width:100%;height:100%;object-fit:contain;">`;
          else prevBox.innerHTML = '<span style="font-size:12px;color:var(--mute);">Preview will appear here</span>';
        }

        fileInp.onchange = e => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 1200;
              let w = img.width, h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                else { w = Math.round((w * maxDim) / h); h = maxDim; }
              }
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
              updatePrev(dataUrl);
              urlInp.value = '';
            };
            img.src = reader.result;
          };
          reader.readAsDataURL(file);
        };

        urlInp.oninput = () => {
          let val = urlInp.value.trim();
          if (val) {
            const dId = driveId(val);
            if (dId) val = `https://drive.google.com/thumbnail?id=${dId}&sz=w1200`;
            updatePrev(val);
          }
        };

        sc.querySelector('#m-img-save-btn').onclick = () => {
          const title = sc.querySelector('#m-img-title').value.trim() || (curType === 'story' ? 'Festive Story' : 'Festive Poster');
          const dt = sc.querySelector('#m-img-date').value || defDate;
          const br = sc.querySelector('#m-img-branch')?.value || '';
          if (!imgUrl) {
            toast('Please select an image or enter a URL', 'amber');
            return;
          }
          const dtYear = parseInt(dt.slice(0, 4), 10);
          const dtMonth = parseInt(dt.slice(5, 7), 10) - 1;
          const newItem = {
            id: 'img_' + Date.now().toString(36),
            c: c.id,
            type: curType,
            title,
            date: dt,
            y: dtYear,
            m: dtMonth,
            b: br,
            url: imgUrl,
            coverUrl: imgUrl,
            dur: curType === 'story' ? '9:16' : '1:1',
            views: 0,
            downloads: 0,
            hidden: false
          };
          DATA.reels = DATA.reels || [];
          DATA.reels.unshift(newItem);
          persist(`${curType === 'story' ? 'Story' : 'Poster'} published!`);
          toast(`${curType === 'story' ? 'Story' : 'Poster'} added to calendar!`, 'success');
          sc.remove();
        };
      }, true);
    }

    // --------------------------------------------------------------------------
    // ANIMATION ENGINES (Confetti, Pulse, Shimmer, Rings)
    // --------------------------------------------------------------------------
    let timers = [], raf = null;
    function clearTimers() { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); }
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    function playIntro(onComplete) {
      const sp = app.querySelector('.splash') || app.querySelector('.dn-intro');
      if (!sp) return;

      const revealControls = () => {
        sp.classList.add('ready');
        const dock = document.getElementById('dn-social-dock');
        if (dock) {
          dock.classList.remove('dock-waiting');
          dock.classList.add('cinematic-in');
        }
      };

      if (reduce()) {
        revealControls();
        if (onComplete) later(onComplete, 400);
        return;
      }

      const durationSec = Math.max(2, Math.min(60, Number(DATA.settings?.introDuration) || 6));
      const durationMs = durationSec * 1000;
      let completed = false;

      const finish = () => {
        if (completed) return;
        completed = true;
        clearTimers();
        if (raf) cancelAnimationFrame(raf);
        revealControls();
        if (onComplete) onComplete();
      };

      // Click start button to open PIN modal immediately
      const startBtn = sp.querySelector('#dn-start-btn') || sp.querySelector('.btn.start');
      if (startBtn) {
        startBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          clearTimers();
          if (raf) cancelAnimationFrame(raf);
          revealControls();
          openCode(view.client ? client() : null);
        };
      }

      // Reveal Start button and animate in social media dock at 3500ms (as scribble drawing completes)
      later(revealControls, 3500);

      later(finish, durationMs);
    }

    function setupClientPinInput(c) {
      const pinsBox = app.querySelector('#c-pins');
      if (!pinsBox) return;
      const ins = [...pinsBox.querySelectorAll('input')];
      const msg = app.querySelector('#c-pin-msg');

      const check = async () => {
        const code = ins.map(i => i.value).join('');
        if (code.length < 4) return;

        let activeClient = (DATA.clients || []).find(x => x.id === c.id) || c;

        if (code !== activeClient.code && (isFetchingLiveData || !DATA.clients || DATA.clients.length === 0)) {
          if (msg) {
            msg.className = 'code-msg';
            msg.innerHTML = '<span class="spin-dot" style="display:inline-block;width:10px;height:10px;border:2px solid #2F7DF6;border-top-color:transparent;border-radius:50%;animation:v-spin 0.6s linear infinite;vertical-align:middle;margin-right:6px;"></span> Verifying access PIN...';
          }
          try {
            if (liveDataPromise) {
              await liveDataPromise;
            } else {
              await fetchLiveData(true);
            }
          } catch (_) {}
          activeClient = (DATA.clients || []).find(x => x.id === c.id) || activeClient;
        }

        if (activeClient.status === 'blocked') {
          pinsBox.classList.remove('bad');
          void pinsBox.offsetWidth;
          pinsBox.classList.add('bad');
          if (msg) {
            msg.className = 'code-msg bad';
            msg.textContent = 'Access Suspended: This client portal is blocked. Please contact Day Night Media.';
          }
          setTimeout(() => {
            ins.forEach(i => i.value = '');
            ins[0]?.focus();
          }, 600);
          return;
        }

        if (activeClient.status === 'paused') {
          pinsBox.classList.remove('bad');
          void pinsBox.offsetWidth;
          pinsBox.classList.add('bad');
          if (msg) {
            msg.className = 'code-msg bad';
            msg.textContent = 'Portal On Hold: This client portal is temporarily paused for updates.';
          }
          setTimeout(() => {
            ins.forEach(i => i.value = '');
            ins[0]?.focus();
          }, 600);
          return;
        }

        if (code === activeClient.code) {
          if (msg) {
            msg.className = 'code-msg';
            msg.style.color = 'var(--green)';
            msg.textContent = 'Welcome ' + activeClient.name;
          }
          pinsBox.classList.remove('bad');
          setClientAuthenticated(activeClient.id);
          setTimeout(() => {
            go({ screen: 'landing', client: activeClient.id });
          }, 250);
        } else {
          pinsBox.classList.remove('bad');
          void pinsBox.offsetWidth;
          pinsBox.classList.add('bad');
          if (msg) {
            msg.className = 'code-msg bad';
            msg.textContent = 'Incorrect PIN for ' + activeClient.name + '. Please try again.';
          }
          setTimeout(() => {
            ins.forEach(i => i.value = '');
            ins[0]?.focus();
          }, 400);
        }
      };

      ins.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          inp.value = inp.value.replace(/\D/g, '').slice(-1);
          if (msg) { msg.className = 'code-msg'; msg.innerHTML = '&nbsp;'; }
          if (inp.value && i < 3) ins[i + 1].focus();
          check();
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Backspace' && !inp.value && i > 0) ins[i - 1].focus();
        });
        inp.addEventListener('paste', e => {
          const raw = (e.clipboardData.getData('text') || '').trim();
          const d = raw.replace(/\D/g, '').slice(0, 4);
          if (!d) return;
          e.preventDefault();
          d.split('').forEach((ch, k) => ins[k] && (ins[k].value = ch));
          check();
        });
      });

      setTimeout(() => ins[0]?.focus(), 150);
    }

    function playAnimation(style = 'confetti', clientObj = null) {
      const c = clientObj || client();
      const sp = app.querySelector('.client-landing') || app.querySelector('.splash');
      if (!sp) return;
      if (reduce()) { sp.classList.add('ready'); return; }

      const cv = sp.querySelector('.canvas-fx');
      if (!cv) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = sp.getBoundingClientRect();
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      ctx.scale(dpr, dpr);

      const targetLogo = sp.querySelector('.client-landing-logo-wrap') || sp.querySelector('.mark-wrap') || sp.querySelector('.mark') || sp.querySelector('img');
      let ox = r.width / 2;
      let oy = r.height / 2;
      if (targetLogo) {
        const m = targetLogo.getBoundingClientRect();
        ox = m.left - r.left + m.width / 2;
        oy = m.top - r.top + m.height / 2;
      }

      const accentCol = (c && c.accent) ? c.accent : '#D4AF37';
      let t0 = null;

      // 1. FESTIVE CONFETTI BURST
      if (style === 'confetti') {
        const cols = [accentCol, '#E8457A', '#17A598', '#F2992E', '#6C5CE7', '#2F7DF6', '#1FAF64', '#E53225', '#FFD700', '#FFFFFF'];
        const ps = Array.from({ length: 140 }, () => {
          const a = Math.random() * Math.PI * 2;
          const v = 3.5 + Math.random() * 8.5;
          return {
            x: ox,
            y: oy,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 4.2,
            w: 6 + Math.random() * 7,
            h: 4 + Math.random() * 5,
            rot: Math.random() * Math.PI * 2,
            vr: (Math.random() - 0.5) * 0.28,
            c: cols[Math.floor(Math.random() * cols.length)]
          };
        });

        const frame = ts => {
          if (!sp.isConnected) return;
          t0 ??= ts;
          const t = ts - t0;
          ctx.clearRect(0, 0, r.width, r.height);
          const alpha = Math.max(0, 1 - t / 3200);

          ps.forEach(p => {
            p.vy += 0.20;
            p.vx *= 0.985;
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vr;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.c;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
          });

          if (t < 3300) {
            raf = requestAnimationFrame(frame);
          } else {
            ctx.clearRect(0, 0, r.width, r.height);
          }
        };
        raf = requestAnimationFrame(frame);
      }

      // 2. GOLDEN MANDALA PULSE
      else if (style === 'pulse') {
        const maxR = Math.max(r.width, r.height) * 0.8;
        const frame = ts => {
          if (!sp.isConnected) return;
          t0 ??= ts;
          const t = ts - t0;
          ctx.clearRect(0, 0, r.width, r.height);

          for (let i = 0; i < 4; i++) {
            const progress = ((t * 0.08 + i * 80) % maxR);
            const alpha = Math.max(0, 1 - progress / maxR) * 0.7;

            ctx.save();
            ctx.beginPath();
            ctx.arc(ox, oy, progress, 0, Math.PI * 2);
            ctx.strokeStyle = accentCol;
            ctx.lineWidth = Math.max(0.8, 3.5 * (1 - progress / maxR));
            ctx.globalAlpha = alpha;
            ctx.shadowColor = accentCol;
            ctx.shadowBlur = 10;
            ctx.stroke();

            // Symmetrical Mandala Petal Nodes
            if (progress > 30 && progress < maxR * 0.85) {
              const petals = 8;
              const angleOffset = (t * 0.001) + (i * 0.2);
              for (let p = 0; p < petals; p++) {
                const angle = angleOffset + (p * Math.PI * 2) / petals;
                const px = ox + Math.cos(angle) * progress;
                const py = oy + Math.sin(angle) * progress;
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#FFE599';
                ctx.globalAlpha = alpha * 0.9;
                ctx.fill();
              }
            }
            ctx.restore();
          }

          if (t < 3800) {
            raf = requestAnimationFrame(frame);
          }
        };
        raf = requestAnimationFrame(frame);
      }

      // 3. EDITORIAL SHIMMER (Diamond Starlight Twinkles)
      else if (style === 'shimmer') {
        const stars = Array.from({ length: 65 }, () => ({
          x: ox + (Math.random() - 0.5) * Math.min(r.width * 0.85, 360),
          y: oy + (Math.random() - 0.5) * Math.min(r.height * 0.7, 360),
          size: 2.5 + Math.random() * 5.5,
          phase: Math.random() * Math.PI * 2,
          speedY: 0.2 + Math.random() * 0.6,
          c: Math.random() > 0.4 ? accentCol : '#FFE599'
        }));

        function drawStar(cCtx, cx, cy, spikes, outerRadius, innerRadius) {
          let rot = (Math.PI / 2) * 3;
          let x = cx, y = cy;
          const step = Math.PI / spikes;
          cCtx.beginPath();
          cCtx.moveTo(cx, cy - outerRadius);
          for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            cCtx.lineTo(x, y);
            rot += step;
            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            cCtx.lineTo(x, y);
            rot += step;
          }
          cCtx.lineTo(cx, cy - outerRadius);
          cCtx.closePath();
        }

        const frame = ts => {
          if (!sp.isConnected) return;
          t0 ??= ts;
          const t = ts - t0;
          ctx.clearRect(0, 0, r.width, r.height);
          const masterFade = Math.max(0, 1 - t / 3600);

          stars.forEach(s => {
            s.y -= s.speedY;
            const shimmer = (Math.sin(t * 0.007 + s.phase) + 1) / 2;
            const alpha = shimmer * masterFade * 0.85;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = s.c;
            ctx.shadowColor = s.c;
            ctx.shadowBlur = 8;
            drawStar(ctx, s.x, s.y, 4, s.size * shimmer, s.size * 0.35 * shimmer);
            ctx.fill();
            ctx.restore();
          });

          if (t < 3600) {
            raf = requestAnimationFrame(frame);
          } else {
            ctx.clearRect(0, 0, r.width, r.height);
          }
        };
        raf = requestAnimationFrame(frame);
      }

      // 4. CONCENTRIC RINGS
      else if (style === 'rings') {
        const maxR = Math.max(r.width, r.height) * 0.85;
        const frame = ts => {
          if (!sp.isConnected) return;
          t0 ??= ts;
          const t = ts - t0;
          ctx.clearRect(0, 0, r.width, r.height);

          for (let i = 0; i < 5; i++) {
            const rad = ((t * 0.09 + i * 75) % maxR);
            const alpha = Math.max(0, 1 - rad / maxR) * 0.85;

            ctx.save();
            ctx.beginPath();
            ctx.arc(ox, oy, rad, 0, Math.PI * 2);
            ctx.strokeStyle = i % 2 === 0 ? accentCol : '#FFE599';
            ctx.lineWidth = Math.max(0.5, 3 * (1 - rad / maxR));
            ctx.globalAlpha = alpha;
            ctx.stroke();
            ctx.restore();
          }

          if (t < 3800) {
            raf = requestAnimationFrame(frame);
          }
        };
        raf = requestAnimationFrame(frame);
      }

      later(() => sp.classList.add('ready'), 1400);
    }

    function playTagline() {
      const g = app.querySelector('.genesis') || app.querySelector('.client-landing');
      if (!g) return;
      const chs = [...g.querySelectorAll('.tagline .ch')];
      if (reduce() || !chs.length) { g.classList.add('ready'); return; }
      chs.forEach(c => c.classList.add('hid'));
      g.classList.add('typing');
      let i = 0;
      const type = () => {
        if (chs[i]) chs[i++].classList.remove('hid');
        if (i < chs.length) later(type, 65);
        else later(() => { g.classList.remove('typing'); g.classList.add('ready'); }, 400);
      };
      later(type, 350);
    }

    // --------------------------------------------------------------------------
    // HOME CANVAS & DIRECT PIN SYSTEM
    // --------------------------------------------------------------------------
    function playHomeCanvas() {
      const cv = document.getElementById('home-canvas');
      if (!cv) return;
      const ctx = cv.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = cv.getBoundingClientRect();
      cv.width = (rect.width || 360) * dpr;
      cv.height = (rect.height || 600) * dpr;
      ctx.scale(dpr, dpr);

      const dots = Array.from({ length: 26 }, () => ({
        x: Math.random() * (rect.width || 360),
        y: Math.random() * (rect.height || 600),
        r: 1 + Math.random() * 2,
        vy: 0.15 + Math.random() * 0.35,
        vx: (Math.random() - 0.5) * 0.2,
        alpha: 0.15 + Math.random() * 0.3,
        color: Math.random() > 0.5 ? '#B8935A' : '#12294A'
      }));

      function tick() {
        if (!cv.isConnected) return;
        ctx.clearRect(0, 0, rect.width || 360, rect.height || 600);
        dots.forEach(d => {
          d.y -= d.vy;
          d.x += d.vx;
          if (d.y < -10) d.y = (rect.height || 600) + 10;
          if (d.x < -10) d.x = (rect.width || 360) + 10;
          if (d.x > (rect.width || 360) + 10) d.x = -10;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = d.color;
          ctx.globalAlpha = d.alpha;
          ctx.fill();
        });
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }

    function setupHomePins() {
      const pinsBox = document.getElementById('h-pins');
      if (!pinsBox) return;
      const ins = [...pinsBox.querySelectorAll('input')];
      const msg = document.getElementById('h-pin-msg');

      const check = async () => {
        const code = ins.map(i => i.value).join('');
        if (code.length < 4) return;

        let c = (DATA.clients || []).find(x => x.code === code);

        // If client not matched yet and data is still syncing in background or empty
        if (!c && (isFetchingLiveData || !DATA.clients || DATA.clients.length === 0)) {
          if (msg) {
            msg.className = 'home-pin-msg';
            msg.innerHTML = '<span class="spin-dot" style="display:inline-block;width:10px;height:10px;border:2px solid #2F7DF6;border-top-color:transparent;border-radius:50%;animation:v-spin 0.6s linear infinite;vertical-align:middle;margin-right:6px;"></span> Verifying access code...';
          }
          try {
            if (liveDataPromise) {
              await liveDataPromise;
            } else {
              await fetchLiveData(true);
            }
          } catch (_) {}
          c = (DATA.clients || []).find(x => x.code === code);
        }

        if (c) {
          if (c.status === 'blocked') {
            pinsBox.classList.remove('bad');
            void pinsBox.offsetWidth;
            pinsBox.classList.add('bad');
            if (msg) {
              msg.className = 'home-pin-msg bad';
              msg.textContent = 'Access Suspended: This client portal is blocked. Please contact Day Night Media.';
            }
            setTimeout(() => {
              ins.forEach(i => i.value = '');
              ins[0]?.focus();
            }, 600);
            return;
          }

          if (c.status === 'paused') {
            pinsBox.classList.remove('bad');
            void pinsBox.offsetWidth;
            pinsBox.classList.add('bad');
            if (msg) {
              msg.className = 'home-pin-msg bad';
              msg.textContent = 'Portal On Hold: This client portal is temporarily paused for updates.';
            }
            setTimeout(() => {
              ins.forEach(i => i.value = '');
              ins[0]?.focus();
            }, 600);
            return;
          }

          if (msg) {
            msg.className = 'home-pin-msg ok';
            msg.textContent = 'Welcome ' + c.name + ' · Redirecting...';
          }

          // DYNAMIC REDIRECTION TO CLIENT URL & CLIENT DIRECTORY
          const targetUrl = '/?client=' + encodeURIComponent(c.slug || c.id);
          try {
            history.pushState({ client: c.id }, '', targetUrl);
          } catch (_) {}
          setClientAuthenticated(c.id);
          setTimeout(() => {
            go({ screen: 'landing', client: c.id });
          }, 300);
        } else {
          pinsBox.classList.remove('bad');
          void pinsBox.offsetWidth;
          pinsBox.classList.add('bad');
          if (msg) {
            msg.className = 'home-pin-msg bad';
            msg.textContent = 'Code does not match. Please contact Day Night Media.';
          }
          setTimeout(() => {
            ins.forEach(i => i.value = '');
            ins[0]?.focus();
          }, 450);
        }
      };

      ins.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          inp.value = inp.value.replace(/\D/g, '').slice(-1);
          if (msg) { msg.className = 'home-pin-msg'; msg.innerHTML = '&nbsp;'; }
          if (inp.value && i < 3) ins[i + 1].focus();
          check();
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Backspace' && !inp.value && i > 0) ins[i - 1].focus();
        });
        inp.addEventListener('paste', e => {
          const raw = (e.clipboardData.getData('text') || '').trim();
          const d = raw.replace(/\D/g, '').slice(0, 4);
          if (!d) return;
          e.preventDefault();
          d.split('').forEach((ch, k) => ins[k] && (ins[k].value = ch));
          check();
        });
      });

      setTimeout(() => ins[0]?.focus(), 150);
    }

    // --------------------------------------------------------------------------
    // 4-DIGIT PIN AUTHENTICATION
    // --------------------------------------------------------------------------
    function openCode(preselectedClient, targetScreen = 'landing') {
      const targetClient = preselectedClient || client();
      sheet(`
        <div class="code-head">
          <span class="key">${ic.key}</span>
          <h4>${targetClient ? `Enter Code for ${esc(targetClient.name)}` : 'Enter Client Access Code'}</h4>
          <p>Your 4-digit code provided by Day Night Media</p>
        </div>
        <div class="pins" id="pins">
          ${[0,1,2,3].map(i => `<input id="pin${i}" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" aria-label="Digit ${i+1}">`).join('')}
        </div>
        <div class="code-msg" id="code-msg">&nbsp;</div>
        <button class="ghost" data-close style="margin-top:12px;">Cancel</button>`, sc => {
        const ins = [...sc.querySelectorAll('.pins input')];
        const pins = sc.querySelector('#pins');
        const msg = sc.querySelector('#code-msg');

        const check = async () => {
          const code = ins.map(i => i.value).join('');
          if (code.length < 4) return;

          let matched = targetClient ? (code === targetClient.code ? targetClient : null) : (DATA.clients || []).find(x => x.code === code);

          if (!matched && (isFetchingLiveData || !DATA.clients || DATA.clients.length === 0)) {
            if (msg) {
              msg.className = 'code-msg';
              msg.innerHTML = '<span class="spin-dot" style="display:inline-block;width:10px;height:10px;border:2px solid #2F7DF6;border-top-color:transparent;border-radius:50%;animation:v-spin 0.6s linear infinite;vertical-align:middle;margin-right:6px;"></span> Verifying access code...';
            }
            try {
              if (liveDataPromise) {
                await liveDataPromise;
              } else {
                await fetchLiveData(true);
              }
            } catch (_) {}
            const refreshedTarget = targetClient ? ((DATA.clients || []).find(x => x.id === targetClient.id) || targetClient) : null;
            matched = refreshedTarget ? (code === refreshedTarget.code ? refreshedTarget : null) : (DATA.clients || []).find(x => x.code === code);
          }

          if (matched) {
            if (matched.status === 'blocked') {
              pins.classList.remove('bad');
              void pins.offsetWidth;
              pins.classList.add('bad');
              msg.className = 'code-msg bad';
              msg.textContent = 'Access Suspended: This client portal is blocked. Please contact Day Night Media.';
              setTimeout(() => { ins.forEach(i => i.value = ''); ins[0]?.focus(); }, 600);
              return;
            }

            if (matched.status === 'paused') {
              pins.classList.remove('bad');
              void pins.offsetWidth;
              pins.classList.add('bad');
              msg.className = 'code-msg bad';
              msg.textContent = 'Portal On Hold: This client portal is temporarily paused for updates.';
              setTimeout(() => { ins.forEach(i => i.value = ''); ins[0]?.focus(); }, 600);
              return;
            }

            msg.className = 'code-msg';
            msg.textContent = 'Welcome ' + matched.name + ' · Redirecting...';
            const targetUrl = '/?client=' + encodeURIComponent(matched.slug || matched.id);
            try { history.pushState({ client: matched.id }, '', targetUrl); } catch (_) {}
            setClientAuthenticated(matched.id);
            setTimeout(() => { sc.remove(); go({ screen: targetScreen, client: matched.id }); }, 250);
          } else {
            pins.classList.remove('bad');
            void pins.offsetWidth;
            pins.classList.add('bad');
            msg.className = 'code-msg bad';
            msg.textContent = 'That code does not match. Please check with Day Night Media.';
            setTimeout(() => { ins.forEach(i => i.value = ''); ins[0].focus(); }, 400);
          }
        };

        ins.forEach((inp, i) => {
          inp.addEventListener('input', () => {
            inp.value = inp.value.replace(/\D/g, '').slice(-1);
            msg.className = 'code-msg'; msg.innerHTML = '&nbsp;';
            if (inp.value && i < 3) ins[i + 1].focus();
            check();
          });
          inp.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !inp.value && i > 0) ins[i - 1].focus();
          });
          inp.addEventListener('paste', e => {
            const raw = (e.clipboardData.getData('text') || '').trim();
            const d = raw.replace(/\D/g, '').slice(0, 4);
            if (!d) return;
            e.preventDefault();
            d.split('').forEach((ch, k) => ins[k] && (ins[k].value = ch));
            check();
          });
        });
        setTimeout(() => ins[0].focus(), 120);
      }, true);
    }

    // --------------------------------------------------------------------------
    // DIRECT DOWNLOAD HELPER (Forces native download, never opens Google Drive)
    // --------------------------------------------------------------------------
    window.triggerDirectDownloadById = function(id) {
      const r = (DATA.reels || []).find(x => x.id === id);
      if (r) triggerDirectDownload(r);
    };

    function triggerDirectDownload(r) {
      const c = client();
      if (DATA.settings?.downloadsPaused || (c && c.downloadsPaused)) {
        toast('Direct downloads are temporarily paused by administration.', 'amber');
        return;
      }
      if (!r || !r.url) {
        toast('Content layout. Download available when file is ready.', 'amber');
        return;
      }
      const isImg = r.type === 'story' || r.type === 'poster' || r.url.startsWith('data:image/') || /\.(jpe?g|png|webp|gif)$/i.test(r.url);
      const id = driveId(r.url);
      const cleanTitle = (r.title || (isImg ? 'image' : 'video')).replace(/[/\\?%*:|"<>]/g, '_').trim() || (isImg ? 'image' : 'video');
      const ext = isImg ? '.jpg' : '.mp4';
      const filename = cleanTitle.toLowerCase().endsWith(ext) ? cleanTitle : `${cleanTitle}${ext}`;

      if (CONFIG.gasUrl) {
        gasApi('trackEvent', { reelId: r.id, type: 'download' }).catch(() => {});
        r.downloads = (r.downloads || 0) + 1;
      }

      toast(isImg ? 'Downloading image...' : 'Downloading video...', 'info');

      // Direct DataURL download support
      if (r.url.startsWith('data:image/')) {
        const a = document.createElement('a');
        a.href = r.url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 1000);
        return;
      }

      const dlEndpoint = id
        ? `/api/download?id=${encodeURIComponent(id)}&name=${encodeURIComponent(filename)}`
        : `/api/download?url=${encodeURIComponent(r.url)}&name=${encodeURIComponent(filename)}`;

      // Fetch as blob and construct File with lastModified = Date.now()
      // This guarantees the file saves with today's download timestamp and exact video/image format!
      fetch(dlEndpoint)
        .then(res => {
          if (!res.ok) throw new Error('Download request failed');
          return res.blob();
        })
        .then(blob => {
          const mime = isImg ? 'image/jpeg' : 'video/mp4';
          const file = new File([blob], filename, { type: mime, lastModified: Date.now() });
          const blobUrl = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            a.remove();
            URL.revokeObjectURL(blobUrl);
          }, 3000);
          toast(isImg ? 'Image saved to downloads' : 'Video saved to downloads', 'success');
        })
        .catch(() => {
          // Direct native fallback trigger
          const a = document.createElement('a');
          a.href = dlEndpoint;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => a.remove(), 1000);
        });
    }

    // --------------------------------------------------------------------------
    // IN-APP 9:16 VIDEO PLAYER
    // --------------------------------------------------------------------------
    function openVideoModal(r, initialList) {
      const savedPageScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (!r || !r.url) {
        toast('Direct stream unavailable for this reel.', 'amber');
        return;
      }

      // Immediately disconnect feed observer and completely silence all background feed videos
      if (feedAutoplayObserver) {
        try { feedAutoplayObserver.disconnect(); } catch(_) {}
        feedAutoplayObserver = null;
      }
      document.querySelectorAll('.dn-feed-video').forEach(v => {
        try {
          v.pause();
          v.muted = true;
        } catch(_) {}
        const w = v.closest('.dn-feed-media-wrap');
        if (w) w.classList.remove('is-playing');
      });

      // Track View
      if (CONFIG.gasUrl) {
        gasApi('trackEvent', { reelId: r.id, type: 'view' }).catch(() => {});
        r.views = (r.views || 0) + 1;
      }

      const c = client() || { id: '', name: 'Client' };
      recordWatchHistory(r);

      // Active playlist
      let playlist = initialList;
      if (!playlist || !playlist.length) {
        playlist = (DATA.reels || []).filter(x => (!c || isClientMatch(x.c, c.id)) );
      }
      if (!playlist || !playlist.length) playlist = [r];

      let currentIndex = playlist.findIndex(x => x.id === r.id);
      if (currentIndex === -1) {
        playlist.unshift(r);
        currentIndex = 0;
      }

      let currentReel = playlist[currentIndex];
      let socialPlatform = 'instagram'; // 'instagram', 'youtube', 'facebook', 'clean'
      let isCommentsOpen = false;
      let isSettingsOpen = false;
      let isNavigating = false;

      function getStreamUrl(reel) {
        return window.getStreamUrl ? window.getStreamUrl(reel) : '';
      }

      sheet(`
        <div class="ig-player-wrapper" id="ig-wrapper">
          <!-- Ambient blurred backdrop -->
          <div class="ig-ambient-backdrop" id="ig-ambient" style="background-image:url('${esc(currentReel.coverUrl || '')}');"></div>

          <!-- Vertical 9:16 Instagram Reels Card -->
          <div class="ig-reels-container" id="ig-container">
            <!-- Exit Clean Master Floating Button -->
            <button type="button" class="ig-exit-clean-btn" id="ig-exit-clean-btn" style="display:none;" title="Exit Clean Master Mode">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>Exit Clean Master</span>
            </button>

            <!-- Top Bar -->
            <div class="ig-top-bar">
              <button type="button" class="ig-top-btn" id="ig-btn-back" title="Back" aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div class="ig-top-title" id="ig-top-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/></svg>
                <span>Reels</span>
              </div>
              <button type="button" class="ig-top-btn" id="ig-btn-sound" title="Toggle Sound">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" id="ig-sound-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              </button>
            </div>

            <!-- Video Player Wrap -->
            <div class="ig-video-wrap" id="ig-video-wrap">
              <video id="ig-video" class="ig-video-player" src="${getStreamUrl(currentReel)}" playsinline autoplay loop preload="auto" poster="${esc(currentReel.coverUrl || '')}"></video>
              <div class="video-loading-circle active" id="ig-loading-circle">
                <svg class="v-spinner-svg" viewBox="0 0 50 50">
                  <circle class="v-spinner-path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
                </svg>
              </div>
            </div>

            <!-- Central Play/Pause Flash -->
            <div class="ig-play-flash" id="ig-play-flash">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="#FFFFFF" id="ig-flash-icon"><polygon points="6 4 20 12 6 20 6 4"/></svg>
            </div>

            <!-- Double-Tap Heart Pop -->
            <div class="ig-heart-pop" id="ig-heart-pop">
              <svg width="90" height="90" viewBox="0 0 24 24" fill="#FF2D55"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>

            <!-- Right-Hand Action Stack -->
            <div class="ig-actions-stack" id="ig-actions-stack">
              <!-- Like Button -->
              <div class="ig-action-item" id="ig-item-like">
                <button type="button" class="ig-action-btn" id="ig-btn-like" aria-label="Like">
                  <svg width="28" height="28" viewBox="0 0 24 24" id="ig-icon-like" fill="${isLiked(currentReel.id) ? '#FF2D55' : 'none'}" stroke="${isLiked(currentReel.id) ? '#FF2D55' : '#FFFFFF'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
                <span class="ig-action-count" id="ig-count-like">${getLikesCount(currentReel)}</span>
              </div>

              <!-- Comment Button -->
              <div class="ig-action-item" id="ig-item-comment">
                <button type="button" class="ig-action-btn" id="ig-btn-comment" aria-label="Comments">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </button>
                <span class="ig-action-count" id="ig-count-comment">${(currentReel.comments || []).length}</span>
              </div>

              <!-- Share Button -->
              <div class="ig-action-item" id="ig-item-share">
                <button type="button" class="ig-action-btn" id="ig-btn-share" aria-label="Share">
                  <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
                <span class="ig-action-count">Share</span>
              </div>

              <!-- Save / Bookmark Button -->
              <div class="ig-action-item" id="ig-item-bookmark">
                <button type="button" class="ig-action-btn" id="ig-btn-bookmark" aria-label="Save">
                  <svg width="25" height="25" viewBox="0 0 24 24" id="ig-icon-bookmark" fill="${isFavorited(currentReel.id) ? '#E8A735' : 'none'}" stroke="${isFavorited(currentReel.id) ? '#E8A735' : '#FFFFFF'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
                <span class="ig-action-count">Save</span>
              </div>

              <!-- Direct Download Master MP4 Action -->
              <div class="ig-action-item" id="ig-item-dl">
                <button type="button" class="ig-action-btn" id="ig-btn-player-dl" title="Download Master MP4" aria-label="Download Master MP4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 20h16"/></svg>
                </button>
                <span class="ig-action-count">Save MP4</span>
              </div>

              <!-- Three Dots Button (Opens Settings Modal) -->
              <div class="ig-action-item">
                <button type="button" class="ig-action-btn" id="ig-btn-dots" title="Settings & Options" aria-label="Options">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><circle cx="12" cy="5" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="19" r="2.2"/></svg>
                </button>
              </div>
            </div>

            <!-- Bottom Left Info Overlay -->
            <div class="ig-meta-overlay" id="ig-meta-overlay">
              <div class="ig-profile-row" id="ig-profile-row">
                <div class="ig-avatar-ring">
                  <img src="${c.id === 'tcs' ? '/Logo/tcs-logo.png' : (c.logo || '/Logo/logo.png')}" alt="">
                </div>
                <span class="ig-handle">@${c.id || 'client'}</span>
                <span class="ig-branch-tag">${esc(currentReel.b || currentReel.album || 'General')}</span>
              </div>
              <div class="ig-caption-box" id="ig-caption">
                <b>${esc(currentReel.title)}</b>${currentReel.b ? ` · ${esc(currentReel.b)}` : (currentReel.album ? ` · ${esc(currentReel.album)}` : '')}
              </div>
            </div>

            <!-- Scrubber Bar with Time Seconds Tooltip -->
            <div class="ig-scrubber-bar" id="ig-scrubber">
              <div class="ig-scrubber-time-tooltip" id="ig-scrubber-time">0:00 / 0:30</div>
              <div class="ig-scrubber-track">
                <div class="ig-scrubber-fill" id="ig-scrubber-fill">
                  <div class="ig-scrubber-thumb-handle"></div>
                </div>
              </div>
            </div>

            <!-- Real-Time Comments Bottom Drawer with Reply -->
            <div class="ig-comments-drawer" id="ig-comments-drawer" style="display:none;">
              <div class="ig-comments-header">
                <div class="ig-drawer-pill"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <b style="font-size:14px;color:var(--navy);">Comments (<span id="ig-drawer-count">${(currentReel.comments || []).length}</span>)</b>
                  <button type="button" class="ig-drawer-close" id="ig-comments-close">&times;</button>
                </div>
              </div>
              <div class="ig-comments-list" id="ig-comments-list"></div>
              <div class="ig-reply-banner" id="ig-reply-banner">
                <span>Replying to <b id="ig-reply-to-name"></b></span>
                <button type="button" id="ig-cancel-reply" class="ig-reply-cancel">&times;</button>
              </div>
              <form class="ig-comments-input-bar" id="ig-comments-form" onsubmit="return false;">
                <img src="${c.id === 'tcs' ? '/Logo/tcs-logo.png' : (c.logo || '/Logo/logo.png')}" class="ig-inp-avatar" alt="">
                <input type="text" class="ig-drawer-inp" id="ig-drawer-inp" placeholder="Add a comment or feedback..." autocomplete="off">
                <button type="submit" class="ig-drawer-post-btn" id="ig-drawer-post-btn">Post</button>
              </form>
            </div>

            <!-- Settings Modal (When ⋯ is clicked) -->
            <div class="ig-settings-modal" id="ig-settings-modal" style="display:none;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:10px;">
                <b style="font-size:15px;color:var(--navy);display:flex;align-items:center;gap:6px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
                  Reel Settings &amp; Actions
                </b>
                <button type="button" class="ig-drawer-close" id="ig-settings-close">&times;</button>
              </div>

              <!-- Platform Preview Overlay Switcher (Dropdown & Direct Pills) -->
              <div style="margin-bottom:14px;">
                <small style="font-size:11px;font-weight:700;color:var(--mute);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Platform Preview Overlay</small>
                <select id="ig-platform-select" style="width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--soft);color:var(--navy);font-size:12.5px;font-weight:600;outline:none;cursor:pointer;">
                  <option value="instagram">Instagram Reels (Default)</option>
                  <option value="youtube">YouTube Shorts</option>
                  <option value="facebook">Facebook Reels</option>
                  <option value="clean">Clean Master (No UI)</option>
                </select>
                <div class="ig-platform-pills" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;">
                  <button type="button" class="ig-platform-pill active" data-p="instagram" style="padding:7px 4px;border-radius:8px;border:1px solid var(--line);background:var(--navy);color:#FFF;font-size:11px;font-weight:600;cursor:pointer;text-align:center;">
                    Instagram
                  </button>
                  <button type="button" class="ig-platform-pill" data-p="youtube" style="padding:7px 4px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:11px;font-weight:600;cursor:pointer;text-align:center;">
                    YouTube
                  </button>
                  <button type="button" class="ig-platform-pill" data-p="facebook" style="padding:7px 4px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:11px;font-weight:600;cursor:pointer;text-align:center;">
                    Facebook
                  </button>
                  <button type="button" class="ig-platform-pill" data-p="clean" style="padding:7px 4px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:11px;font-weight:600;cursor:pointer;text-align:center;">
                    Clean UI
                  </button>
                </div>
              </div>

              <!-- Pre-Approval Status Action -->
              <div style="margin-bottom:14px;">
                <small style="font-size:11px;font-weight:700;color:var(--mute);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Pre-Approval Status</small>
                <div style="display:flex;gap:8px;">
                  <button type="button" id="ig-set-approve" style="flex:1;padding:8px 0;border-radius:10px;border:1.2px solid #1FAF64;background:rgba(31,175,100,0.1);color:#1FAF64;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Approve
                  </button>
                  <button type="button" id="ig-set-denied" style="flex:1;padding:8px 0;border-radius:10px;border:1.2px solid #E53225;background:rgba(229,50,37,0.1);color:#E53225;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Denied
                  </button>
                </div>
              </div>

              <!-- Color Calibration & Filters (Brightness, Contrast, Saturation) -->
              <div class="ig-filter-control-box" style="margin-bottom:14px;padding:12px 14px;background:var(--soft);border-radius:12px;border:1px solid var(--line);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                  <small style="font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:6px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    Display &amp; Color Calibration
                  </small>
                  <button type="button" id="ig-filter-reset" style="background:#FFFFFF;border:1px solid var(--line);border-radius:6px;font-size:10.5px;font-weight:700;color:#0D3B2E;cursor:pointer;padding:3px 8px;transition:all 0.15s ease;">Reset</button>
                </div>

                <!-- Brightness Slider -->
                <div style="margin-bottom:9px;">
                  <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink);font-weight:600;margin-bottom:3px;">
                    <span>Brightness</span>
                    <span id="ig-val-brightness" style="font-size:11px;font-weight:700;color:#0D3B2E;">${videoFilters.brightness}%</span>
                  </div>
                  <input type="range" id="ig-range-brightness" min="50" max="150" value="${videoFilters.brightness}" step="1" style="width:100%;height:5px;accent-color:#0D3B2E;cursor:pointer;display:block;">
                </div>

                <!-- Contrast Slider -->
                <div style="margin-bottom:9px;">
                  <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink);font-weight:600;margin-bottom:3px;">
                    <span>Contrast</span>
                    <span id="ig-val-contrast" style="font-size:11px;font-weight:700;color:#0D3B2E;">${videoFilters.contrast}%</span>
                  </div>
                  <input type="range" id="ig-range-contrast" min="50" max="150" value="${videoFilters.contrast}" step="1" style="width:100%;height:5px;accent-color:#0D3B2E;cursor:pointer;display:block;">
                </div>

                <!-- Saturation Slider -->
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink);font-weight:600;margin-bottom:3px;">
                    <span>Saturation</span>
                    <span id="ig-val-saturation" style="font-size:11px;font-weight:700;color:#0D3B2E;">${videoFilters.saturation}%</span>
                  </div>
                  <input type="range" id="ig-range-saturation" min="0" max="200" value="${videoFilters.saturation}" step="1" style="width:100%;height:5px;accent-color:#0D3B2E;cursor:pointer;display:block;">
                </div>
              </div>

              <!-- Playback Speed Selection -->
              <div style="margin-bottom:14px;">
                <small style="font-size:11px;font-weight:700;color:var(--mute);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Playback Speed</small>
                <div style="display:flex;gap:6px;">
                  <button type="button" class="ig-spd-btn" data-speed="0.5" style="flex:1;padding:6px 0;border-radius:8px;border:1px solid var(--line);background:var(--soft);font-size:11px;cursor:pointer;">0.5x</button>
                  <button type="button" class="ig-spd-btn" data-speed="0.75" style="flex:1;padding:6px 0;border-radius:8px;border:1px solid var(--line);background:var(--soft);font-size:11px;cursor:pointer;">0.75x</button>
                  <button type="button" class="ig-spd-btn active" data-speed="1.0" style="flex:1;padding:6px 0;border-radius:8px;border:1px solid #0D3B2E;background:#0D3B2E;color:#FFF;font-size:11px;font-weight:700;cursor:pointer;">1.0x</button>
                  <button type="button" class="ig-spd-btn" data-speed="1.25" style="flex:1;padding:6px 0;border-radius:8px;border:1px solid var(--line);background:var(--soft);font-size:11px;cursor:pointer;">1.25x</button>
                  <button type="button" class="ig-spd-btn" data-speed="1.5" style="flex:1;padding:6px 0;border-radius:8px;border:1px solid var(--line);background:var(--soft);font-size:11px;cursor:pointer;">1.5x</button>
                  <button type="button" class="ig-spd-btn" data-speed="2.0" style="flex:1;padding:6px 0;border-radius:8px;border:1px solid var(--line);background:var(--soft);font-size:11px;cursor:pointer;">2.0x</button>
                </div>
              </div>

                            <!-- Edge-to-Edge Fill Toggle (Real Instagram UI) -->
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--soft);">
                <div>
                  <b style="font-size:12.5px;color:var(--navy);display:block;">Full Bleed (Instagram Style)</b>
                  <small style="font-size:11px;color:var(--mute);">Fill full screen with no black edges</small>
                </div>
                <input type="checkbox" id="ig-fit-toggle" checked style="accent-color:#0D3B2E;transform:scale(1.2);cursor:pointer;">
              </div>

              <!-- Loop Toggle -->
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--soft);">
                <span style="font-size:12.5px;color:var(--navy);font-weight:600;">Loop Video Continuous</span>
                <input type="checkbox" id="ig-loop-toggle" checked style="accent-color:#0D3B2E;transform:scale(1.2);cursor:pointer;">
              </div>

              <!-- Technical Specs -->
              <div style="padding:10px 0;border-bottom:1px solid var(--soft);font-size:11.5px;color:var(--mute);line-height:1.6;">
                <div><b>Resolution:</b> <span id="ig-spec-res">Loading...</span></div>
                <div><b>Duration:</b> <span id="ig-spec-dur">${esc(currentReel.dur || '--')}</span></div>
                <div><b>Branch:</b> ${esc(currentReel.b || currentReel.album || 'General')}</div>
                <div><b>Master Codec:</b> H.264 / AAC High-Bitrate Master</div>
              </div>

              <!-- Download & Copy Action Buttons -->
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
                <button type="button" class="btn-primary" id="ig-btn-download-master" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:10px;padding:10px 0;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"><path d="M12 4v11m-5-5l5 5 5-5M5 20h14"/></svg>
                  Download Master MP4
                </button>
                <button type="button" class="ghost" id="ig-btn-copy-stream" style="width:100%;border-radius:10px;padding:8px 0;font-size:12px;">
                  Copy Direct Stream Link
                </button>
              </div>

              <!-- Switch to Legacy Player (Old One) Button -->
              <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);">
                <button type="button" id="ig-btn-switch-legacy" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border-radius:10px;border:1.2px solid var(--line);background:#FFFFFF;color:var(--navy);font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 1px 4px rgba(18,41,74,0.06);transition:all 0.15s ease;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  Switch to Legacy Player
                </button>
              </div>
            </div>
          </div>

          <!-- Desktop Navigation Chevrons -->
          <div class="ig-desktop-nav">
            <button type="button" class="ig-nav-chevron" id="ig-desk-up" title="Previous Reel (Up Arrow)">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            <button type="button" class="ig-nav-chevron" id="ig-desk-down" title="Next Reel (Down Arrow)">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </div>
      `, modalSc => {
        const vid = modalSc.querySelector('#ig-video');
        const container = modalSc.querySelector('#ig-container');
        const ambient = modalSc.querySelector('#ig-ambient');
        const playFlash = modalSc.querySelector('#ig-play-flash');
        const heartPop = modalSc.querySelector('#ig-heart-pop');
        const scrubber = modalSc.querySelector('#ig-scrubber');
        const scrubberFill = modalSc.querySelector('#ig-scrubber-fill');
        const scrubberTime = modalSc.querySelector('#ig-scrubber-time');
        const loadingCircle = modalSc.querySelector('#ig-loading-circle');
        const soundBtn = modalSc.querySelector('#ig-btn-sound');
        const soundIcon = modalSc.querySelector('#ig-sound-icon');
        const replyBanner = modalSc.querySelector('#ig-reply-banner');
        const replyCancelBtn = modalSc.querySelector('#ig-cancel-reply');
        const replyToName = modalSc.querySelector('#ig-reply-to-name');
        const likeBtn = modalSc.querySelector('#ig-btn-like');
        const likeIcon = modalSc.querySelector('#ig-icon-like');
        const likeCount = modalSc.querySelector('#ig-count-like');
        const bookmarkBtn = modalSc.querySelector('#ig-btn-bookmark');
        const bookmarkIcon = modalSc.querySelector('#ig-icon-bookmark');
        const commentBtn = modalSc.querySelector('#ig-btn-comment');
        const commentsDrawer = modalSc.querySelector('#ig-comments-drawer');
        const commentsClose = modalSc.querySelector('#ig-comments-close');
        const commentsList = modalSc.querySelector('#ig-comments-list');
        const commentsInp = modalSc.querySelector('#ig-drawer-inp');
        const commentsForm = modalSc.querySelector('#ig-comments-form');
        const commentsCountSpan = modalSc.querySelector('#ig-drawer-count');
        const commentsMainCount = modalSc.querySelector('#ig-count-comment');
        const shareBtn = modalSc.querySelector('#ig-btn-share');
        const dotsBtn = modalSc.querySelector('#ig-btn-dots');
        const settingsModal = modalSc.querySelector('#ig-settings-modal');
        const settingsClose = modalSc.querySelector('#ig-settings-close');
        const backBtn = modalSc.querySelector('#ig-btn-back');
        const deskUp = modalSc.querySelector('#ig-desk-up');
        const deskDown = modalSc.querySelector('#ig-desk-down');

        // Circular Loading Spinner logic
        if (loadingCircle && vid) {
          loadingCircle.classList.add('active');
          const hideLoader = () => loadingCircle.classList.remove('active');
          const showLoader = () => loadingCircle.classList.add('active');
          vid.addEventListener('loadstart', showLoader);
          vid.addEventListener('waiting', showLoader);
          vid.addEventListener('seeking', showLoader);
          vid.addEventListener('canplay', hideLoader);
          vid.addEventListener('playing', hideLoader);
          vid.addEventListener('seeked', hideLoader);
        }

        // Dynamically populate real video resolution
        if (vid) {
          vid.addEventListener('loadedmetadata', () => {
            const resEl = modalSc.querySelector('#ig-spec-res');
            if (resEl && vid.videoWidth && vid.videoHeight) {
              resEl.textContent = `${vid.videoWidth} × ${vid.videoHeight} HD`;
            }
          });
          let streamRetryAttempted = false;
          vid.addEventListener('error', () => {
            const id = currentReel.fileId || driveId(currentReel.url);
            if (id && !streamRetryAttempted) {
              streamRetryAttempted = true;
              console.warn('Retrying video stream with fresh token and cache-bypass...');
              vid.src = `/api/video?id=${encodeURIComponent(id)}&t=${Date.now()}`;
              vid.load();
              vid.play().catch(e => console.log('Autoplay retry:', e));
            }
          });
        }

        // Platform Switcher Handler with Full Visual Fidelity & Clean Master Exit
        function applyPlatformOverlay(platform) {
          socialPlatform = platform;
          const container = modalSc.querySelector('.ig-modal-container');
          if (container) container.setAttribute('data-platform', platform);

          const topTitle = modalSc.querySelector('#ig-top-title');
          const actionsStack = modalSc.querySelector('#ig-actions-stack');
          const metaOverlay = modalSc.querySelector('#ig-meta-overlay');
          const profileRow = modalSc.querySelector('#ig-profile-row');
          const scrubber = modalSc.querySelector('#ig-scrubber');
          const exitCleanBtn = modalSc.querySelector('#ig-exit-clean-btn');
          const likeBtn = modalSc.querySelector('#ig-btn-like');
          const likeIcon = modalSc.querySelector('#ig-icon-like');

          // Sync select dropdown & pill buttons
          const pSelect = modalSc.querySelector('#ig-platform-select');
          if (pSelect && pSelect.value !== platform) pSelect.value = platform;
          modalSc.querySelectorAll('.ig-platform-pill').forEach(btn => {
            if (btn.dataset.p === platform) {
              btn.classList.add('active');
              btn.style.background = 'var(--navy)';
              btn.style.color = '#FFF';
            } else {
              btn.classList.remove('active');
              btn.style.background = 'var(--card)';
              btn.style.color = 'var(--ink)';
            }
          });

          if (platform === 'clean') {
            if (topTitle) topTitle.innerHTML = '<span style="color:#FFF;font-weight:700;">Clean Master</span>';
            if (actionsStack) actionsStack.style.display = 'none';
            if (metaOverlay) metaOverlay.style.display = 'none';
            if (scrubber) scrubber.style.display = 'none';
            if (exitCleanBtn) exitCleanBtn.style.display = 'flex';
          } else {
            if (actionsStack) actionsStack.style.display = 'flex';
            if (metaOverlay) metaOverlay.style.display = 'flex';
            if (scrubber) scrubber.style.display = 'block';
            if (exitCleanBtn) exitCleanBtn.style.display = 'none';

            if (platform === 'youtube') {
              if (topTitle) topTitle.innerHTML = '<div style="display:flex;align-items:center;gap:6px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="#FF0000"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg><span style="color:#FFF;font-size:15px;letter-spacing:-0.2px;font-weight:700;">Shorts</span></div>';
              if (profileRow) {
                profileRow.innerHTML = `
                  <div class="ig-avatar-ring" style="background:transparent;border:2px solid #FFF;"><img src="${c.id === 'tcs' ? '/Logo/tcs-logo.png' : (c.logo || '/Logo/logo.png')}" alt=""></div>
                  <span class="ig-handle" style="font-weight:700;font-size:14px;">@${(c.name || 'chennaisilks').toLowerCase().replace(/\s+/g, '')}</span>
                  <button type="button" class="ig-sub-btn" style="background:#FF0000;color:#FFF;border:none;border-radius:99px;padding:4px 12px;font-size:11px;font-weight:700;margin-left:8px;cursor:pointer;">Subscribe</button>
                `;
              }
              if (likeIcon) {
                likeIcon.outerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" id="ig-icon-like" fill="${isLiked(currentReel.id) ? '#FFFFFF' : 'none'}" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
              }
            } else if (platform === 'facebook') {
              if (topTitle) topTitle.innerHTML = '<div style="display:flex;align-items:center;gap:6px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg><span style="color:#FFF;font-size:15px;font-weight:700;">Reels</span></div>';
              if (profileRow) {
                profileRow.innerHTML = `
                  <div class="ig-avatar-ring" style="background:#1877F2;padding:2px;"><img src="${c.id === 'tcs' ? '/Logo/tcs-logo.png' : (c.logo || '/Logo/logo.png')}" alt=""></div>
                  <span class="ig-handle" style="font-weight:700;font-size:13.5px;">${esc(c.name || 'The Chennai Silks')}</span>
                  <button type="button" class="ig-fol-btn" style="background:#1877F2;color:#FFF;border:none;border-radius:6px;padding:4px 12px;font-size:11px;font-weight:700;margin-left:8px;cursor:pointer;">Follow</button>
                `;
              }
              if (likeIcon) {
                likeIcon.outerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" id="ig-icon-like" fill="${isLiked(currentReel.id) ? '#1877F2' : 'none'}" stroke="${isLiked(currentReel.id) ? '#1877F2' : '#FFFFFF'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
              }
            } else {
              // Instagram Default
              if (topTitle) topTitle.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/></svg><span>Reels</span>';
              if (profileRow) {
                profileRow.innerHTML = `
                  <div class="ig-avatar-ring"><img src="${c.id === 'tcs' ? '/Logo/tcs-logo.png' : (c.logo || '/Logo/logo.png')}" alt=""></div>
                  <span class="ig-handle">@${c.id || 'thechennaisilks'}</span>
                  <span class="ig-verified-badge" title="Verified Creator"><svg width="14" height="14" viewBox="0 0 24 24" fill="#20D5EC"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></span>
                  <span class="ig-branch-tag">${esc(currentReel.b || currentReel.album || (c ? c.name : ''))}</span>
                `;
              }
              if (likeIcon) {
                likeIcon.outerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" id="ig-icon-like" fill="${isLiked(currentReel.id) ? '#FF2D55' : 'none'}" stroke="${isLiked(currentReel.id) ? '#FF2D55' : '#FFFFFF'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
              }
            }
          }
        }

        modalSc.querySelector('#ig-platform-select')?.addEventListener('change', e => {
          applyPlatformOverlay(e.target.value);
        });

        modalSc.querySelectorAll('.ig-platform-pill').forEach(btn => {
          btn.addEventListener('click', () => {
            applyPlatformOverlay(btn.dataset.p);
          });
        });

        // Wire Exit Clean Master Button
        modalSc.querySelector('#ig-exit-clean-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          applyPlatformOverlay('instagram');
        });

        // Wire Direct Download Button in Actions Stack
        modalSc.querySelector('#ig-btn-player-dl')?.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerDirectDownload(currentReel);
        });

        // Switch to Legacy Player (Old One)
        modalSc.querySelector('#ig-btn-switch-legacy')?.addEventListener('click', () => {
          vid.pause();
          vid.src = '';
          modalSc.remove();
          try { localStorage.setItem('dn_player_mode', 'legacy'); } catch(_) {}
          openClassicPlayer(currentReel, playlist);
        });

        // Render Comments in Drawer with Threaded Replies
        let activeReplyParent = null;

        function renderCommentsList() {
          const list = currentReel.comments || [];
          commentsCountSpan.textContent = list.length;
          commentsMainCount.textContent = list.length;
          if (!list.length) {
            commentsList.innerHTML = '<div style="text-align:center;padding:30px 10px;color:var(--mute);font-size:12px;">No comments yet.<br>Be the first to share feedback on this reel!</div>';
            return;
          }

          const topLevel = list.filter(item => !item.parentId);
          const replies = list.filter(item => !!item.parentId);

          commentsList.innerHTML = topLevel.map(item => {
            const itemReplies = replies.filter(rep => rep.parentId === item.id);
            return `
              <div class="ig-comment-item" data-id="${item.id}">
                <div class="ig-comment-avatar">
                  <img src="${item.authorRole === 'admin' ? '/Logo/logo.png' : (c.id === 'tcs' ? '/Logo/tcs-logo.png' : (c.logo || '/Logo/logo.png'))}" alt="">
                </div>
                <div class="ig-comment-body">
                  <div class="ig-comment-meta">
                    <span class="ig-comment-author">${esc(item.author)}</span>
                    <span class="ig-comment-tag">${item.authorRole === 'admin' ? 'Admin' : 'Client'}</span>
                    <span class="ig-comment-time">${item.dateStr || ''}</span>
                  </div>
                  <div class="ig-comment-text">${esc(item.text)}</div>
                  <div class="ig-comment-actions">
                    <button type="button" class="ig-reply-trigger" data-parent-id="${item.id}" data-author="${esc(item.author)}">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                      Reply
                    </button>
                  </div>

                  ${itemReplies.length ? `
                    <div class="ig-replies-thread">
                      ${itemReplies.map(rep => `
                        <div class="ig-reply-item">
                          <div class="ig-reply-avatar">
                            <img src="${rep.authorRole === 'admin' ? '/Logo/logo.png' : (c.id === 'tcs' ? '/Logo/tcs-logo.png' : (c.logo || '/Logo/logo.png'))}" alt="">
                          </div>
                          <div class="ig-comment-body">
                            <div class="ig-comment-meta">
                              <span class="ig-comment-author">${esc(rep.author)}</span>
                              <span class="ig-comment-tag">${rep.authorRole === 'admin' ? 'Admin' : 'Client'}</span>
                              <span class="ig-comment-time">${rep.dateStr || ''}</span>
                            </div>
                            <div class="ig-comment-text">${esc(rep.text)}</div>
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('');

          // Wire up Reply buttons
          commentsList.querySelectorAll('.ig-reply-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
              const pId = btn.dataset.parentId;
              const pAuthor = btn.dataset.author;
              activeReplyParent = { id: pId, author: pAuthor };
              if (replyBanner && replyToName) {
                replyToName.textContent = '@' + pAuthor;
                replyBanner.style.display = 'flex';
              }
              commentsInp.placeholder = `Reply to ${pAuthor}...`;
              commentsInp.focus();
            });
          });

          commentsList.scrollTop = commentsList.scrollHeight;
        }

        if (replyCancelBtn) {
          replyCancelBtn.addEventListener('click', () => {
            activeReplyParent = null;
            if (replyBanner) replyBanner.style.display = 'none';
            commentsInp.placeholder = 'Add a comment or feedback...';
          });
        }

        // Flash Play / Pause
        function triggerFlash(isPaused) {
          playFlash.innerHTML = isPaused 
            ? '<svg width="34" height="34" viewBox="0 0 24 24" fill="#FFFFFF"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
            : '<svg width="34" height="34" viewBox="0 0 24 24" fill="#FFFFFF"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
          playFlash.classList.add('active');
          setTimeout(() => playFlash.classList.remove('active'), 350);
        }

        // Double-Tap Heart Pop
        function triggerHeartPop() {
          heartPop.classList.add('pop');
          setTimeout(() => heartPop.classList.remove('pop'), 650);
          if (!isLiked(currentReel.id)) {
            toggleLike(currentReel.id);
            updateLikeButton();
          }
        }

        function updateLikeButton() {
          const liked = isLiked(currentReel.id);
          likeIcon.setAttribute('fill', liked ? '#FF2D55' : 'none');
          likeIcon.setAttribute('stroke', liked ? '#FF2D55' : '#FFFFFF');
          likeCount.textContent = getLikesCount(currentReel);
        }

        function updateBookmarkButton() {
          const fav = isFavorited(currentReel.id);
          bookmarkIcon.setAttribute('fill', fav ? '#E8A735' : 'none');
          bookmarkIcon.setAttribute('stroke', fav ? '#E8A735' : '#FFFFFF');
        }

        // Navigate between reels vertically
        function navigateToReel(newIdx, direction) {
          if (isNavigating || newIdx === currentIndex) return;
          if (newIdx < 0) {
            toast('First reel in section', 'info');
            return;
          }
          if (newIdx >= playlist.length) {
            toast('Reached end of playlist', 'info');
            return;
          }
          isNavigating = true;

          try {
            const translateY = direction === 'next' ? '-80px' : '80px';
            container.style.transition = 'transform 0.22s ease-in, opacity 0.22s ease-in';
            container.style.transform = `translateY(${translateY})`;
            container.style.opacity = '0.3';

            setTimeout(() => {
              try {
                currentIndex = newIdx;
                currentReel = playlist[currentIndex];
                recordWatchHistory(currentReel);

                vid.src = getStreamUrl(currentReel);
                vid.poster = currentReel.coverUrl || '';
                if (ambient) ambient.style.backgroundImage = `url('${esc(currentReel.coverUrl || '')}')`;

                const capEl = modalSc.querySelector('#ig-caption');
                if (capEl) capEl.innerHTML = `<b>${esc(currentReel.title)}</b> · #${esc((c ? c.name : 'reels').toLowerCase().replace(/\s+/g, ''))} #reels`;

                const brEl = modalSc.querySelector('.ig-branch-tag');
                if (brEl) brEl.textContent = esc(currentReel.b || currentReel.album || (c ? c.name : ''));

                const durEl = modalSc.querySelector('#ig-spec-dur');
                if (durEl) durEl.textContent = esc(currentReel.dur || '--');

                updateLikeButton();
                updateBookmarkButton();
                renderCommentsList();
                applyPlatformOverlay(socialPlatform);
                applyVideoFilters(vid);

                if (commentsDrawer) commentsDrawer.style.display = 'none';
                if (settingsModal) settingsModal.style.display = 'none';
                isCommentsOpen = false;
                isSettingsOpen = false;

                const enterY = direction === 'next' ? '80px' : '-80px';
                container.style.transition = 'none';
                container.style.transform = `translateY(${enterY})`;
                container.offsetHeight; // force reflow

                container.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.28s ease';
                container.style.transform = 'translateY(0)';
                container.style.opacity = '1';

                vid.play().catch(() => {});
              } catch (err) {
                console.error('Error in navigateToReel update:', err);
              } finally {
                setTimeout(() => { isNavigating = false; }, 260);
              }
            }, 200);
          } catch (err) {
            console.error('Error initiating navigateToReel:', err);
            isNavigating = false;
          }
        }

        // Video Progress Scrubber & Interactive Drag Seeking with Live Seconds
        let isScrubbing = false;
        const centerPlay = modalSc.querySelector('#ig-center-play');

        function fmtSec(sec) {
          if (isNaN(sec) || sec < 0) sec = 0;
          const m = Math.floor(sec / 60);
          const s = Math.floor(sec % 60);
          return `${m}:${s < 10 ? '0' : ''}${s}`;
        }

        function updateScrubberUi(currentTime, duration) {
          if (!duration) return;
          const pct = Math.max(0, Math.min(100, (currentTime / duration) * 100));
          scrubberFill.style.width = pct + '%';
          if (scrubberTime) {
            scrubberTime.textContent = `${fmtSec(currentTime)} / ${fmtSec(duration)}`;
            scrubberTime.style.left = `${pct}%`;
          }
        }

        vid.addEventListener('timeupdate', () => {
          if (!isScrubbing && vid.duration) {
            updateScrubberUi(vid.currentTime, vid.duration);
          }
        });

        vid.addEventListener('play', () => {
          if (centerPlay) centerPlay.style.display = 'none';
        });

        vid.addEventListener('pause', () => {
          if (centerPlay) centerPlay.style.display = 'grid';
        });

        function seekFromPointer(clientX) {
          if (!vid.duration) return;
          const rect = scrubber.getBoundingClientRect();
          const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          const targetTime = pos * vid.duration;
          vid.currentTime = targetTime;
          updateScrubberUi(targetTime, vid.duration);
        }

        scrubber.addEventListener('pointermove', e => {
          if (!vid.duration) return;
          const rect = scrubber.getBoundingClientRect();
          const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const hoverTime = pos * vid.duration;
          if (scrubberTime) {
            scrubberTime.textContent = `${fmtSec(hoverTime)} / ${fmtSec(vid.duration)}`;
            scrubberTime.style.left = `${pos * 100}%`;
          }
        });

        scrubber.addEventListener('pointerdown', e => {
          e.stopPropagation();
          isScrubbing = true;
          scrubber.classList.add('is-scrubbing');
          seekFromPointer(e.clientX);
          const onPointerMove = moveEvt => {
            if (isScrubbing) seekFromPointer(moveEvt.clientX);
          };
          const onPointerUp = () => {
            isScrubbing = false;
            scrubber.classList.remove('is-scrubbing');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
          };
          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
        });

        // Instant synchronous play / resume on center button
        if (centerPlay) {
          centerPlay.addEventListener('click', e => {
            e.stopPropagation();
            togglePlayResume();
          });
        }

        // Direct Synchronous Resume/Pause (Fixes browser autoplay gesture rejection)
        function togglePlayResume() {
          if (vid.paused) {
            const p = vid.play();
            if (p && typeof p.catch === 'function') {
              p.catch(err => {
                console.warn('Autoplay unmuted blocked, falling back to muted play:', err);
                vid.muted = true;
                vid.play().catch(() => {});
              });
            }
            triggerFlash(false);
            if (centerPlay) centerPlay.style.display = 'none';
          } else {
            vid.pause();
            triggerFlash(true);
            if (centerPlay) centerPlay.style.display = 'grid';
          }
        }

        // Tap on Video Area
        let lastTap = 0;
        modalSc.querySelector('#ig-video-wrap').addEventListener('click', () => {
          if (isCommentsOpen || isSettingsOpen) {
            commentsDrawer.style.display = 'none';
            settingsModal.style.display = 'none';
            isCommentsOpen = false;
            isSettingsOpen = false;
            return;
          }

          if (vid.paused) {
            togglePlayResume();
            lastTap = Date.now();
            return;
          }

          const now = Date.now();
          if (now - lastTap < 260) {
            triggerHeartPop();
          } else {
            togglePlayResume();
          }
          lastTap = now;
        });

        // Like Button
        likeBtn.addEventListener('click', () => {
          toggleLike(currentReel.id);
          updateLikeButton();
          likeBtn.style.transform = 'scale(1.3)';
          setTimeout(() => likeBtn.style.transform = 'scale(1)', 180);
        });

        // Comment Button: Open Drawer
        commentBtn.addEventListener('click', () => {
          isCommentsOpen = true;
          renderCommentsList();
          commentsDrawer.style.display = 'flex';
          setTimeout(() => commentsInp.focus(), 250);
        });

        commentsClose.addEventListener('click', () => {
          commentsDrawer.style.display = 'none';
          isCommentsOpen = false;
        });

        // Submit Comment
        function handleCommentSubmit() {
          const text = commentsInp.value.trim();
          if (!text) return;
          const parentId = activeReplyParent ? activeReplyParent.id : null;
          submitReelComment(currentReel.id, text, 'suggestion', parentId);
          commentsInp.value = '';
          activeReplyParent = null;
          if (replyBanner) replyBanner.style.display = 'none';
          commentsInp.placeholder = 'Add a comment or feedback...';
          renderCommentsList();
        }
        commentsForm.addEventListener('submit', handleCommentSubmit);
        modalSc.querySelector('#ig-drawer-post-btn').addEventListener('click', handleCommentSubmit);

        // Share Button
        shareBtn.addEventListener('click', () => shareVideo(currentReel));

        // Save / Bookmark Button
        bookmarkBtn.addEventListener('click', () => {
          toggleFavorite(currentReel.id);
          updateBookmarkButton();
          toast(isFavorited(currentReel.id) ? 'Saved to Favorites in Profile' : 'Removed from Favorites', 'info');
        });

        // Three Dots Button -> Open Settings Modal
        dotsBtn.addEventListener('click', () => {
          isSettingsOpen = true;
          settingsModal.style.display = 'block';
        });

        settingsClose.addEventListener('click', () => {
          settingsModal.style.display = 'none';
          isSettingsOpen = false;
        });

        // Settings Modal Actions (With User Confirmation)
        modalSc.querySelector('#ig-set-approve')?.addEventListener('click', () => {
          confirmModal('Approve Reel', `Are you sure you want to approve "${currentReel.title}"? Once approved, it will be published to the client Reels gallery.`, () => {
            setReelApprovalStatus(currentReel.id, 'approved');
            settingsModal.style.display = 'none';
            isSettingsOpen = false;
          }, 'Approve Reel', false);
        });

        modalSc.querySelector('#ig-set-denied')?.addEventListener('click', () => {
          confirmModal('Reject / Request Edits', `Are you sure you want to reject "${currentReel.title}" and request revisions?`, () => {
            setReelApprovalStatus(currentReel.id, 'denied');
            settingsModal.style.display = 'none';
            isSettingsOpen = false;
          }, 'Reject Reel', true);
        });

        // Wire Color Calibration (Brightness, Contrast, Saturation) in Instagram Player
        const igRangeB = modalSc.querySelector('#ig-range-brightness');
        const igRangeC = modalSc.querySelector('#ig-range-contrast');
        const igRangeS = modalSc.querySelector('#ig-range-saturation');
        const igValB = modalSc.querySelector('#ig-val-brightness');
        const igValC = modalSc.querySelector('#ig-val-contrast');
        const igValS = modalSc.querySelector('#ig-val-saturation');
        const igResetBtn = modalSc.querySelector('#ig-filter-reset');

        function updateIgFilters() {
          if (igRangeB) igRangeB.value = videoFilters.brightness;
          if (igRangeC) igRangeC.value = videoFilters.contrast;
          if (igRangeS) igRangeS.value = videoFilters.saturation;
          if (igValB) igValB.textContent = videoFilters.brightness + '%';
          if (igValC) igValC.textContent = videoFilters.contrast + '%';
          if (igValS) igValS.textContent = videoFilters.saturation + '%';
          applyVideoFilters(vid);
          try { localStorage.setItem('dn_video_filters', JSON.stringify(videoFilters)); } catch(_) {}
        }

        // Apply filters to initial video
        applyVideoFilters(vid);

        igRangeB?.addEventListener('input', e => {
          videoFilters.brightness = parseInt(e.target.value, 10);
          updateIgFilters();
        });
        igRangeC?.addEventListener('input', e => {
          videoFilters.contrast = parseInt(e.target.value, 10);
          updateIgFilters();
        });
        igRangeS?.addEventListener('input', e => {
          videoFilters.saturation = parseInt(e.target.value, 10);
          updateIgFilters();
        });
        igResetBtn?.addEventListener('click', () => {
          videoFilters.brightness = 100;
          videoFilters.contrast = 100;
          videoFilters.saturation = 100;
          updateIgFilters();
          toast('Video color calibration reset to default', 'info');
        });

        modalSc.querySelectorAll('.ig-spd-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            modalSc.querySelectorAll('.ig-spd-btn').forEach(b => {
              b.classList.remove('active');
              b.style.background = 'var(--soft)';
              b.style.color = 'var(--ink)';
            });
            btn.classList.add('active');
            btn.style.background = '#0D3B2E';
            btn.style.color = '#FFF';
            vid.playbackRate = parseFloat(btn.dataset.speed);
          });
        });

        modalSc.querySelector('#ig-loop-toggle').addEventListener('change', e => {
          vid.loop = e.target.checked;
        });

        modalSc.querySelector('#ig-btn-download-master').addEventListener('click', () => {
          triggerDirectDownload(currentReel);
        });

        modalSc.querySelector('#ig-btn-copy-stream').addEventListener('click', () => {
          const directUrl = getStreamUrl(currentReel);
          navigator.clipboard.writeText(directUrl).then(() => {
            toast('Direct Master Stream URL copied', 'success');
          }).catch(() => {
            toast('URL: ' + directUrl, 'info');
          });
        });

        // Sound Toggle
        soundBtn.addEventListener('click', () => {
          vid.muted = !vid.muted;
          modalSc.querySelector('#ig-sound-icon').innerHTML = vid.muted
            ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
            : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
          toast(vid.muted ? 'Muted' : 'Sound On', 'info');
        });

        // Profile Row Actions (Subscribe / Follow)
        modalSc.querySelector('#ig-profile-row')?.addEventListener('click', e => {
          const subBtn = e.target.closest('.ig-sub-btn');
          if (subBtn) {
            e.stopPropagation();
            const isSubbed = subBtn.textContent === 'Subscribed';
            subBtn.textContent = isSubbed ? 'Subscribe' : 'Subscribed';
            subBtn.style.background = isSubbed ? '#FF0000' : '#444';
            toast(isSubbed ? 'Unsubscribed' : 'Subscribed to @' + (c.id || 'thechennaisilks'), 'success');
            return;
          }
          const folBtn = e.target.closest('.ig-fol-btn');
          if (folBtn) {
            e.stopPropagation();
            const isFollowing = folBtn.textContent === 'Following';
            folBtn.textContent = isFollowing ? 'Follow' : 'Following';
            folBtn.style.background = isFollowing ? '#1877F2' : '#444';
            toast(isFollowing ? 'Unfollowed' : 'Following @' + (c.id || 'thechennaisilks'), 'success');
            return;
          }
        });

        // Close Modal Cleanly (Guarded against re-entrancy and accidental logout)
        let isReelPlayerClosed = false;
        function closeReelsPlayer() {
          if (isReelPlayerClosed) return;
          isReelPlayerClosed = true;
          try {
            vid.pause();
            vid.muted = true;
            vid.removeAttribute('src');
            vid.load();
          } catch(_) {}
          modalSc.querySelectorAll('video, audio, iframe').forEach(m => {
            try {
              m.pause();
              m.muted = true;
              m.removeAttribute('src');
              m.load();
            } catch(_) {}
          });
          window.removeEventListener('keydown', handleKey);
          modalSc.remove();
          document.body.classList.remove('has-modal');
          document.documentElement.classList.remove('has-modal');
          const bNav = document.querySelector('.client-bottom-nav');
          if (bNav && view.client && view.screen !== 'splash' && view.screen !== 'client-pin') {
            bNav.style.display = '';
          }
          window.scrollTo({ top: savedPageScrollY, behavior: 'instant' });
          requestAnimationFrame(() => {
            window.scrollTo({ top: savedPageScrollY, behavior: 'instant' });
            if (view.screen === 'genesis') {
              try { initFeedAutoplay(); } catch(_) {}
            }
          });
        }
        if (backBtn) {
          backBtn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            closeReelsPlayer();
          });
        }
        modalSc.querySelectorAll('[data-close]').forEach(b => {
          b.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            closeReelsPlayer();
          });
        });
        modalSc.addEventListener('click', e => {
          if (e.target.closest('[data-close]')) {
            e.preventDefault();
            e.stopPropagation();
            closeReelsPlayer();
          }
        });

        // Vertical Scrolling = Next Reels
        let wheelCooldown = false;
        modalSc.addEventListener('wheel', e => {
          if (isCommentsOpen && commentsList.contains(e.target)) return;
          if (wheelCooldown) return;
          if (e.deltaY > 25) {
            wheelCooldown = true;
            navigateToReel(currentIndex + 1, 'next');
            setTimeout(() => wheelCooldown = false, 360);
          } else if (e.deltaY < -25) {
            wheelCooldown = true;
            navigateToReel(currentIndex - 1, 'prev');
            setTimeout(() => wheelCooldown = false, 360);
          }
        }, { passive: true });

        // Touch Swipe (Next / Prev Reels)
        let touchStartX = 0;
        let touchStartY = 0;
        modalSc.addEventListener('touchstart', e => {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }, { passive: true });

        modalSc.addEventListener('touchend', e => {
          if (isCommentsOpen || isSettingsOpen) return;
          const touchEndX = e.changedTouches[0].clientX;
          const touchEndY = e.changedTouches[0].clientY;
          const diffY = touchStartY - touchEndY;
          const diffX = touchStartX - touchEndX;
          if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 30) {
            if (diffY > 0) {
              navigateToReel(currentIndex + 1, 'next');
            } else {
              navigateToReel(currentIndex - 1, 'prev');
            }
          }
        }, { passive: true });

        // Keyboard Keys
        function handleKey(e) {
          if (!modalSc.isConnected) {
            window.removeEventListener('keydown', handleKey);
            return;
          }
          if (e.key === 'ArrowDown' || e.key === 'PageDown') {
            e.preventDefault();
            navigateToReel(currentIndex + 1, 'next');
          } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
            e.preventDefault();
            navigateToReel(currentIndex - 1, 'prev');
          } else if (e.key === 'Escape') {
            if (isCommentsOpen) {
              commentsDrawer.style.display = 'none';
              isCommentsOpen = false;
            } else if (isSettingsOpen) {
              settingsModal.style.display = 'none';
              isSettingsOpen = false;
            } else {
              closeReelsPlayer();
            }
          } else if (e.key === ' ') {
            if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
            e.preventDefault();
            if (vid.paused) { vid.play().catch(()=>{}); triggerFlash(false); }
            else { vid.pause(); triggerFlash(true); }
          }
        }
        window.addEventListener('keydown', handleKey);

        deskUp?.addEventListener('click', () => navigateToReel(currentIndex - 1, 'prev'));
        deskDown?.addEventListener('click', () => navigateToReel(currentIndex + 1, 'next'));

        // Fast Start with Unmuted Sound by Default (Issues #1 and #2)
        vid.muted = false;
        function attemptPlay() {
          vid.muted = false;
          const p = vid.play();
          if (p && typeof p.catch === 'function') {
            p.catch(err => {
              console.warn('Autoplay unmuted blocked by browser policy, muting for immediate start:', err);
              vid.muted = true;
              if (soundIcon) {
                soundIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
              }
              vid.play().catch(e => console.error('Play retry error:', e));
            });
          }
        }
        attemptPlay();

        // Any user interaction safely restores unmuted sound if browser initially blocked it
        const unmuteOnGesture = () => {
          if (vid.muted) {
            vid.muted = false;
            if (soundIcon) {
              soundIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
            }
          }
        };
        modalSc.addEventListener('pointerdown', unmuteOnGesture, { once: true });
      }, true, 'video-modal-scrim');
    }

    // --------------------------------------------------------------------------
    // CLASSIC / LEGACY VIDEO PLAYER (Available via switcher in Reels Settings)
    // --------------------------------------------------------------------------
    function openClassicPlayer(r, initialList) {
      if (!r || !r.url) {
        toast('Direct stream unavailable for this reel.', 'amber');
        return;
      }

      // Immediately disconnect feed observer and completely silence all background feed videos
      if (feedAutoplayObserver) {
        try { feedAutoplayObserver.disconnect(); } catch(_) {}
        feedAutoplayObserver = null;
      }
      document.querySelectorAll('.dn-feed-video').forEach(v => {
        try {
          v.pause();
          v.muted = true;
        } catch(_) {}
        const w = v.closest('.dn-feed-media-wrap');
        if (w) w.classList.remove('is-playing');
      });

      const c = client() || { id: '', name: 'Client' };
      recordWatchHistory(r);

      let activeList = initialList;
      if (!activeList || !activeList.length) {
        activeList = (DATA.reels || []).filter(x => (!c || isClientMatch(x.c, c.id)) );
      }
      if (!activeList || !activeList.length) activeList = [r];

      let curIdx = activeList.findIndex(x => x.id === r.id);
      if (curIdx === -1) curIdx = 0;
      let currentReel = activeList[curIdx] || r;

      function getStream(reel) {
        return getStreamUrl(reel);
      }

      const sc = sheet(`
        <div class="video-modal-wrap">
          <div class="v-modal-header" style="width:100%;max-width:480px;background:#FFFFFF;border-bottom:1px solid var(--line);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;">
            <div style="flex:1;min-width:0;padding-right:10px;">
              <h4 id="v-title" style="margin:0;font-size:14px;color:var(--navy);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(currentReel.title)}</h4>
              <p id="v-subtitle" style="margin:2px 0 0;font-size:11px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fmtDate(currentReel.date)}${currentReel.b ? ` · ${esc(currentReel.b)}` : (currentReel.album ? ` · ${esc(currentReel.album)}` : '')}</p>
            </div>
            
            <div style="display:flex;align-items:center;gap:8px;position:relative;flex:none;">
              <!-- Counter Pill beside settings gear (Issue #6) -->
              <span class="v-reel-pill" id="v-counter" style="background:var(--soft);color:var(--navy);font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:999px;border:1px solid var(--line);flex-shrink:0;">${curIdx + 1} / ${activeList.length}</span>

              <!-- Gear Button -->
              <button type="button" class="video-gear-btn-header" id="v-gear-btn" title="Player Settings" aria-label="Settings">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>
                </svg>
              </button>
              
              <button class="ghost" data-close style="padding:6px 14px;border-radius:999px;font-size:12px;color:var(--navy);background:var(--soft);border:1px solid var(--line);cursor:pointer;">Close</button>

              <!-- Settings Gear Menu Dropdown Popup -->
              <div class="video-gear-menu" id="v-gear-menu">
                <!-- 1. Client Approval Controls -->
                <div class="v-menu-sec">
                  <div class="v-menu-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Client Approval
                  </div>
                  <div id="v-status-indicator" class="v-status-badge ${(currentReel.status === 'approved' || (currentReel.album && currentReel.album !== 'General')) ? 'approved' : 'review'}">
                    <span class="v-status-dot"></span>
                    <span id="v-status-text">${(currentReel.status === 'approved' || (currentReel.album && currentReel.album !== 'General')) ? 'Approved by Client' : 'In Review / Pending'}</span>
                  </div>
                  <div class="v-approval-actions">
                    <button type="button" class="v-act-btn approve-btn ${(currentReel.status === 'approved' || (currentReel.album && currentReel.album !== 'General')) ? 'active' : ''}" id="v-btn-approve">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg>
                      Approve
                    </button>
                    <button type="button" class="v-act-btn reject-btn ${!(currentReel.status === 'approved' || (currentReel.album && currentReel.album !== 'General')) ? 'active' : ''}" id="v-btn-reject">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      Needs Edit
                    </button>
                  </div>
                </div>

                <!-- Video Color Filters (Brightness, Contrast, Saturation) -->
                <div class="v-menu-sec" style="padding-bottom:10px;margin-bottom:10px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <div class="v-menu-label" style="margin-bottom:0;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
                      Color &amp; Filter
                    </div>
                    <button type="button" id="v-filter-reset" style="background:#FFFFFF;border:1px solid var(--line);border-radius:6px;font-size:10px;font-weight:700;color:#0D3B2E;cursor:pointer;padding:2px 7px;">Reset</button>
                  </div>
                  <div style="margin-bottom:7px;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--navy);font-weight:600;margin-bottom:2px;">
                      <span>Brightness</span><span id="v-val-brightness" style="color:#0D3B2E;font-weight:700;">${videoFilters.brightness}%</span>
                    </div>
                    <input type="range" id="v-range-brightness" min="50" max="150" value="${videoFilters.brightness}" style="width:100%;height:4px;accent-color:#0D3B2E;cursor:pointer;display:block;">
                  </div>
                  <div style="margin-bottom:7px;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--navy);font-weight:600;margin-bottom:2px;">
                      <span>Contrast</span><span id="v-val-contrast" style="color:#0D3B2E;font-weight:700;">${videoFilters.contrast}%</span>
                    </div>
                    <input type="range" id="v-range-contrast" min="50" max="150" value="${videoFilters.contrast}" style="width:100%;height:4px;accent-color:#0D3B2E;cursor:pointer;display:block;">
                  </div>
                  <div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--navy);font-weight:600;margin-bottom:2px;">
                      <span>Saturation</span><span id="v-val-saturation" style="color:#0D3B2E;font-weight:700;">${videoFilters.saturation}%</span>
                    </div>
                    <input type="range" id="v-range-saturation" min="0" max="200" value="${videoFilters.saturation}" style="width:100%;height:4px;accent-color:#0D3B2E;cursor:pointer;display:block;">
                  </div>
                </div>

                <!-- 2. Playback Speed -->
                <div class="v-menu-sec">
                  <div class="v-menu-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Playback Speed
                  </div>
                  <div class="v-speed-grid">
                    <button type="button" class="v-speed-btn" data-speed="0.5">0.5x</button>
                    <button type="button" class="v-speed-btn" data-speed="0.75">0.75x</button>
                    <button type="button" class="v-speed-btn active" data-speed="1.0">1.0x</button>
                    <button type="button" class="v-speed-btn" data-speed="1.25">1.25x</button>
                    <button type="button" class="v-speed-btn" data-speed="1.5">1.5x</button>
                  </div>
                </div>

                <!-- 3. Technical Specs -->
                <div class="v-menu-sec" style="margin-bottom:0;border-bottom:none;padding-bottom:0;">
                  <div class="v-menu-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Technical Specs
                  </div>
                  <div class="v-specs-list">
                    <div class="v-spec-item"><span>Format</span><b>MP4 Vertical 9:16</b></div>
                    <div class="v-spec-item"><span>Resolution</span><b id="v-spec-res">Loading...</b></div>
                    <div class="v-spec-item"><span>Branch</span><b id="v-spec-branch">${esc(currentReel.b || currentReel.album || 'General')}</b></div>
                  </div>
                </div>

                <!-- 4. Switch to Instagram Modern Player -->
                <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);">
                  <button type="button" id="v-switch-modern-btn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;background:#FFFFFF;border:1.2px solid #0D3B2E;color:#0D3B2E;padding:8px 0;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.18s ease;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/></svg>
                    Switch to Instagram Reels Player
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Video Frame Box in Unified Unit -->
          <div class="video-modal-unit" style="flex:1;min-height:0;width:100%;max-width:480px;display:flex;flex-direction:column;position:relative;background:#000000;">
            <div class="video-frame-box" id="v-player-container" style="flex:1;width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#000000;">
              <button type="button" class="v-flip-btn v-flip-prev" id="v-flip-prev" title="Previous Video" ${curIdx === 0 ? 'disabled' : ''}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button type="button" class="v-flip-btn v-flip-next" id="v-flip-next" title="Next Video" ${curIdx >= activeList.length - 1 ? 'disabled' : ''}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              <div class="video-card-inner app-slide-active" id="v-card-inner" style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;">
                <video id="v-native-player" src="${getStream(currentReel)}" autoplay playsinline loop preload="auto" poster="${esc(currentReel.coverUrl || '')}" style="width:100%;height:100%;object-fit:contain;background:#000000;display:block;cursor:pointer;"></video>
                <div class="video-loading-circle active" id="v-loading-circle">
                  <svg class="v-spinner-svg" viewBox="0 0 50 50">
                    <circle class="v-spinner-path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
                  </svg>
                </div>
              </div>
            </div>

            <!-- Sleek Custom Scrubber Bar with Live Seconds Tooltip (Issue #5) -->
            <div class="v-legacy-scrubber-wrap" id="v-legacy-scrubber">
              <button type="button" class="v-legacy-play-btn" id="v-leg-play-btn" title="Play/Pause" aria-label="Play or Pause">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFFFFF" id="v-leg-play-icon"><polygon points="6 4 20 12 6 20 6 4"/></svg>
              </button>
              <div class="v-legacy-track-box" id="v-leg-track-box">
                <div class="v-legacy-time-bubble" id="v-leg-time-bubble">0:00 / 0:00</div>
                <div class="v-legacy-track">
                  <div class="v-legacy-fill" id="v-leg-fill">
                    <div class="v-legacy-thumb"></div>
                  </div>
                </div>
              </div>
              <span class="v-legacy-time-label" id="v-leg-time-label">0:00 / 0:00</span>
            </div>

            <!-- Bottom Action Buttons in Styled Dock -->
            <div class="video-modal-acts" style="flex:0 0 auto;width:100%;background:#FFFFFF;border-top:1px solid var(--line);padding:8px 6px calc(8px + env(safe-area-inset-bottom, 8px)) 6px;display:grid;grid-template-columns:repeat(3, 1fr);gap:4px;box-sizing:border-box;z-index:10;">
              <button type="button" class="act" style="--k:var(--green);cursor:pointer;border:none;background:transparent;display:flex;flex-direction:column;align-items:center;gap:3px;padding:3px 2px;" id="v-btn-download">
                <span class="chip" style="width:32px;height:32px;border-radius:50%;background:rgba(16, 185, 129, 0.12);color:#10B981;display:grid;place-items:center;">${ic.dl}</span>
                <span style="font-size:11px;font-weight:600;color:var(--navy);">Download</span>
              </button>
              <button type="button" class="act" style="--k:var(--amber);cursor:pointer;border:none;background:transparent;display:flex;flex-direction:column;align-items:center;gap:3px;padding:3px 2px;" id="v-share">
                <span class="chip" style="width:32px;height:32px;border-radius:50%;background:rgba(245, 158, 11, 0.12);color:#F59E0B;display:grid;place-items:center;">${ic.share}</span>
                <span style="font-size:11px;font-weight:600;color:var(--navy);">Share Video</span>
              </button>
              <button type="button" class="act" style="--k:var(--blue);cursor:pointer;border:none;background:transparent;display:flex;flex-direction:column;align-items:center;gap:3px;padding:3px 2px;" id="v-copy-url">
                <span class="chip" style="width:32px;height:32px;border-radius:50%;background:rgba(59, 130, 246, 0.12);color:#3B82F6;display:grid;place-items:center;">${ic.copy}</span>
                <span style="font-size:11px;font-weight:600;color:var(--navy);">Copy Video URL</span>
              </button>
            </div>
          </div>
        </div>
      `, modalSc => {
        const vid = modalSc.querySelector('#v-native-player');
        const flipPrev = modalSc.querySelector('#v-flip-prev');
        const flipNext = modalSc.querySelector('#v-flip-next');
        const titleEl = modalSc.querySelector('#v-title');
        const subtitleEl = modalSc.querySelector('#v-subtitle');
        const counterEl = modalSc.querySelector('#v-counter');
        const specBranch = modalSc.querySelector('#v-spec-branch');
        const gearBtn = modalSc.querySelector('#v-gear-btn');
        const gearMenu = modalSc.querySelector('#v-gear-menu');
        const btnApprove = modalSc.querySelector('#v-btn-approve');
        const btnReject = modalSc.querySelector('#v-btn-reject');
        const statusText = modalSc.querySelector('#v-status-text');
        const statusIndicator = modalSc.querySelector('#v-status-indicator');
        const switchModernBtn = modalSc.querySelector('#v-switch-modern-btn');
        const legLoadingCircle = modalSc.querySelector('#v-loading-circle');
        const legPlayBtn = modalSc.querySelector('#v-leg-play-btn');
        const legPlayIcon = modalSc.querySelector('#v-leg-play-icon');
        const legTrackBox = modalSc.querySelector('#v-leg-track-box');
        const legFill = modalSc.querySelector('#v-leg-fill');
        const legTimeBubble = modalSc.querySelector('#v-leg-time-bubble');
        const legTimeLabel = modalSc.querySelector('#v-leg-time-label');
        let isLegScrubbing = false;

        // Circular Loading Spinner for Legacy Player
        if (legLoadingCircle && vid) {
          legLoadingCircle.classList.add('active');
          const hideLegLoader = () => legLoadingCircle.classList.remove('active');
          const showLegLoader = () => legLoadingCircle.classList.add('active');
          vid.addEventListener('loadstart', showLegLoader);
          vid.addEventListener('waiting', showLegLoader);
          vid.addEventListener('seeking', showLegLoader);
          vid.addEventListener('canplay', hideLegLoader);
          vid.addEventListener('playing', hideLegLoader);
          vid.addEventListener('seeked', hideLegLoader);
        }

        // Play/Pause State Management
        function updatePlayPauseIcon(isPaused) {
          if (legPlayIcon) {
            legPlayIcon.innerHTML = isPaused
              ? '<polygon points="6 4 20 12 6 20 6 4"/>'
              : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
          }
        }

        function toggleClassicPlay() {
          if (vid.paused) {
            vid.play().catch(() => {});
          } else {
            vid.pause();
          }
        }

        vid.addEventListener('play', () => updatePlayPauseIcon(false));
        vid.addEventListener('pause', () => updatePlayPauseIcon(true));
        legPlayBtn?.addEventListener('click', toggleClassicPlay);
        vid.addEventListener('click', toggleClassicPlay);

        function fmtSec(sec) {
          if (isNaN(sec) || sec < 0) sec = 0;
          const m = Math.floor(sec / 60);
          const s = Math.floor(sec % 60);
          return `${m}:${s < 10 ? '0' : ''}${s}`;
        }

        function updateClassicScrubberUi(cur, dur) {
          if (!dur) return;
          const pct = Math.max(0, Math.min(100, (cur / dur) * 100));
          if (legFill) legFill.style.width = pct + '%';
          if (legTimeLabel) legTimeLabel.textContent = `${fmtSec(cur)} / ${fmtSec(dur)}`;
        }

        vid.addEventListener('timeupdate', () => {
          if (!isLegScrubbing && vid.duration) {
            updateClassicScrubberUi(vid.currentTime, vid.duration);
          }
        });

        function seekClassicFromPointer(clientX) {
          if (!vid.duration || !legTrackBox) return;
          const rect = legTrackBox.getBoundingClientRect();
          const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          const targetTime = pos * vid.duration;
          vid.currentTime = targetTime;
          updateClassicScrubberUi(targetTime, vid.duration);
          if (legTimeBubble) {
            legTimeBubble.textContent = `${fmtSec(targetTime)} / ${fmtSec(vid.duration)}`;
            legTimeBubble.style.left = `${pos * 100}%`;
          }
        }

        if (legTrackBox) {
          legTrackBox.addEventListener('pointermove', e => {
            if (!vid.duration) return;
            const rect = legTrackBox.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const hoverTime = pos * vid.duration;
            if (legTimeBubble) {
              legTimeBubble.textContent = `${fmtSec(hoverTime)} / ${fmtSec(vid.duration)}`;
              legTimeBubble.style.left = `${pos * 100}%`;
            }
          });

          legTrackBox.addEventListener('pointerdown', e => {
            e.stopPropagation();
            isLegScrubbing = true;
            legTrackBox.classList.add('is-scrubbing');
            seekClassicFromPointer(e.clientX);
            const onMove = ev => { if (isLegScrubbing) seekClassicFromPointer(ev.clientX); };
            const onUp = () => {
              isLegScrubbing = false;
              legTrackBox.classList.remove('is-scrubbing');
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          });
        }

        if (vid) {
          vid.addEventListener('loadedmetadata', () => {
            const resEl = modalSc.querySelector('#v-spec-res');
            if (resEl && vid.videoWidth && vid.videoHeight) {
              resEl.textContent = `${vid.videoWidth} × ${vid.videoHeight}`;
            }
            updateClassicScrubberUi(vid.currentTime, vid.duration);
          });
        }

        gearBtn?.addEventListener('click', e => {
          e.stopPropagation();
          gearMenu?.classList.toggle('open');
        });

        document.addEventListener('click', e => {
          if (gearMenu && !gearMenu.contains(e.target) && e.target !== gearBtn) {
            gearMenu.classList.remove('open');
          }
        });

        switchModernBtn?.addEventListener('click', () => {
          vid.pause();
          modalSc.remove();
          try { localStorage.setItem('dn_player_mode', 'modern'); } catch(_) {}
          openVideoModal(currentReel, activeList);
        });

        btnApprove?.addEventListener('click', () => {
          confirmModal('Approve Reel', `Are you sure you want to approve "${currentReel.title}"? Once approved, it will be published to the client Reels gallery.`, () => {
            setReelApprovalStatus(currentReel.id, 'approved');
            statusText.textContent = 'Approved by Client';
            statusIndicator.className = 'v-status-badge approved';
            btnApprove.classList.add('active');
            btnReject.classList.remove('active');
          }, 'Approve Reel', false);
        });

        btnReject?.addEventListener('click', () => {
          confirmModal('Reject / Request Edits', `Are you sure you want to reject "${currentReel.title}" and request revisions?`, () => {
            setReelApprovalStatus(currentReel.id, 'denied');
            statusText.textContent = 'Needs Edit / Review';
            statusIndicator.className = 'v-status-badge review';
            btnReject.classList.add('active');
            btnApprove.classList.remove('active');
          }, 'Reject Reel', true);
        });

        // Wire Classic Player Color Calibration
        const vRangeB = modalSc.querySelector('#v-range-brightness');
        const vRangeC = modalSc.querySelector('#v-range-contrast');
        const vRangeS = modalSc.querySelector('#v-range-saturation');
        const vValB = modalSc.querySelector('#v-val-brightness');
        const vValC = modalSc.querySelector('#v-val-contrast');
        const vValS = modalSc.querySelector('#v-val-saturation');
        const vResetBtn = modalSc.querySelector('#v-filter-reset');

        function updateVFilters() {
          if (vRangeB) vRangeB.value = videoFilters.brightness;
          if (vRangeC) vRangeC.value = videoFilters.contrast;
          if (vRangeS) vRangeS.value = videoFilters.saturation;
          if (vValB) vValB.textContent = videoFilters.brightness + '%';
          if (vValC) vValC.textContent = videoFilters.contrast + '%';
          if (vValS) vValS.textContent = videoFilters.saturation + '%';
          applyVideoFilters(vid);
          try { localStorage.setItem('dn_video_filters', JSON.stringify(videoFilters)); } catch(_) {}
        }

        applyVideoFilters(vid);

        vRangeB?.addEventListener('input', e => {
          videoFilters.brightness = parseInt(e.target.value, 10);
          updateVFilters();
        });
        vRangeC?.addEventListener('input', e => {
          videoFilters.contrast = parseInt(e.target.value, 10);
          updateVFilters();
        });
        vRangeS?.addEventListener('input', e => {
          videoFilters.saturation = parseInt(e.target.value, 10);
          updateVFilters();
        });
        vResetBtn?.addEventListener('click', () => {
          videoFilters.brightness = 100;
          videoFilters.contrast = 100;
          videoFilters.saturation = 100;
          updateVFilters();
          toast('Video color calibration reset to default', 'info');
        });

        modalSc.querySelectorAll('.v-speed-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            modalSc.querySelectorAll('.v-speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            vid.playbackRate = parseFloat(btn.dataset.speed);
          });
        });

        function navigateClassic(idx) {
          if (idx < 0 || idx >= activeList.length) return;
          curIdx = idx;
          currentReel = activeList[curIdx];
          recordWatchHistory(currentReel);
          vid.src = getStream(currentReel);
          titleEl.textContent = currentReel.title;
          subtitleEl.textContent = `${fmtDate(currentReel.date)}${currentReel.b ? ' · ' + currentReel.b : (currentReel.album ? ' · ' + currentReel.album : '')}`;
          counterEl.textContent = `${curIdx + 1} / ${activeList.length}`;
          if (specBranch) specBranch.textContent = currentReel.b || currentReel.album || 'General';
          flipPrev.disabled = curIdx === 0;
          flipNext.disabled = curIdx >= activeList.length - 1;
          attemptClassicPlay();
        }

        flipPrev?.addEventListener('click', () => navigateClassic(curIdx - 1));
        flipNext?.addEventListener('click', () => navigateClassic(curIdx + 1));

        modalSc.querySelector('#v-btn-download')?.addEventListener('click', () => triggerDirectDownload(currentReel));
        modalSc.querySelector('#v-share')?.addEventListener('click', () => shareVideo(currentReel));
        modalSc.querySelector('#v-copy-url')?.addEventListener('click', () => {
          const directUrl = getStream(currentReel);
          navigator.clipboard.writeText(directUrl).then(() => toast('Direct Video Link copied', 'success')).catch(() => toast('URL: ' + directUrl, 'info'));
        });

        // Fast Unmuted Playback by default (Issues #1 & #2)
        vid.muted = false;
        function attemptClassicPlay() {
          vid.muted = false;
          const p = vid.play();
          if (p && typeof p.catch === 'function') {
            p.catch(err => {
              console.warn('Classic unmuted autoplay blocked, falling back to muted:', err);
              vid.muted = true;
              vid.play().catch(e => console.error('Classic play error:', e));
            });
          }
        }
        attemptClassicPlay();

        const unmuteClassicOnGesture = () => {
          if (vid.muted) vid.muted = false;
        };
        modalSc.addEventListener('pointerdown', unmuteClassicOnGesture, { once: true });
      }, false, 'video-modal-scrim');
    }

    function shareVideo(r) {
      const c = client();
      if (DATA.settings?.sharesPaused || (c && c.sharesPaused)) {
        toast('Media sharing is temporarily paused by administration.', 'amber');
        return;
      }
      if (!r || !r.url) {
        toast('Sharing available when file is uploaded.', 'amber');
        return;
      }

      const isImg = r.type === 'story' || r.type === 'poster' || r.url.startsWith('data:image/') || /\.(jpe?g|png|webp|gif)$/i.test(r.url);
      const id = driveId(r.url);
      const cleanTitle = (r.title || (isImg ? 'image' : 'video')).replace(/[/\\?%*:|"<>]/g, '_').trim() || (isImg ? 'image' : 'video');
      const ext = isImg ? '.jpg' : '.mp4';
      const filename = cleanTitle.toLowerCase().endsWith(ext) ? cleanTitle : `${cleanTitle}${ext}`;
      const directUrl = isImg
        ? (id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200` : r.url)
        : (id ? `${window.location.origin}/api/video?id=${encodeURIComponent(id)}` : r.url);

      openDirectShareSheet(r, directUrl, filename, isImg);
    }

    function openDirectShareSheet(r, directVideoUrl, filename, isImg = false) {
      const c = client() || { name: 'Day Night' };
      const id = driveId(r.url);
      const mediaLink = directVideoUrl || (id ? `${window.location.origin}/api/video?id=${encodeURIComponent(id)}` : r.url);
      const shareMsg = `${c.name} | DAY NIGHT · ${r.title}\n${mediaLink}`;
      const labelType = isImg ? (r.type === 'story' ? 'Story' : 'Poster') : 'Video';
      const hasNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

      sheet(`
        <h4>Share ${labelType}</h4>
        <p>${esc(r.title)} · High-Resolution ${labelType}</p>
        <div class="linkbox" id="share-link" title="Tap to copy direct link">${esc(mediaLink.startsWith('data:') ? window.location.href : mediaLink)}</div>
        <div class="share-opts">
          ${hasNativeShare ? `
          <button type="button" id="share-native-btn" style="--k:var(--violet);">
            <span class="chip">${ic.share}</span>Share via Apps (WhatsApp, Instagram...)
          </button>` : ''}
          <button type="button" id="copy-btn" style="--k:var(--blue);">
            <span class="chip">${ic.copy}</span>Copy Direct ${labelType} Link
          </button>
          <a style="--k:#25D366" href="https://wa.me/?text=${encodeURIComponent(shareMsg)}" target="_blank" rel="noopener">
            <span class="chip">${ic.wa}</span>Share to WhatsApp
          </a>
          <a style="--k:#229ED9" href="https://t.me/share/url?url=${encodeURIComponent(mediaLink)}&text=${encodeURIComponent(c.name + ' · ' + r.title)}" target="_blank" rel="noopener">
            <span class="chip">${ic.tg}</span>Share to Telegram
          </a>
          <button type="button" id="share-dl-btn" style="--k:var(--green);">
            <span class="chip">${ic.dl}</span>Save / Download ${labelType} File
          </button>
        </div>
        <button class="ghost" data-close style="width:100%;margin-top:4px;">Close</button>`, sc => {

        // 1. Native Mobile System Share (Instant 1-tap to WhatsApp, Instagram, Telegram, etc.)
        sc.querySelector('#share-native-btn')?.addEventListener('click', async () => {
          try {
            await navigator.share({
              title: r.title,
              text: `${c.name} · ${r.title}`,
              url: mediaLink
            });
          } catch(err) {
            // User dismissed native sheet or browser permission denied
          }
        });

        // 2. Direct File Download
        sc.querySelector('#share-dl-btn')?.addEventListener('click', () => {
          if (DATA.settings?.downloadsPaused || (c && c.downloadsPaused)) {
            toast('Direct file downloading is temporarily paused by administration.', 'amber');
            return;
          }
          triggerDirectDownload(r);
        });

        // 3. Reliable Direct Link Copy with Multilayer Fallbacks
        const copyHandler = async () => {
          const textToCopy = mediaLink.startsWith('data:') ? window.location.href : mediaLink;
          let copied = false;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
              await navigator.clipboard.writeText(textToCopy);
              copied = true;
            } catch(e) {}
          }
          if (!copied) {
            try {
              const ta = document.createElement('textarea');
              ta.value = textToCopy;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              copied = document.execCommand('copy');
              ta.remove();
            } catch(e) {}
          }
          if (copied) {
            toast(`Direct ${labelType.toLowerCase()} link copied to clipboard!`, 'success');
          } else {
            toast('Link selected. Please copy manually from the box.', 'info');
          }
        };

        sc.querySelector('#copy-btn')?.addEventListener('click', copyHandler);
        sc.querySelector('#share-link')?.addEventListener('click', copyHandler);
      }, false, 'share-modal-scrim');
    }

    // Direct alias so any existing calls invoke direct video sharing
    function openShare(r) {
      shareVideo(r);
    }

        // --------------------------------------------------------------------------
    // ADMIN PANEL & COMPLETE GOOGLE DRIVE ENGINE
    // --------------------------------------------------------------------------
    function verifyAdminAccess() {
      if (CONFIG.isAdmin && isMasterAdminAuth(sessionStorage.getItem('dn_admin_auth'))) {
        openAdmin();
        return;
      }
      sheet(`
        <h4>Admin Security Check</h4>
        <p>Enter the Day Night Media master passkey (e.g. <code>DN@2026</code>, <code>0000</code>, or <code>9999</code>) to unlock admin controls.</p>
        <div class="field">
          <label for="adm-pass">Master Passkey</label>
          <input id="adm-pass" type="password" placeholder="Passkey (DN@2026 or 0000)" autofocus>
        </div>
        <button class="go" id="adm-unlock">Unlock Admin Controls</button>
        <button class="ghost" data-close>Cancel</button>`, sc => {
        const inp = sc.querySelector('#adm-pass');
        const doUnlock = () => {
          const pass = inp.value.trim();
          if (isMasterAdminAuth(pass)) {
            activateAdminMode();
            sc.remove();
            openAdmin();
          } else {
            toast('Invalid Admin Passkey. Use DN@2026 or 0000', 'error');
            inp.value = '';
            inp.focus();
          }
        };
        sc.querySelector('#adm-unlock').addEventListener('click', doUnlock);
        inp.onkeydown = e => { if (e.key === 'Enter') doUnlock(); };
        setTimeout(() => inp.focus(), 120);
      }, true);
    }

    function openAdmin() {
      const isOnline = connectionState.status === 'online';
      sheet(`
        <div class="row-between">
          <h4>Day Night Media Control</h4>
          <span class="status-badge">
            <span class="status-dot ${isOnline ? 'online' : (connectionState.status === 'testing' ? '' : 'offline')}"></span>
            ${esc(connectionState.message)}
          </span>
        </div>
        <div class="menu">
          <button class="go" id="m-full-panel" style="background:var(--navy);font-size:14px;padding:14px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> Open Full Desktop Dashboard</button>
          <button class="ghost" id="m-add">+ Upload Reel / Add Video</button>
          <button class="ghost" id="m-folders"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> Drive Folders &amp; Albums</button>
          <button class="ghost" id="m-cl"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16"/></svg> Client Profiles &amp; Dedicated URLs</button>
          <button class="ghost" id="m-gas"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg> Google Drive &amp; D1 Connection</button>
          <button class="ghost" id="m-fp"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.4-.4-.8-.4-1.4 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5.5-4.5-10-10-10z"/></svg> Front Page Branding</button>
          <button class="ghost" id="m-sync"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Synchronize Database Now</button>
        </div>
        <button class="ghost" data-close>Close</button>`, sc => {
        sc.querySelector('#m-full-panel').onclick = () => { window.location.href = '/admin'; };
        sc.querySelector('#m-add').onclick = openAdd;
        sc.querySelector('#m-folders').onclick = openFolderManager;
        sc.querySelector('#m-cl').onclick = openClients;
        sc.querySelector('#m-gas').onclick = openGasConfig;
        sc.querySelector('#m-fp').onclick = openSettings;
        sc.querySelector('#m-sync').onclick = async () => {
          toast('Syncing with Google Drive...', 'info');
          await fetchLiveData();
          toast('Database is synchronized!', 'success');
          openAdmin();
        };
      });
    }

    // 1. FOLDER & ALBUM MANAGER (Create, Rename, Delete in Google Drive)
    function openFolderManager() {
      const c = client();
      sheet(`
        <h4>Drive Folders &amp; Albums · ${esc(c.name)}</h4>
        <p>Manage folders inside Google Drive (<code>Reels/${esc(c.name)}/…</code>) and Collections.</p>
        <div class="clist">
          ${(c.albums || []).map(alb => `
            <div class="citem">
              <span class="lg">${ic.folder}</span>
              <div>
                <b>${esc(alb)}</b>
                <small>${reelsFor(null, null, null, alb).length} reels in this collection</small>
              </div>
              <button data-ren-alb="${esc(alb)}">Rename</button>
            </div>`).join('')}
        </div>
        <button class="go" id="f-new-alb">+ Create New Folder / Album</button>
        <button class="ghost" data-close>Back</button>`, sc => {
        sc.querySelector('#f-new-alb').onclick = () => {
          promptModal('Create New Folder', 'Folder / Album Name', '', async name => {
            toast('Creating folder in Google Drive...', 'info');
            try {
              if (CONFIG.gasUrl) {
                await gasApi('createFolder', { clientName: c.name, folderName: name });
              }
              if (!c.albums) c.albums = [];
              if (!c.albums.includes(name)) c.albums.push(name);
              persist('Folder created successfully');
            } catch(e) {
              toast('Error creating folder: ' + e.message, 'error');
            }
          });
        };

        sc.querySelectorAll('[data-ren-alb]').forEach(btn => {
          btn.onclick = () => {
            const oldName = btn.dataset.renAlb;
            promptModal('Rename Folder', 'New Name', oldName, async newName => {
              if (oldName === newName) return;
              toast('Renaming in Google Drive...', 'info');
              try {
                if (CONFIG.gasUrl) {
                  await gasApi('renameFolder', { clientName: c.name, oldName, newName });
                }
                const idx = c.albums.indexOf(oldName);
                if (idx !== -1) c.albums[idx] = newName;
                persist('Folder renamed');
              } catch(e) {
                toast('Rename error: ' + e.message, 'error');
              }
            });
          };
        });
      });
    }

    // 2. REEL CREATION & UPLOAD (Google Drive Upload OR Link + Custom Cover)
    function openAdd() {
      const c = client();
      const y = view.year || TODAY.getFullYear();
      const m = view.month ?? TODAY.getMonth();
      const branches = (c.branches && c.branches.length) ? c.branches : [];
      const albums = (c.albums && c.albums.length) ? c.albums : [];
      const b = view.branch && branches.includes(view.branch) ? view.branch : (branches[0] || '');
      const alb = view.album && albums.includes(view.album) ? view.album : (albums[0] || '');

      sheet(`
        <h4>Add Reel · ${esc(c.name)}</h4>
        <div class="tabs">
          <button class="tab-btn active" id="tab-link">Paste Link</button>
          <button class="tab-btn" id="tab-upload">Upload MP4 to Drive</button>
        </div>

        <div class="field">
          <label for="f-title">Reel Title</label>
          <input id="f-title" placeholder="e.g. Diwali Silk Saree Collection">
        </div>

        <div id="mode-link">
          <div class="field">
            <label for="f-url">Google Drive Video Link</label>
            <input id="f-url" placeholder="https://drive.google.com/file/d/…/view">
          </div>
        </div>

        <div id="mode-upload" style="display:none;">
          <div class="field">
            <label for="f-file">Select MP4 Video File (Auto-Generates Thumbnail)</label>
            <input id="f-file" type="file" accept="video/mp4,video/quicktime,video/webm">
          </div>
          <div id="thumb-preview-wrap-client" style="display:none;"></div>
        </div>

        <div class="field" style="background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <label for="f-cover" style="margin:0;font-size:11px;font-weight:700;color:var(--navy);display:flex;align-items:center;gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Manual Thumbnail Upload (Optional)
            </label>
            <span id="f-cover-status" style="font-size:10px;color:var(--mute);font-weight:600;">JPG, PNG, WebP</span>
          </div>

          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input id="f-cover" placeholder="Image URL or choose file below" style="flex:1;min-width:180px;font-size:12px;">
            <input id="f-cover-file" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;">
            <button type="button" id="btn-pick-f-cover" class="btn-portal" style="font-size:11px;font-weight:600;padding:6px 12px;border-radius:8px;display:inline-flex;align-items:center;gap:6px;background:#FFFFFF;cursor:pointer;flex:none;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              Choose Image
            </button>
            <button type="button" id="btn-clear-f-cover" style="display:none;background:none;border:none;color:var(--red);font-size:11px;cursor:pointer;padding:2px 4px;font-weight:600;">Remove</button>
          </div>

          <div id="f-cover-preview-box" style="display:none;margin-top:8px;padding:6px 10px;background:#FFFFFF;border:1px solid var(--line);border-radius:8px;align-items:center;gap:10px;">
            <div style="width:40px;height:54px;border-radius:4px;overflow:hidden;background:#000;flex-shrink:0;">
              <img id="f-cover-preview-img" src="" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <div style="flex:1;min-width:0;font-size:11px;color:var(--navy);">
              <b style="color:var(--green);display:block;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Custom Thumbnail Active</b>
              <small id="f-cover-dims" style="color:var(--mute);">Ready for upload</small>
            </div>
          </div>
        </div>

        <div class="row2">
          <div class="field">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label for="f-branch">Branch Store</label>
              <button type="button" id="btn-quick-new-branch" style="border:1px solid var(--line);background:var(--soft);color:var(--navy);font-size:11px;font-weight:600;cursor:pointer;padding:2px 8px;border-radius:6px;">+ New</button>
            </div>
            <select id="f-branch">
              <option value="">No branch / General</option>
              ${branches.map(x => `<option ${x === b ? 'selected' : ''}>${esc(x)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label for="f-alb">Album / Collection</label>
              <button type="button" id="btn-quick-new-alb" style="border:1px solid var(--line);background:var(--soft);color:var(--navy);font-size:11px;font-weight:600;cursor:pointer;padding:2px 8px;border-radius:6px;">+ New</button>
            </div>
            <select id="f-alb">
              <option value="">General</option>
              ${albums.map(x => `<option ${x === alb ? 'selected' : ''}>${esc(x)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="row2">
          <div class="field">
            <label for="f-month">Month</label>
            <select id="f-month">
              ${MONTHS.map((mn, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${mn}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="f-year">Year</label>
            <select id="f-year">
              ${[2025, 2026, 2027, 2028].map(yy => `<option ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="row2">
          <div class="field">
            <label for="f-date">Delivered Date</label>
            <input id="f-date" type="date" value="${TODAY.toISOString().slice(0, 10)}">
          </div>
          <div class="field">
            <label for="f-dur">Duration</label>
            <input id="f-dur" value="" placeholder="e.g. 0:45">
          </div>
        </div>

        <div class="field">
          <label for="f-status">Approval Status</label>
          <select id="f-status">
            <option value="approved">Approved</option>
            <option value="review">In Review</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        <button class="go" id="f-save">Publish Reel</button>
        <button class="ghost" data-close>Cancel</button>`, sc => {
        let mode = 'link', coverData = '', activeVideoFile = null, generatedThumbData = '';

        const tabLink = sc.querySelector('#tab-link');
        const tabUpload = sc.querySelector('#tab-upload');
        const modeLink = sc.querySelector('#mode-link');
        const modeUpload = sc.querySelector('#mode-upload');
        const fileInput = sc.querySelector('#f-file');
        const thumbWrap = sc.querySelector('#thumb-preview-wrap-client');
        const durInput = sc.querySelector('#f-dur');
        const titleInput = sc.querySelector('#f-title');

        if (fileInput) {
          fileInput.onchange = async e => {
            const f = e.target.files[0];
            if (!f) return;
            activeVideoFile = f;

            if (!titleInput.value.trim()) {
              const clean = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
              titleInput.value = clean.charAt(0).toUpperCase() + clean.slice(1);
            }

            thumbWrap.style.display = 'block';
            thumbWrap.innerHTML = `
              <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--soft);border:1px dashed var(--line);border-radius:14px;color:var(--navy);font-size:12px;">
                <span class="sync-icon" style="display:inline-block;animation:spin 0.8s linear infinite;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg></span>
                <span>Extracting video frame thumbnail...</span>
              </div>`;

            try {
              const thumb = await generateVideoThumbnail(f, 1.0);
              generatedThumbData = thumb.dataUrl;
              coverData = thumb.dataUrl;
              durInput.value = thumb.durationStr;
              renderThumbPreview(thumb);
            } catch(err) {
              thumbWrap.innerHTML = `
                <div style="padding:10px;background:#FEE2E2;border:1px solid #FCA5A5;border-radius:12px;color:var(--red);font-size:12px;">
                  Thumbnail note: ${err.message || 'Frame extraction not available'}. You can still provide a custom cover below.
                </div>`;
            }
          };
        }

        function renderThumbPreview(thumb) {
          thumbWrap.innerHTML = `
            <div class="thumb-preview-box">
              <div class="thumb-img-wrap">
                <img id="thumb-preview-img" src="${thumb.dataUrl}" alt="Thumbnail">
              </div>
              <div class="thumb-info">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                  <span class="thumb-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Auto-Generated Video Thumbnail</span>
                  <span style="font-size:11px;font-weight:700;color:var(--navy);">${thumb.durationStr}</span>
                </div>
                <div class="thumb-meta">
                  ${thumb.width}×${thumb.height} · ${(activeVideoFile.size / (1024*1024)).toFixed(1)} MB MP4
                </div>
                <div class="scrubber-row">
                  <small style="font-size:10px;color:var(--mute);flex:none;">Scrub Frame:</small>
                  <input type="range" id="f-frame-scrub" min="0" max="${Math.max(1, thumb.durationSec)}" step="0.5" value="1">
                  <span id="scrub-time-val" style="font-size:10px;color:var(--navy);font-weight:600;min-width:24px;">1.0s</span>
                </div>
              </div>
            </div>`;

          const scrubSlider = thumbWrap.querySelector('#f-frame-scrub');
          const timeVal = thumbWrap.querySelector('#scrub-time-val');
          const imgPreview = thumbWrap.querySelector('#thumb-preview-img');

          let scrubDebounce = null;
          if (scrubSlider) {
            scrubSlider.oninput = () => {
              const sec = Number(scrubSlider.value);
              timeVal.textContent = sec.toFixed(1) + 's';
              clearTimeout(scrubDebounce);
              scrubDebounce = setTimeout(async () => {
                try {
                  const newThumb = await generateVideoThumbnail(activeVideoFile, sec);
                  generatedThumbData = newThumb.dataUrl;
                  coverData = newThumb.dataUrl;
                  imgPreview.src = newThumb.dataUrl;
                } catch(e) {}
              }, 180);
            };
          }
        }

        sc.querySelector('#btn-quick-new-branch').onclick = () => {
          promptModal('Add Store Branch', `Branch name for ${c.name}:`, '', val => {
            c.branches = c.branches || [];
            if (!c.branches.includes(val)) {
              c.branches.push(val);
              persist(`Branch "${val}" added!`);
            }
            const sel = sc.querySelector('#f-branch');
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            opt.selected = true;
            sel.appendChild(opt);
          }, 'e.g. T. Nagar');
        };

        sc.querySelector('#btn-quick-new-alb').onclick = () => {
          promptModal('Add Album / Collection', `Album name for ${c.name}:`, '', val => {
            c.albums = c.albums || [];
            if (!c.albums.includes(val)) {
              c.albums.push(val);
              persist(`Album "${val}" added!`);
            }
            const sel = sc.querySelector('#f-alb');
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            opt.selected = true;
            sel.appendChild(opt);
          }, 'e.g. Diwali Edit');
        };

        tabLink.onclick = () => {
          mode = 'link';
          tabLink.classList.add('active'); tabUpload.classList.remove('active');
          modeLink.style.display = 'block'; modeUpload.style.display = 'none';
          activeVideoFile = null;
          if (fileInput) fileInput.value = '';
          thumbWrap.style.display = 'none';
          checkUrlThumb();
        };

        function checkUrlThumb() {
          const urlInput = sc.querySelector('#f-url');
          if (!urlInput) return;
          const val = urlInput.value.trim();
          const m = val.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || val.match(/[?&]id=([a-zA-Z0-9_-]+)/);
          let badge = sc.querySelector('#drive-thumb-link-badge');
          if (m) {
            const fileId = m[1];
            const driveThumb = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
            coverData = driveThumb;
            activeVideoFile = null;
            if (!badge) {
              badge = document.createElement('div');
              badge.id = 'drive-thumb-link-badge';
              badge.style = 'margin-top:8px;padding:8px 12px;background:rgba(31,175,100,0.08);border:1px solid rgba(31,175,100,0.3);border-radius:10px;font-size:11px;color:var(--navy);display:flex;align-items:center;gap:10px;';
              urlInput.parentNode.appendChild(badge);
            }
            badge.innerHTML = `
              <img src="${driveThumb}" style="width:36px;height:48px;object-fit:cover;border-radius:6px;background:#000;flex-shrink:0;" onerror="this.src='/Logo/logo.png'">
              <div>
                <b style="color:var(--green);display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Drive Thumbnail Auto-Connected</b>
                <div style="font-size:10px;color:var(--mute);">File ID: ${fileId}</div>
              </div>`;
          } else if (badge) {
            badge.remove();
          }
        }

        const urlInputEl = sc.querySelector('#f-url');
        if (urlInputEl) {
          urlInputEl.oninput = checkUrlThumb;
          urlInputEl.onpaste = () => setTimeout(checkUrlThumb, 50);
        }
        tabUpload.onclick = () => {
          mode = 'upload';
          tabUpload.classList.add('active'); tabLink.classList.remove('active');
          modeUpload.style.display = 'block'; modeLink.style.display = 'none';
        };

        const coverInput = sc.querySelector('#f-cover');
        const coverFileInput = sc.querySelector('#f-cover-file');
        const btnPickCover = sc.querySelector('#btn-pick-f-cover');
        const btnClearCover = sc.querySelector('#btn-clear-f-cover');
        const coverPrevBox = sc.querySelector('#f-cover-preview-box');
        const coverPrevImg = sc.querySelector('#f-cover-preview-img');
        const coverDims = sc.querySelector('#f-cover-dims');
        const coverStatus = sc.querySelector('#f-cover-status');

        if (btnPickCover && coverFileInput) {
          btnPickCover.onclick = () => coverFileInput.click();
          coverFileInput.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const img = new Image();
              img.onload = () => {
                const maxDim = 1200;
                let w = img.width, h = img.height;
                if (w > maxDim || h > maxDim) {
                  if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                  else { w = Math.round((w * maxDim) / h); h = maxDim; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
                coverData = dataUrl;

                coverInput.value = 'Custom Thumbnail (' + file.name + ')';
                coverPrevImg.src = dataUrl;
                coverDims.textContent = `${w}×${h} · Ready for upload`;
                coverPrevBox.style.display = 'flex';
                if (btnClearCover) btnClearCover.style.display = 'inline-block';
                if (coverStatus) {
                  coverStatus.textContent = 'Custom Thumbnail Loaded';
                  coverStatus.style.color = 'var(--green)';
                }
              };
              img.src = reader.result;
            };
            reader.readAsDataURL(file);
          };
        }

        if (btnClearCover) {
          btnClearCover.onclick = () => {
            coverFileInput.value = '';
            coverInput.value = '';
            coverData = generatedThumbData || '';
            coverPrevBox.style.display = 'none';
            btnClearCover.style.display = 'none';
            if (coverStatus) {
              coverStatus.textContent = 'JPG, PNG, WebP';
              coverStatus.style.color = 'var(--mute)';
            }
          };
        }

        sc.querySelector('#f-save').onclick = async () => {
          const title = sc.querySelector('#f-title').value.trim();
          const year = +sc.querySelector('#f-year').value;
          const month = +sc.querySelector('#f-month').value;
          const branch = sc.querySelector('#f-branch') ? sc.querySelector('#f-branch').value.trim() : '';
          const album = sc.querySelector('#f-alb') ? sc.querySelector('#f-alb').value.trim() : '';
          const date = sc.querySelector('#f-date').value;
          const dur = sc.querySelector('#f-dur').value.trim();
          const status = sc.querySelector('#f-status').value;
          const coverUrl = coverData || sc.querySelector('#f-cover').value.trim();

          if (!title) { toast('Please enter a reel title', 'amber'); return; }

          if (mode === 'link') {
            const url = sc.querySelector('#f-url').value.trim();
            if (!url || !/^https?:\/\//.test(url)) {
              toast('Add a valid video link starting with https://', 'amber'); return;
            }
            let finalCoverUrl = coverUrl;
            const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            const fileId = m ? m[1] : '';
            if (!finalCoverUrl && fileId) {
              finalCoverUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
            }
            if (!DATA.reels) DATA.reels = [];
            DATA.reels.unshift({
              id: 'r' + Date.now().toString(36),
              c: c.id, y: year, m: month, b: branch, album,
              title, date, url, fileId, dur, coverUrl: finalCoverUrl, hidden: false, status, views: 0, downloads: 0, sample: false,
              thumbnailGenerated: !!finalCoverUrl
            });
            persist('Reel published successfully');
          } else {
            const file = activeVideoFile || sc.querySelector('#f-file').files[0];
            if (!file) { toast('Please choose an MP4 video file', 'amber'); return; }

            const sheetEl = sc.querySelector('.sheet') || sc;
            sheetEl.innerHTML = `
              <div class="live-upload-box">
                <div class="live-upload-header">
                  <div class="live-upload-title">
                    <span class="sync-icon" style="color:var(--blue);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-3.95 11z"/></svg></span>
                    <span>Direct Master Stream to Google Drive</span>
                  </div>
                  <div class="live-upload-pct" id="live-pct">0%</div>
                </div>

                <div class="live-prog-track">
                  <div class="live-prog-bar" id="live-bar"></div>
                </div>

                <div class="live-upload-stats">
                  <span id="live-bytes">Initializing Google Drive session (${(file.size / (1024*1024)).toFixed(1)} MB)...</span>
                  <span id="live-speed">Connecting...</span>
                </div>

                <div class="live-upload-stages">
                  <div class="live-stage-item done" id="stage-thumb">
                    <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span>High-definition video thumbnail generated</span>
                  </div>
                  <div class="live-stage-item active" id="stage-upload">
                    <span id="stage-upload-icon">→</span><span id="stage-upload-text">Streaming raw binary directly to Google Drive...</span>
                  </div>
                  <div class="live-stage-item" id="stage-cloud">
                    <span id="stage-cloud-icon">○</span><span>Google Drive permissions &amp; edge replication</span>
                  </div>
                </div>

                <div style="display:flex;justify-content:flex-end;margin-top:6px;">
                  <button type="button" class="ghost" id="btn-cancel-upload" style="color:var(--red);">Cancel Upload</button>
                </div>
              </div>`;

            const liveBar = sc.querySelector('#live-bar');
            const livePct = sc.querySelector('#live-pct');
            const liveBytes = sc.querySelector('#live-bytes');
            const liveSpeed = sc.querySelector('#live-speed');
            const stageUpload = sc.querySelector('#stage-upload');
            const stageCloud = sc.querySelector('#stage-cloud');

            let aborted = false;
            let currentXhr = null;

            sc.querySelector('#btn-cancel-upload').onclick = () => {
              aborted = true;
              if (currentXhr) currentXhr.abort();
              sc.remove();
              toast('Upload cancelled by user', 'info');
            };

            (async () => {
              try {
                // 1. Request Resumable Upload Session URL from GAS
                const initRes = await gasApi('initVideoUpload', {
                  clientName: c.name,
                  branch,
                  album,
                  filename: file.name,
                  mimeType: file.type || 'video/mp4',
                  fileSize: file.size,
                  origin: window.location.origin
                });

                if (!initRes || !initRes.success || !initRes.uploadUrl) {
                  // If the user has not deployed the updated gas/Code.gs yet (returns 'Invalid action'),
                  // automatically fallback to standard direct upload for smaller videos <= 20MB
                  if (initRes && initRes.error === 'Invalid action' && file.size <= 20 * 1024 * 1024) {
                    liveSpeed.textContent = 'Using direct video stream...';
                    const base64Data = await new Promise((res, rej) => {
                      const reader = new FileReader();
                      reader.onload = () => res(reader.result);
                      reader.onerror = () => rej(new Error('Failed to read video file'));
                      reader.readAsDataURL(file);
                    });

                    if (aborted) return;
                    const fallbackRes = await gasApiWithProgress('uploadVideo', {
                      clientName: c.name,
                      clientId: c.id,
                      branch,
                      album,
                      title,
                      year,
                      month,
                      date,
                      dur,
                      coverUrl,
                      base64Data,
                      filename: file.name,
                      mimeType: file.type || 'video/mp4'
                    }, prog => {
                      if (aborted) return;
                      liveBar.style.width = prog.percent + '%';
                      livePct.textContent = prog.percent + '%';
                      const loadedMB = (prog.loaded / (1024 * 1024)).toFixed(1);
                      const totalMB = (prog.total / (1024 * 1024)).toFixed(1);
                      liveBytes.textContent = `${loadedMB} MB of ${totalMB} MB transferred`;
                    });

                    if (!fallbackRes || !fallbackRes.success) {
                      throw new Error((fallbackRes && fallbackRes.error) || 'Upload failed');
                    }

                    const publishedReel = fallbackRes.reel || {
                      id: 'r' + Date.now().toString(36),
                      c: c.id,
                      type: 'reel',
                      y: year,
                      m: month,
                      b: branch,
                      album,
                      title,
                      date,
                      url: fallbackRes.viewUrl || `https://drive.google.com/file/d/${fallbackRes.fileId}/view`,
                      fileId: fallbackRes.fileId,
                      dur,
                      coverUrl,
                      hidden: false,
                      status,
                      views: 0,
                      downloads: 0,
                      sample: false,
                      thumbnailGenerated: true
                    };

                    liveBar.style.width = '100%';
                    livePct.textContent = '100%';
                    stageCloud.className = 'live-stage-item done';
                    sc.querySelector('#stage-cloud-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                    liveSpeed.textContent = 'Published successfully!';

                    if (!DATA.reels) DATA.reels = [];
                    DATA.reels.unshift(publishedReel);
                    persist('Video published to Google Drive!');
                    setTimeout(() => sc.remove(), 600);
                    return;
                  }

                  if (initRes && initRes.error === 'Invalid action') {
                    throw new Error('This video is ' + (file.size / (1024 * 1024)).toFixed(1) + ' MB. Direct Google Drive streaming requires deploying the updated Code.gs in script.google.com (tab 5). Please update your Apps Script deployment.');
                  }

                  throw new Error((initRes && initRes.error) || 'Could not initialize resumable Drive session');
                }

                if (aborted) return;

                // 2. Stream raw binary File directly to Google Drive
                const startTime = Date.now();
                const driveFileJson = await new Promise((resolve, reject) => {
                  const xhr = new XMLHttpRequest();
                  currentXhr = xhr;
                  xhr.open('PUT', initRes.uploadUrl, true);
                  xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

                  xhr.upload.onprogress = e => {
                    if (aborted || !e.lengthComputable) return;
                    const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
                    liveBar.style.width = pct + '%';
                    livePct.textContent = pct + '%';

                    const loadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
                    const totalMB = (e.total / (1024 * 1024)).toFixed(1);
                    liveBytes.textContent = `${loadedMB} MB of ${totalMB} MB transferred`;

                    const elapsedSec = (Date.now() - startTime) / 1000;
                    if (elapsedSec > 0.5 && e.loaded > 0) {
                      const speed = (e.loaded / (1024 * 1024) / elapsedSec).toFixed(1);
                      const remBytes = e.total - e.loaded;
                      const remSec = Math.max(1, Math.round(remBytes / (e.loaded / elapsedSec)));
                      const remMin = remSec >= 60 ? `${Math.floor(remSec / 60)}m ${remSec % 60}s` : `${remSec}s`;
                      liveSpeed.textContent = `${speed} MB/s · ${remMin} remaining`;
                    }
                  };

                  xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                      try {
                        resolve(JSON.parse(xhr.responseText));
                      } catch (err) {
                        reject(new Error('Invalid response from Google Drive upload'));
                      }
                    } else {
                      reject(new Error(`Google Drive upload returned HTTP ${xhr.status}`));
                    }
                  };

                  xhr.onerror = () => reject(new Error('Network error during direct Google Drive stream'));
                  xhr.onabort = () => reject(new Error('Upload cancelled'));
                  xhr.send(file);
                });

                if (aborted) return;

                // 3. Finalize permissions & save metadata via GAS
                stageUpload.className = 'live-stage-item done';
                sc.querySelector('#stage-upload-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                stageCloud.className = 'live-stage-item active';
                sc.querySelector('#stage-cloud-icon').textContent = '→';
                liveSpeed.textContent = 'Finalizing Google Drive permissions...';

                const reelId = 'r' + Date.now().toString(36);
                const fileId = driveFileJson.id;
                const finalCover = coverUrl || `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;

                const finRes = await gasApi('finalizeVideoUpload', {
                  id: reelId,
                  fileId,
                  clientId: c.id,
                  clientName: c.name,
                  branch,
                  album,
                  title,
                  year,
                  month,
                  date,
                  dur,
                  coverUrl: finalCover,
                  status
                });

                const publishedReel = (finRes && finRes.reel) || {
                  id: reelId,
                  c: c.id,
                  type: 'reel',
                  y: year,
                  m: month,
                  b: branch,
                  album,
                  title,
                  date,
                  url: `https://drive.google.com/file/d/${fileId}/view`,
                  fileId,
                  dur,
                  coverUrl: finalCover,
                  hidden: false,
                  status,
                  views: 0,
                  downloads: 0,
                  sample: false,
                  thumbnailGenerated: true
                };

                liveBar.style.width = '100%';
                livePct.textContent = '100%';
                stageCloud.className = 'live-stage-item done';
                sc.querySelector('#stage-cloud-icon').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                liveSpeed.textContent = 'Published successfully!';

                if (!DATA.reels) DATA.reels = [];
                DATA.reels.unshift(publishedReel);
                persist('Video published to Google Drive!');
                setTimeout(() => sc.remove(), 600);
              } catch (err) {
                if (aborted) return;
                toast('Upload failed: ' + (err.message || 'Check GAS deployment'), 'error');
                setTimeout(() => sc.remove(), 1200);
              }
            })();
          }
        };
      });
    }

    function openEditReel(id) {
      const r = (DATA.reels || []).find(x => x.id === id);
      if (!r) return;
      const c = client();

      sheet(`
        <h4>Edit Reel · ${esc(r.title)}</h4>
        <div class="field">
          <label for="e-title">Reel Title</label>
          <input id="e-title" value="${esc(r.title)}">
        </div>
        <div class="field">
          <label for="e-url">Video Link</label>
          <input id="e-url" value="${esc(r.url)}">
        </div>
        <div class="field">
          <label for="e-cover">Cover / Thumbnail URL</label>
          <input id="e-cover" value="${esc(r.coverUrl || '')}" placeholder="https://…">
        </div>
        <div class="row2">
          <div class="field">
            <label for="e-branch">Move Branch</label>
            <select id="e-branch">
              ${(c.branches || ['Main']).map(x => `<option ${x === r.b ? 'selected' : ''}>${esc(x)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="e-alb">Move Album</label>
            <select id="e-alb">
              ${(c.albums || ['General']).map(x => `<option ${x === r.album ? 'selected' : ''}>${esc(x)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label for="e-date">Date</label>
            <input id="e-date" type="date" value="${esc(r.date)}">
          </div>
          <div class="field">
            <label for="e-dur">Duration</label>
            <input id="e-dur" value="${esc(r.dur || '')}" placeholder="e.g. 0:45">
          </div>
        </div>
        <div class="field">
          <label for="e-status">Approval Status</label>
          <select id="e-status">
            <option value="approved" ${r.status === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="review" ${r.status === 'review' ? 'selected' : ''}>In Review</option>
            <option value="draft" ${r.status === 'draft' ? 'selected' : ''}>Draft</option>
          </select>
        </div>
        <button class="go" id="e-save">Save Changes</button>
        <button class="ghost" data-close>Cancel</button>`, sc => {
        sc.querySelector('#e-save').onclick = async () => {
          r.title = sc.querySelector('#e-title').value.trim();
          r.url = sc.querySelector('#e-url').value.trim();
          r.coverUrl = sc.querySelector('#e-cover').value.trim();
          r.b = sc.querySelector('#e-branch').value;
          r.album = sc.querySelector('#e-alb').value;
          r.date = sc.querySelector('#e-date').value;
          r.dur = sc.querySelector('#e-dur').value.trim();
          r.status = sc.querySelector('#e-status').value;

          if (CONFIG.gasUrl) {
            gasApi('modifyReel', { reel: r }).catch(() => {});
          }
          persist('Reel updated successfully');
        };
      });
    }

    // 4. CLIENTS & DEDICATED URLS (Own Link, Own Loading Animation, D1 Logo)
    function openClients() {
      sheet(`
        <h4>Client Profiles &amp; Dedicated URLs</h4>
        <p>Each client gets their own URL, customized loading animation, and PIN.</p>
        <div class="clist">
          ${(DATA.clients || []).map(c => {
            const clientUrl = location.origin + location.pathname + '?client=' + (c.slug || c.id);
            return `
              <div class="citem">
                <span class="lg">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : ''}</span>
                <div>
                  <b>${esc(c.name)}</b>
                  <small>URL: <code>?${esc(c.slug || c.id)}</code> · PIN: <code>${esc(c.code)}</code></small>
                  <small style="color:var(--navy);margin-top:2px;">Animation: ${esc(c.animStyle || 'confetti')}</small>
                </div>
                <button data-edit="${c.id}">Edit</button>
              </div>`;
          }).join('')}
        </div>
        <button class="go" id="c-new">+ Add New Client</button>
        <button class="ghost" data-close>Close</button>`, sc => {
        sc.querySelector('#c-new').onclick = () => openClientForm(null);
        sc.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openClientForm(b.dataset.edit));
      });
    }

    function openClientForm(id) {
      const c = (DATA.clients || []).find(x => x.id === id) || {
        name: '', slug: '', code: '', logo: '', tagline: '', accent: '',
        animStyle: 'confetti', branches: [], albums: []
      };
      let logo = c.logo || '';

      sheet(`
        <h4>${id ? 'Edit Client' : 'New Client'}</h4>
        <div class="field">
          <label for="c-name">Client Name</label>
          <input id="c-name" value="${esc(c.name)}" placeholder="e.g. Client Name">
        </div>
        <div class="row2">
          <div class="field">
            <label for="c-slug">Client Dedicated URL Slug</label>
            <input id="c-slug" value="${esc(c.slug || '')}" placeholder="e.g. client-slug">
          </div>
          <div class="field">
            <label for="c-code">4-Digit PIN</label>
            <input id="c-code" inputmode="numeric" maxlength="4" value="${esc(c.code)}" placeholder="PIN">
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label for="c-anim">Client Loading Animation</label>
            <select id="c-anim">
              <option value="confetti" ${c.animStyle === 'confetti' ? 'selected' : ''}>Festive Confetti Burst</option>
              <option value="pulse" ${c.animStyle === 'pulse' ? 'selected' : ''}>Golden Mandala Pulse</option>
              <option value="shimmer" ${c.animStyle === 'shimmer' ? 'selected' : ''}>Editorial Shimmer</option>
              <option value="rings" ${c.animStyle === 'rings' ? 'selected' : ''}>Concentric Rings</option>
            </select>
          </div>
          <div class="field">
            <label for="c-accent">Rainbow Accent Word</label>
            <input id="c-accent" value="${esc(c.accent)}" placeholder="celebrations">
          </div>
        </div>
        <div class="field">
          <label for="c-tag">Brand Tagline</label>
          <input id="c-tag" value="${esc(c.tagline)}" placeholder="Let the celebrations begin!">
        </div>
        <div class="field">
          <label for="c-branches">Branches (Comma Separated, or leave empty)</label>
          <input id="c-branches" value="${esc((c.branches || []).join(', '))}" placeholder="e.g. T. Nagar, Velachery (leave empty if none)">
        </div>
        <div class="field">
          <label for="c-albums">Albums / Collections (Comma Separated, or leave empty)</label>
          <input id="c-albums" value="${esc((c.albums || []).join(', '))}" placeholder="e.g. Diwali 2026, Bridal Edit">
        </div>
        <div class="field">
          <label for="c-logo">Logo (Image Upload or Paste URL)</label>
          <div class="logo-prev">
            <div class="box" id="c-prev">${logo ? `<img src="${esc(logo)}" alt="">` : 'No logo'}</div>
            <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
              <input id="c-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">
              <input id="c-logo-url" value="${logo && !logo.startsWith('data:') ? esc(logo) : ''}" placeholder="Or paste logo image URL">
            </div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:6px;">
          <button class="go" style="flex:1;" id="c-save">Save Client</button>
          ${id ? `<button class="ghost" id="c-del" style="color:var(--red);border-color:#FCDAD7;">Delete</button>` : ''}
          <button class="ghost" data-close>Cancel</button>
        </div>`, sc => {
        sc.querySelector('#c-logo').onchange = e => {
          const f = e.target.files[0];
          if (!f) return;
          if (f.size > 2e6) { toast('Logo must be under 2 MB', 'amber'); return; }
          const fr = new FileReader();
          fr.onload = () => {
            logo = fr.result;
            sc.querySelector('#c-prev').innerHTML = `<img src="${logo}" alt="">`;
            sc.querySelector('#c-logo-url').value = '';
          };
          fr.readAsDataURL(f);
        };

        sc.querySelector('#c-logo-url').oninput = e => {
          const val = e.target.value.trim();
          if (val) {
            logo = val;
            sc.querySelector('#c-prev').innerHTML = `<img src="${esc(val)}" alt="">`;
          }
        };

        const delBtn = sc.querySelector('#c-del');
        if (delBtn) {
          delBtn.onclick = () => {
            confirmModal('Delete Client?', `Are you sure you want to delete ${c.name}? All delivered reels will also be deleted.`, () => {
              DATA.deletedClientIds = DATA.deletedClientIds || [];
              if (!DATA.deletedClientIds.includes(c.id)) DATA.deletedClientIds.push(c.id);
              DATA.clients = (DATA.clients || []).filter(x => x.id !== c.id);
              DATA.reels = (DATA.reels || []).filter(x => x.c !== c.id);
              if (CONFIG.gasUrl) gasApi('deleteClient', { id: c.id }).catch(() => {});
              persist('Client deleted');
            }, 'Delete Client', true);
          };
        }

        sc.querySelector('#c-save').onclick = () => {
          const name = sc.querySelector('#c-name').value.trim();
          const slug = sc.querySelector('#c-slug').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const code = sc.querySelector('#c-code').value.trim();
          const branches = sc.querySelector('#c-branches').value.split(',').map(x => x.trim()).filter(Boolean);
          const albums = sc.querySelector('#c-albums').value.split(',').map(x => x.trim()).filter(Boolean);
          const animStyle = sc.querySelector('#c-anim').value;

          if (!name) { toast('Client name required', 'amber'); return; }
          if (!/^\d{4}$/.test(code)) { toast('PIN must be exactly 4 digits', 'amber'); return; }

          const rec = {
            id: id || ('c' + Date.now().toString(36)),
            slug, name, code, logo, tagline: sc.querySelector('#c-tag').value.trim(),
            accent: sc.querySelector('#c-accent').value.trim(), animStyle, branches, albums
          };

          if (!DATA.clients) DATA.clients = [];
          if (id) {
            DATA.clients[DATA.clients.findIndex(x => x.id === id)] = rec;
          } else {
            DATA.clients.push(rec);
          }

          if (CONFIG.gasUrl) {
            gasApi('saveClient', { client: rec }).catch(() => {});
          }
          persist(id ? 'Client updated' : 'Client created with dedicated URL');
        };
      });
    }

    // 5. GOOGLE APPS SCRIPT & D1 CONNECTION CONFIG
    function openGasConfig() {
      sheet(`
        <h4>Cloud Engine Settings</h4>
        <p>Google Apps Script powers real-time Drive storage; Cloudflare D1 powers edge metadata.</p>
        <div class="field">
          <label for="f-gas-url">Apps Script Web App URL</label>
          <input id="f-gas-url" value="${esc(CONFIG.gasUrl)}">
        </div>
        <div class="field">
          <label for="f-gas-key">Admin Passkey</label>
          <input id="f-gas-key" type="password" value="${esc(CONFIG.adminPasskey)}">
        </div>
        <div class="status-badge" style="justify-content:center;margin-top:6px;">
          <span class="status-dot ${connectionState.status === 'online' ? 'online' : 'offline'}"></span>
          ${esc(connectionState.message)}
        </div>
        <button class="go" id="f-test-gas">Save &amp; Test Connection</button>
        <button class="ghost" data-close>Cancel</button>`, sc => {
        sc.querySelector('#f-test-gas').onclick = async () => {
          const url = sc.querySelector('#f-gas-url').value.trim();
          const key = sc.querySelector('#f-gas-key').value.trim();
          CONFIG.gasUrl = url;
          CONFIG.adminPasskey = key;
          localStorage.setItem('dn_gas_url', url);
          localStorage.setItem('dn_admin_passkey', key);
          toast('Testing connection...', 'info');
          await checkConnection();
          toast(connectionState.message, connectionState.status === 'online' ? 'success' : 'error');
          openAdmin();
        };
      });
    }

    // 6. FRONT PAGE BRANDING
    function openSettings() {
      const s = DATA.settings || {};
      sheet(`
        <h4>Front Page Branding</h4>
        <div class="field"><label for="s-agency">Agency Name</label><input id="s-agency" value="${esc(s.agency || '')}"></div>
        <div class="field"><label for="s-sub">Subtitle</label><input id="s-sub" value="${esc(s.agencySub || '')}"></div>
        <div class="field"><label for="s-slogan">Tagline</label><input id="s-slogan" value="${esc(s.slogan || '')}"></div>
        <button class="go" id="s-save">Save Branding</button>
        <button class="ghost" data-close>Cancel</button>`, sc => {
        sc.querySelector('#s-save').onclick = () => {
          DATA.settings = {
            agency: sc.querySelector('#s-agency').value.trim() || 'Day Night Media',
            agencySub: sc.querySelector('#s-sub').value.trim() || 'Production Company',
            slogan: sc.querySelector('#s-slogan').value.trim() || 'Creating impact that brands remember'
          };
          persist('Front page branding updated');
        };
      });
    }

    // --------------------------------------------------------------------------
    // GLOBAL EVENT DELEGATION
    // --------------------------------------------------------------------------
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const a = el.dataset.act;

      if (a === 'start' || a === 'skip-intro') {
        clearTimers();
        if (raf) cancelAnimationFrame(raf);
        const sp = app.querySelector('.splash');
        if (sp) sp.classList.add('ready');
        openCode(view.client ? client() : null);
      }
      else if (a === 'go-client') {
        const cid = el.dataset.cid;
        if (cid) {
          const matched = (DATA.clients || []).find(x => x.id === cid);
          if (matched) {
            view.client = matched.id;
            if (isClientAuthenticated(matched.id)) {
              go({ screen: 'landing', client: matched.id });
            } else {
              openCode(matched);
            }
          }
        }
      }
      else if (a === 'enter-client-portal') {
        clearTimers();
        if (raf) cancelAnimationFrame(raf);
        go({ screen: 'genesis', client: view.client });
      }
      else if (a === 'replay-intro') {
        go({ screen: 'landing', client: view.client });
      }
      else if (a === 'lock-portal') {
        if (view.client) {
          clearClientAuthentication(view.client);
          toast('Portal locked', 'info');
          openCode(client());
        }
      }
      else if (a === 'gear-click') verifyAdminAccess();
      else if (a === 'bnav-favorites') go({ screen: 'favorites', client: view.client, contentType: 'all', searchQuery: '' });
      else if (a === 'bnav-profile') go({ screen: 'profile', client: view.client });
      else if (a === 'toggle-fav') {
        e.stopPropagation();
        toggleFavorite(el.dataset.id);
      }
      else if (a === 'go-branch') {
        go({ screen: 'reels', branch: el.dataset.b, month: null, album: null, contentType: 'all', searchQuery: '' });
      }
      else if (a === 'open-approval-portal' || a === 'bnav-preapproval') {
        const c = client();
        if (c && !isClientAuthenticated(c.id)) {
          openCode(c, 'preapproval');
        } else {
          go({ screen: 'preapproval', client: view.client });
        }
      }
      else if (a === 'toggle-feed-autoplay') {
        e.preventDefault();
        e.stopPropagation();
        let currentVal = true;
        try { currentVal = localStorage.getItem('dn_feed_autoplay') !== 'false'; } catch(_) {}
        const newVal = !currentVal;
        try { localStorage.setItem('dn_feed_autoplay', newVal ? 'true' : 'false'); } catch(_) {}
        const btn = document.getElementById('feed-autoplay-toggle') || el.closest('.dn-ap-toggle-btn');
        if (btn) btn.classList.toggle('active', newVal);
        initFeedAutoplay();
        toast(newVal ? 'Autoplay on scroll enabled' : 'Autoplay on scroll paused', newVal ? 'success' : 'mute');
      }
      else if (a === 'toggle-feed-sound') {
        e.preventDefault();
        e.stopPropagation();
        isFeedAudioMuted = !isFeedAudioMuted;
        window.isFeedAudioMuted = isFeedAudioMuted;
        try { localStorage.setItem('dn_feed_muted', isFeedAudioMuted ? 'true' : 'false'); } catch(_) {}

        // Immediately synchronize all video elements and icons across the feed
        document.querySelectorAll('.dn-feed-media-wrap').forEach(w => {
          const v = w.querySelector('.dn-feed-video');
          if (v) v.muted = isFeedAudioMuted;
          const m = w.querySelector('.sound-icon-muted');
          const a = w.querySelector('.sound-icon-audio');
          if (m) m.style.display = isFeedAudioMuted ? 'inline-block' : 'none';
          if (a) a.style.display = isFeedAudioMuted ? 'none' : 'inline-block';
        });

        // If unmuting, ensure the current visible video is actively playing with sound
        const currentWrap = el.closest('.dn-feed-media-wrap');
        const currentVid = currentWrap ? currentWrap.querySelector('.dn-feed-video') : null;
        if (!isFeedAudioMuted && currentVid && currentVid.paused) {
          try {
            currentVid.play().then(() => {
              if (currentWrap) currentWrap.classList.add('is-playing');
            }).catch(() => {});
          } catch(_) {}
        }

        toast(isFeedAudioMuted ? 'Feed Muted' : 'Sound ON (All videos unmuted)', isFeedAudioMuted ? 'mute' : 'success');
      }
      else if (a === 'feed-media-click' || a === 'open-reel-modal') {
        e.preventDefault();
        e.stopPropagation();
        if (feedAutoplayObserver) {
          try { feedAutoplayObserver.disconnect(); } catch(_) {}
          feedAutoplayObserver = null;
        }
        document.querySelectorAll('.dn-feed-video').forEach(v => {
          try {
            v.pause();
            v.muted = true;
          } catch(_) {}
          const w = v.closest('.dn-feed-media-wrap');
          if (w) w.classList.remove('is-playing');
        });
        const reelId = el.dataset.id || el.closest('[data-id]')?.dataset.id || el.closest('[data-reel-id]')?.dataset.reelId;
        const r = (DATA.reels || []).find(x => x.id === reelId);
        if (r) {
          const c = client() || { id: 'tcs' };
          const activeList = !CONFIG.isAdmin
            ? (DATA.reels || []).filter(x => isClientMatch(x.c, c.id) && !x.hidden && x.status === 'approved')
            : (DATA.reels || []).filter(x => isClientMatch(x.c, c.id));
          openVideoModal(r, activeList.length ? activeList : [r]);
        }
      }
      else if (a === 'feed-comment') {
        if (feedAutoplayObserver) {
          try { feedAutoplayObserver.disconnect(); } catch(_) {}
          feedAutoplayObserver = null;
        }
        document.querySelectorAll('.dn-feed-video').forEach(v => {
          try {
            v.pause();
            v.muted = true;
          } catch(_) {}
          const w = v.closest('.dn-feed-media-wrap');
          if (w) w.classList.remove('is-playing');
        });
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (r) {
          const c = client() || { id: 'tcs' };
          const activeList = (DATA.reels || []).filter(x => isClientMatch(x.c, c.id) && (x.status === 'approved' || r.id === x.id));
          openVideoModal(r, activeList.length ? activeList : [r]);
        }
      }
      else if (a === 'feed-share') {
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (r && r.url) openShare(r);
      }
      else if (a === 'feed-download') {
        e.stopPropagation();
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (r) triggerDirectDownload(r);
      }
      else if (a === 'preapp-approve') {
        e.preventDefault();
        e.stopPropagation();
        const savedScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        const title = r ? `"${r.title}"` : 'this reel';
        confirmModal('Approve Reel', `Are you sure you want to approve ${title}? Once approved, it will be published to the client Reels gallery.`, () => {
          setReelApprovalStatus(el.dataset.id, 'approved');
        }, 'Approve Reel', false, savedScrollY);
      }
      else if (a === 'preapp-denied') {
        e.preventDefault();
        e.stopPropagation();
        const savedScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        const title = r ? `"${r.title}"` : 'this reel';
        confirmModal('Reject / Request Edits', `Are you sure you want to reject ${title} and request revisions?`, () => {
          setReelApprovalStatus(el.dataset.id, 'denied');
        }, 'Reject Reel', true, savedScrollY);
      }
      else if (a === 'preapp-sug-focus') {
        e.stopPropagation();
        const card = el.closest('.preapp-card, .preapp-list-card');
        const inp = card ? card.querySelector('.preapp-comment-inp') : null;
        if (inp) inp.focus();
      }
      else if (a === 'send-suggestion') {
        e.stopPropagation();
        const card = el.closest('.preapp-card, .preapp-list-card');
        const inp = card ? card.querySelector('.preapp-comment-inp') : null;
        if (inp && inp.value.trim()) {
          submitReelComment(el.dataset.id, inp.value.trim());
          inp.value = '';
        }
      }
      else if (a === 'open-comments') {
        e.stopPropagation();
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (r) openVideoModal(r);
      }
      else if (a === 'card-dots') {
        e.stopPropagation();
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (r) {
          const c = client() || { id: 'tcs' };
          const activeList = !CONFIG.isAdmin
            ? (DATA.reels || []).filter(x => isClientMatch(x.c, c.id) && !x.hidden && x.status === 'approved')
            : (DATA.reels || []).filter(x => isClientMatch(x.c, c.id));
          openVideoModal(r, activeList);
        }
      }
      else if (a === 'set-phase') {
        view.phase = el.dataset.phase;
        render();
      }
      else if (a === 'set-view-mode') {
        view.preappViewMode = el.dataset.mode;
        try { localStorage.setItem('dn_preapp_view_mode', view.preappViewMode); } catch(_) {}
        render();
      }
      else if (a === 'set-status-filter') {
        view.statusFilter = el.dataset.status;
        render();
      }
      else if (a === 'clear-history') {
        const c = client();
        if (c) {
          localStorage.removeItem('dn_history_' + c.id);
          toast('Watch history cleared', 'info');
          render();
        }
      }
      else if (a === 'bnav-home') go({ screen: 'genesis', client: view.client });
      else if (a === 'bnav-reels') go({ screen: 'reels', client: view.client, month: null, year: view.year || TODAY.getFullYear(), branch: null, album: null, contentType: 'all', selectedDay: null });
      else if (a === 'bnav-branches') go({ screen: 'branches', client: view.client, branch: null, album: null });
      else if (a === 'bnav-collections' || a === 'bnav-albums') go({ screen: 'collections', client: view.client, branch: null, album: null });
      else if (a === 'bnav-calendar') go({ screen: 'reels', client: view.client, month: (view.month != null ? view.month : TODAY.getMonth()), year: view.year || TODAY.getFullYear(), branch: null, album: null, contentType: 'stories', selectedDay: null });
      else if (a === 'open-month-dropdown') openMonthPicker();
      else if (a === 'open-wave-dropdown') {
        const c = client();
        openWavePicker(c);
      }
      else if (a === 'select-dropdown-wave') {
        const p = el.dataset.phase || 'all';
        view.preappPhase = p;
        view.phase = p;
        document.querySelectorAll('.scrim').forEach(s => s.remove());
        document.body.classList.remove('has-modal');
        document.documentElement.classList.remove('has-modal');
        render();
      }
      else if (a === 'open-branch-picker') {
        const c = client();
        openBranchPicker(c);
      }
      else if (a === 'select-dropdown-branch') {
        view.branch = (el.dataset.branch === 'all') ? null : el.dataset.branch;
        const scrim = document.querySelector('.branch-picker-scrim');
        if (scrim) scrim.remove();
        render();
      }
      else if (a === 'select-dropdown-month') {
        view.month = +el.dataset.m;
        const scrim = document.querySelector('.month-picker-scrim');
        if (scrim) scrim.remove();
        if (view.screen === 'genesis' || view.screen === 'preapproval') {
          render();
        } else {
          go({ screen: 'reels', month: view.month });
        }
      }
      else if (a === 'set-grid') {
        view.gridCols = +el.dataset.cols;
        render();
      }
      else if (a === 'clear-search') {
        view.searchQuery = '';
        render();
      }
      else if (a === 'back') {
        if (view.screen === 'reels') {
          go({ screen: 'genesis', client: view.client, month: null, branch: null, album: null });
        } else if (view.screen === 'branches' || view.screen === 'collections' || view.screen === 'albums' || view.screen === 'favorites' || view.screen === 'profile') {
          go({ screen: 'genesis', client: view.client });
        } else {
          go(BACK[view.screen] || { screen: 'genesis', client: view.client });
        }
      }
      else if (a === 'months') go({ screen: 'months' });
      else if (a === 'tab') { view.tabMode = el.dataset.tab; render(); }
      else if (a === 'year') go({ year: +el.dataset.y });
      else if (a === 'month') go({ screen: 'reels', month: +el.dataset.m, branch: null, album: null, contentType: 'reels', selectedDay: null });
      else if (a === 'branch') go({ screen: 'reels', branch: el.dataset.b, month: null, album: null, contentType: 'reels', selectedDay: null });
      else if (a === 'album') go({ screen: 'reels', album: el.dataset.alb, month: null, branch: null, contentType: 'reels', selectedDay: null });
      else if (a === 'set-ctype') { view.contentType = el.dataset.ctype; view.selectedDay = null; render(); }
      else if (a === 'select-cal-day') { const d = +el.dataset.day; view.selectedDay = (view.selectedDay === d ? null : d); render(); }
      else if (a === 'clear-cal-day') { view.selectedDay = null; render(); }
      else if (a === 'upload-image-prompt') { openClientImageUploadModal(el.dataset.type === 'stories' ? 'story' : 'poster'); }
      else if (a === 'view-image') {
        const it = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (it) openImageModal(it);
      }
      else if (a === 'cover-branch') {
        e.stopPropagation();
        const b = el.dataset.b;
        const c = client();
        if (c) openCoverModal(c, 'branch', b);
      }
      else if (a === 'cover-album') {
        e.stopPropagation();
        const alb = el.dataset.alb;
        const c = client();
        if (c) openCoverModal(c, 'album', alb);
      }
      else if (a === 'play-video') {
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (r) {
          const c = client() || { id: 'tcs' };
          const activeList = !CONFIG.isAdmin
            ? (DATA.reels || []).filter(x => isClientMatch(x.c, c.id) && !x.hidden && x.status === 'approved')
            : (DATA.reels || []).filter(x => isClientMatch(x.c, c.id));
          const pref = (function() { try { return localStorage.getItem('dn_player_mode'); } catch(_) { return null; } })();
          if (pref === 'legacy') openClassicPlayer(r, activeList);
          else openVideoModal(r, activeList);
        }
      }
      else if (a === 'share') {
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (r && r.url) openShare(r);
      }
      else if (a === 'direct-dl' || a === 'track-dl') {
        e.stopPropagation();
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (r) triggerDirectDownload(r);
      }
      else if (a === 'edit-reel') { openEditReel(el.dataset.id); }
      else if (a === 'toggle-hide') {
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (r) {
          r.hidden = !r.hidden;
          if (CONFIG.gasUrl) gasApi('toggleHideReel', { id: r.id }).catch(() => {});
          persist(r.hidden ? 'Reel hidden from client' : 'Reel visible to client');
        }
      }
      else if (a === 'del') {
        const r = (DATA.reels || []).find(x => x.id === el.dataset.id);
        if (!r) return;
        confirmModal('Remove this reel?', `"${r.title}" will be permanently removed from Google Drive.`, () => {
          DATA.deletedReelIds = DATA.deletedReelIds || [];
          if (!DATA.deletedReelIds.includes(r.id)) DATA.deletedReelIds.push(r.id);
          try { localStorage.setItem('dn_deleted_reel_ids', JSON.stringify(DATA.deletedReelIds)); } catch(e) {}
          DATA.reels = (DATA.reels || []).filter(x => x.id !== r.id);
          if (CONFIG.gasUrl) gasApi('deleteReel', { id: r.id }).catch(() => {});
          persist('Reel removed');
        }, 'Delete Reel', true);
      }
      else if (a === 'add') openAdd();
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const scrims = document.querySelectorAll('.scrim');
        if (scrims.length > 0) {
          scrims[scrims.length - 1].remove();
        }
        return;
      }
      if (e.key === 'Enter') {
        const inp = e.target.closest && e.target.closest('.preapp-comment-inp');
        if (inp) {
          e.preventDefault();
          const card = inp.closest('.preapp-card, .preapp-list-card');
          const sendBtn = card ? card.querySelector('[data-act="send-suggestion"]') : null;
          if (sendBtn) sendBtn.click();
          return;
        }
      }
    });

    // Check for direct client routing via URL query or hash:
    // e.g. /?client=tcs or /?c=tcs or /#tcs
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1' || urlParams.get('admin') === 'true') {
      window.location.href = '/admin';
      return;
    }
    const targetSlug = urlParams.get('client') || urlParams.get('c') || window.location.hash.replace(/^#[/]?/, '').toLowerCase();

    if (targetSlug) {
      const matchedClient = (DATA.clients || []).find(c => c.slug === targetSlug || c.id === targetSlug);
      if (matchedClient) {
        view.client = matchedClient.id;
        const logo = (matchedClient.id === 'tcs' ? '/Logo/tcs-logo.png' : (matchedClient.logo || '/Logo/logo.png'));
        setFavicon(logo);
        document.title = `${matchedClient.name} | DAY NIGHT`;

        // Persisted PIN check: if already authenticated, go to landing screen to showcase brand intro & animation!
        if (isClientAuthenticated(matchedClient.id)) {
          view.screen = 'landing';
        } else {
          view.screen = 'splash';
        }
      }
    }

    render();
    checkConnection();

  })();