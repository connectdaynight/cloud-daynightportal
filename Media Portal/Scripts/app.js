/**
 * Daynight-Media: Main SPA Controller & Navigation Router
 */
(function(window) {
  'use strict';

  let currentTab = 'feed'; // 'feed', 'explore', 'reels', 'settings', 'profile'
  let activeBrandClient = null;

  async function init() {
    console.log('Daynight-Media Initializing with Real Server Data...');

    // Apply saved theme (Default is light / pristine white)
    const savedTheme = localStorage.getItem('dnm_theme');
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    
    // 1. Load Data Layer
    await window.DNM_DATA.loadData();

    // 2. Setup Top Header
    setupTopHeader();

    // 3. Setup Bottom Navigation
    setupBottomNav();

    // 4. Setup Global Search Bar
    setupGlobalSearch();

    // 5. Render Active Tab
    switchTab('feed', false);

    // 6. Smoothly Dismiss Signature App Loading Screen
    hideAppLoadingScreen();

    // 7. Listen for auth changes
    window.addEventListener('dnm-auth-changed', () => {
      updateUserAvatars();
      if (currentTab === 'profile') renderProfileTab();
      if (currentTab === 'settings') {
        const settingsView = document.querySelector('#dnm-tab-settings');
        if (settingsView && window.DNM_SETTINGS) window.DNM_SETTINGS.initSettingsPage(settingsView);
      }
    });

    // 8. SPA Browser History integration (prevents back button / gesture from quitting website)
    try {
      if (!history.state || !history.state.dnmTab) {
        history.replaceState({ dnmTab: 'feed' }, '');
      }
    } catch(_) {}

    window.addEventListener('popstate', (e) => {
      if (document.body.classList.contains('has-modal')) return;
      if (e.state && e.state.dnmTab) {
        activeBrandClient = e.state.brand || null;
        switchTab(e.state.dnmTab, false);
      } else {
        activeBrandClient = null;
        switchTab('feed', false);
      }
    });

    updateUserAvatars();
  }

  function setupTopHeader() {
    const logo = document.querySelector('#dnm-header-logo');
    if (logo) {
      logo.addEventListener('click', e => {
        e.preventDefault();
        activeBrandClient = null;
        switchTab('feed');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    const searchBtn = document.querySelector('#dnm-btn-search-header');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => switchTab('explore'));
    }

    const themeToggleBtn = document.querySelector('#dnm-btn-theme-toggle');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('dnm_theme', 'light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem('dnm_theme', 'dark');
        }
      });
    }

    // Intelligent Smart Header Scroll Hide/Reveal
    initSmartHeaderScroll();
  }

  function initSmartHeaderScroll() {
    let lastScrollY = window.scrollY || 0;
    let ticking = false;
    let downAccum = 0;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentY = window.scrollY || document.documentElement.scrollTop || 0;
          const topHeader = document.querySelector('.dnm-top-header');
          if (!topHeader) {
            lastScrollY = currentY;
            ticking = false;
            return;
          }

          // Always show header at top of the page or inside active modals
          if (currentY <= 25 || document.querySelector('.dnm-scrim.active')) {
            topHeader.classList.remove('dnm-header-hidden');
            downAccum = 0;
            lastScrollY = currentY;
            ticking = false;
            return;
          }

          const diff = currentY - lastScrollY;

          if (diff > 0) {
            // Scrolling DOWN: accumulate downward scroll
            downAccum += diff;
            if (downAccum > 15 && currentY > 45) {
              topHeader.classList.add('dnm-header-hidden');
            }
          } else if (diff < -2) {
            // Scrolling UP: instantly bring header back!
            downAccum = 0;
            topHeader.classList.remove('dnm-header-hidden');
          }

          lastScrollY = currentY;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  function setupBottomNav() {
    const navItems = document.querySelectorAll('.dnm-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        if (tab === 'upload') {
          window.DNM_UPLOAD.openUploadModal();
        } else if (tab === 'reels') {
          // Launch immersive full-screen video playback directly!
          const allReels = window.DNM_DATA.getAllApprovedReels();
          if (allReels && allReels.length && window.DNM_PLAYER) {
            window.DNM_PLAYER.openVideoPlaybackModal(allReels[0], allReels);
          }
        } else {
          activeBrandClient = null;
          switchTab(tab);
        }
      });
    });
  }

  function switchTab(tab, shouldPushHistory = true) {
    if (tab === 'reels') {
      const allReels = window.DNM_DATA.getAllApprovedReels();
      if (allReels && allReels.length && window.DNM_PLAYER) {
        window.DNM_PLAYER.openVideoPlaybackModal(allReels[0], allReels);
      }
      return;
    }

    currentTab = tab;

    if (shouldPushHistory) {
      try {
        history.pushState({ dnmTab: tab, brand: activeBrandClient }, '');
      } catch(_) {}
    }

    // Update bottom nav active state
    document.querySelectorAll('.dnm-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Hide all tab views
    document.querySelectorAll('.dnm-tab-view').forEach(view => {
      view.style.display = 'none';
      view.classList.remove('active');
    });

    // Show target tab view
    const targetView = document.querySelector(`#dnm-tab-${tab}`);
    if (targetView) {
      targetView.style.display = 'block';
      targetView.classList.add('active');

      if (tab === 'feed') {
        window.DNM_FEED.initFeed(targetView);
      } else if (tab === 'explore') {
        renderExploreGrid(targetView.querySelector('#dnm-explore-grid-wrap'));
      } else if (tab === 'settings') {
        if (window.DNM_SETTINGS) window.DNM_SETTINGS.initSettingsPage(targetView);
      } else if (tab === 'profile') {
        renderProfileTab(targetView);
      }
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Unified Instant Search Bar with Live Dropdown
  function setupGlobalSearch() {
    const input = document.querySelector('#dnm-global-search-inp');
    const dropdown = document.querySelector('#dnm-global-search-dropdown');
    const clearBtn = document.querySelector('#dnm-global-search-clear');
    if (!input || !dropdown) return;

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        dropdown.classList.remove('active');
        if (clearBtn) clearBtn.style.display = 'none';
        return;
      }

      if (clearBtn) clearBtn.style.display = 'flex';
      executeSearch(q, dropdown);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        dropdown.classList.remove('active');
        clearBtn.style.display = 'none';
      });
    }

    document.addEventListener('click', e => {
      if (!e.target.closest('.dnm-search-bar')) {
        dropdown.classList.remove('active');
      }
    });
  }

  function executeSearch(query, dropdown) {
    const reels = window.DNM_DATA.getAllApprovedReels();
    const clients = window.DNM_DATA.getClients();

    // Match accounts with real client data
    const matchAccounts = clients.filter(c => (c.name && c.name.toLowerCase().includes(query)) || (c.slug && c.slug.includes(query)));

    // Match reels
    const matchReels = reels.filter(r => (r.title && r.title.toLowerCase().includes(query)) || (r.b && r.b.toLowerCase().includes(query)));

    if (!matchAccounts.length && !matchReels.length) {
      dropdown.innerHTML = `
        <div style="padding:16px;text-align:center;color:var(--ig-text-muted);font-size:13px;">
          No accounts or reels found for "${query}"
        </div>
      `;
      dropdown.classList.add('active');
      return;
    }

    let html = '';

    if (matchAccounts.length) {
      html += '<div class="dnm-search-section-title">Verified Brand Accounts</div>';
      matchAccounts.forEach(c => {
        html += `
          <div class="dnm-search-result-item" data-action="open-client-brand" data-client="${c.id}">
            <img class="dnm-search-result-thumb" src="${c.logo || './Logo/logo.png'}" alt="">
            <div class="dnm-search-result-info">
              <span class="dnm-search-result-title">
                ${c.name}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--ig-verified)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              </span>
              <span class="dnm-search-result-sub">@${c.slug} &bull; Verified Partner</span>
            </div>
          </div>
        `;
      });
    }

    if (matchReels.length) {
      html += '<div class="dnm-search-section-title">Reels &amp; Videos</div>';
      matchReels.slice(0, 6).forEach(r => {
        html += `
          <div class="dnm-search-result-item" data-action="open-search-reel" data-reel-id="${r.id}">
            <img class="dnm-search-result-thumb square" src="${r.coverUrl || './Logo/logo.png'}" alt="">
            <div class="dnm-search-result-info">
              <span class="dnm-search-result-title">${r.title || 'Reel Video'}</span>
              <span class="dnm-search-result-sub">${r.b || 'Chennai'} &bull; ${(r.likes || 12).toLocaleString()} likes</span>
            </div>
          </div>
        `;
      });
    }

    dropdown.innerHTML = html;
    dropdown.classList.add('active');

    dropdown.querySelectorAll('[data-action="open-client-brand"]').forEach(item => {
      item.addEventListener('click', () => {
        dropdown.classList.remove('active');
        openBrandProfile(item.dataset.client);
      });
    });

    dropdown.querySelectorAll('[data-action="open-search-reel"]').forEach(item => {
      item.addEventListener('click', () => {
        dropdown.classList.remove('active');
        const reelId = item.dataset.reelId;
        const reels = window.DNM_DATA.getAllApprovedReels();
        const targetReel = reels.find(r => r.id === reelId);
        if (targetReel && window.DNM_PLAYER) {
          window.DNM_PLAYER.openVideoPlaybackModal(targetReel, reels);
        }
      });
    });
  }

  // Render Explore Grid with Real Media
  function renderExploreGrid(gridWrap) {
    if (!gridWrap) return;
    const reels = window.DNM_DATA.getAllApprovedReels();
    let html = '';
    reels.slice(0, 18).forEach((r, idx) => {
      const isTall = idx % 5 === 2;
      html += `
        <div class="dnm-explore-item ${isTall ? 'tall' : ''}" data-action="explore-click" data-id="${r.id}">
          <img class="dnm-explore-thumb" src="${r.coverUrl || './Logo/logo.png'}" alt="" loading="lazy">
          <div class="dnm-explore-reel-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
      `;
    });
    gridWrap.innerHTML = html;

    gridWrap.querySelectorAll('.dnm-explore-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const targetReel = reels.find(r => r.id === id);
        if (targetReel && window.DNM_PLAYER) {
          window.DNM_PLAYER.openVideoPlaybackModal(targetReel, reels);
        }
      });
    });
  }

  // Render User Profile / Brand Profile
  function renderProfileTab(profileContainer) {
    const wrap = profileContainer || document.querySelector('#dnm-tab-profile');
    if (!wrap) return;

    if (activeBrandClient) {
      renderBrandProfilePage(wrap, activeBrandClient);
      return;
    }

    const user = window.DNM_AUTH.getCurrentUser();
    if (!user) {
      wrap.innerHTML = `
        <!-- Profile Top Bar with Dedicated Settings Button -->
        <div class="dnm-profile-top-bar" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--ig-border);">
          <span style="font-size:16px;font-weight:700;color:var(--ig-text-primary);">Profile</span>
          <button type="button" class="dnm-profile-settings-btn" id="dnm-profile-settings-top-btn" aria-label="Settings" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;padding:7px 14px;border-radius:10px;background:var(--ig-surface);border:1px solid var(--ig-border);color:var(--ig-text-primary);cursor:pointer;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
            <span>Settings</span>
          </button>
        </div>

        <div style="padding:50px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px;">
          <div style="width:72px;height:72px;border-radius:50%;background:var(--ig-surface);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div>
            <b style="font-size:18px;color:var(--ig-text-primary);display:block;margin-bottom:6px;">Create Your Profile</b>
            <p style="font-size:13px;color:var(--ig-text-secondary);max-width:300px;line-height:1.5;">Sign in with your Google account to set your unique @username, upload videos and photos, and save reels.</p>
          </div>
          <button type="button" id="dnm-login-prompt-btn" class="dnm-profile-btn primary" style="width:auto;min-width:220px;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:10px;">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#FFF" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H8l4-5v4h3l-4 5z"/></svg>
            <span>Sign in with Google</span>
          </button>

          <button type="button" id="dnm-guest-settings-btn" class="dnm-profile-btn" style="width:auto;min-width:220px;padding:10px 24px;border-radius:12px;font-size:13.5px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--ig-surface);border:1px solid var(--ig-border);color:var(--ig-text-primary);cursor:pointer;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
            <span>Platform Settings</span>
          </button>
        </div>
      `;
      wrap.querySelector('#dnm-login-prompt-btn')?.addEventListener('click', () => {
        window.DNM_AUTH.signInWithGoogle();
      });
      wrap.querySelector('#dnm-profile-settings-top-btn')?.addEventListener('click', () => {
        switchTab('settings');
      });
      wrap.querySelector('#dnm-guest-settings-btn')?.addEventListener('click', () => {
        switchTab('settings');
      });
      return;
    }

    const userPosts = window.DNM_DATA.getUserPosts(user);

    wrap.innerHTML = `
      <!-- Profile Top Bar with Menu Drawer Button -->
      <div class="dnm-profile-top-bar" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--ig-border);">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;font-weight:700;color:var(--ig-text-primary);">@${user.username}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--ig-verified)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button type="button" class="dnm-profile-menu-btn" id="dnm-profile-slidebar-btn" aria-label="Open Menu" title="Menu" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;padding:6px;display:flex;align-items:center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- Slidebar Drawer Menu (Instagram-Style) -->
      <div class="dnm-slidebar-scrim" id="dnm-profile-slidebar">
        <div class="dnm-slidebar-drawer">
          <div class="dnm-slidebar-header">
            <span class="dnm-slidebar-title">Menu</span>
            <button type="button" class="dnm-slidebar-close" id="dnm-slidebar-close-btn">&times;</button>
          </div>
          <div class="dnm-slidebar-menu">
            <button type="button" class="dnm-slidebar-item" id="dnm-slidebar-saved-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              <span>Saved</span>
            </button>
            <button type="button" class="dnm-slidebar-item" id="dnm-slidebar-settings-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
              <span>Settings</span>
            </button>
            <button type="button" class="dnm-slidebar-item" id="dnm-slidebar-theme-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              <span>Switch Theme</span>
            </button>
            <button type="button" class="dnm-slidebar-item" id="dnm-slidebar-logout-btn" style="color:var(--ig-error);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </div>

      <div class="dnm-profile-header">
        <div class="dnm-profile-top-row">
          <div class="dnm-profile-avatar-large">
            <img src="${user.photoURL}" alt="">
          </div>
          <div class="dnm-profile-stats-row">
            <div class="dnm-stat-block">
              <span class="dnm-stat-number" id="dnm-user-posts-count">${userPosts.length}</span>
              <span class="dnm-stat-label">Posts</span>
            </div>
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">${user.followersCount || 0}</span>
              <span class="dnm-stat-label">Followers</span>
            </div>
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">${user.followingCount || 0}</span>
              <span class="dnm-stat-label">Following</span>
            </div>
          </div>
        </div>

        <div class="dnm-profile-bio-box">
          <span class="dnm-profile-fullname">${user.displayName}</span>
          <span class="dnm-profile-handle">@${user.username}</span>
          <p class="dnm-profile-bio">${user.bio || 'Verified Member on Daynight-media'}</p>
        </div>

        <div class="dnm-profile-actions-strip">
          <button type="button" id="dnm-edit-profile-btn" class="dnm-profile-btn">Edit Profile</button>
          <button type="button" id="dnm-settings-jump-btn" class="dnm-profile-btn">Settings</button>
        </div>
      </div>

      <!-- Segmented Tabs -->
      <div class="dnm-profile-tabs">
        <div class="dnm-profile-tab active" data-p-tab="posts" title="Posts">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        </div>
        <div class="dnm-profile-tab" data-p-tab="saved" title="Saved">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </div>
      </div>

      <div class="dnm-profile-grid" id="dnm-profile-grid-items"></div>
    `;

    let currentProfileTab = 'posts';

    function renderGridItems(tab) {
      currentProfileTab = tab || 'posts';
      const tabs = wrap.querySelectorAll('.dnm-profile-tab');
      tabs.forEach(t => {
        if (t.dataset.pTab === tab) t.classList.add('active');
        else t.classList.remove('active');
      });

      const grid = wrap.querySelector('#dnm-profile-grid-items');
      if (!grid) return;

      const currentOwn = window.DNM_DATA.getUserPosts(user);
      const countEl = wrap.querySelector('#dnm-user-posts-count');
      if (countEl) countEl.textContent = currentOwn.length;

      const items = tab === 'saved' ? window.DNM_DATA.getSavedPosts() : currentOwn;

      if (!items.length) {
        grid.innerHTML = `
          <div style="grid-column:span 3;padding:45px 20px;text-align:center;color:var(--ig-text-muted);">
            <p>${tab === 'saved' ? 'No saved items yet. Bookmark any reel or photo to see it here!' : 'No uploads yet. Tap (+) to upload your first reel or photo!'}</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = items.map(p => {
        const thumbSrc = window.DNM_DATA.getMediaUrl ? window.DNM_DATA.getMediaUrl(p) : (p.coverUrl || p.mediaUrl || '');
        const isPhotoItem = window.DNM_DATA.isPhoto(p);
        return `
          <div class="dnm-explore-item" data-post-id="${p.id}" style="cursor:pointer;position:relative;aspect-ratio:1;overflow:hidden;background:var(--ig-surface);">
            <img class="dnm-explore-thumb" src="${thumbSrc}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="if(this.src!=='${p.coverUrl}')this.src='${p.coverUrl}';">
            ${p.hidden ? `
              <div style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.75);color:#FFF;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700;display:flex;align-items:center;gap:3px;backdrop-filter:blur(4px);z-index:2;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                <span>Hidden</span>
              </div>
            ` : ''}
            ${!isPhotoItem ? `
              <div style="position:absolute;top:6px;right:6px;color:#FFF;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.8));z-index:2;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

      grid.querySelectorAll('.dnm-explore-item').forEach(card => {
        card.addEventListener('click', () => {
          const pid = card.dataset.postId;
          const targetItem = items.find(x => x.id === pid);
          if (!targetItem) return;

          if (tab === 'posts') {
            // User's own uploads: open full management options sheet (Play, Edit Caption, Hide, Delete)
            if (window.DNM_MODALS && window.DNM_MODALS.openPostManagementModal) {
              window.DNM_MODALS.openPostManagementModal(targetItem, () => {
                renderGridItems('posts');
              });
            } else if (window.DNM_PLAYER) {
              window.DNM_PLAYER.openVideoPlaybackModal(targetItem, items);
            }
          } else {
            // Saved posts: open immersive full-screen playback
            if (window.DNM_PLAYER) {
              window.DNM_PLAYER.openVideoPlaybackModal(targetItem, items);
            }
          }
        });
      });
    }

    // React to real-time post changes
    window.addEventListener('dnm-post-deleted', () => {
      renderGridItems(currentProfileTab || 'posts');
    });
    window.addEventListener('dnm-post-updated', () => {
      renderGridItems(currentProfileTab || 'posts');
    });

    // Initial render of user posts
    renderGridItems('posts');

    // Tab switcher
    wrap.querySelectorAll('.dnm-profile-tab').forEach(t => {
      t.addEventListener('click', () => {
        renderGridItems(t.dataset.pTab);
      });
    });

    // Slidebar drawer setup
    const slidebar = wrap.querySelector('#dnm-profile-slidebar');
    const slidebarBtn = wrap.querySelector('#dnm-profile-slidebar-btn');
    const closeBtn = wrap.querySelector('#dnm-slidebar-close-btn');

    function openSlidebar() {
      slidebar?.classList.add('active');
    }
    function closeSlidebar() {
      slidebar?.classList.remove('active');
    }

    slidebarBtn?.addEventListener('click', openSlidebar);
    closeBtn?.addEventListener('click', closeSlidebar);
    slidebar?.addEventListener('click', e => {
      if (e.target === slidebar) closeSlidebar();
    });

    wrap.querySelector('#dnm-slidebar-saved-btn')?.addEventListener('click', () => {
      closeSlidebar();
      renderGridItems('saved');
    });

    wrap.querySelector('#dnm-slidebar-settings-btn')?.addEventListener('click', () => {
      closeSlidebar();
      switchTab('settings');
    });

    wrap.querySelector('#dnm-slidebar-theme-btn')?.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('dnm_theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('dnm_theme', 'dark');
      }
      if (window.DNM_FEED && window.DNM_FEED.showToast) {
        window.DNM_FEED.showToast(`Switched to ${isDark ? 'light' : 'dark'} mode`);
      }
    });

    wrap.querySelector('#dnm-slidebar-logout-btn')?.addEventListener('click', () => {
      closeSlidebar();
      window.DNM_AUTH.signOut();
      switchTab('profile');
    });

    wrap.querySelector('#dnm-edit-profile-btn')?.addEventListener('click', () => {
      window.DNM_AUTH.openOnboardingModal(user);
    });

    wrap.querySelector('#dnm-settings-jump-btn')?.addEventListener('click', () => {
      switchTab('settings');
    });
  }

  function openBrandProfile(clientId) {
    activeBrandClient = clientId;
    switchTab('profile');
  }

  function renderBrandProfilePage(wrap, clientId) {
    const client = window.DNM_DATA.getClient(clientId) || {
      id: 'tcs',
      name: 'The Chennai Silks',
      slug: 'thechennaisilks',
      logo: '/Logo/tcs-logo.png',
      tagline: 'Leading textile retailer with extensive bridal, silk and heritage collections'
    };
    const brandReels = window.DNM_DATA.getClientReels(client.id);

    wrap.innerHTML = `
      <div style="padding:10px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--ig-border);">
        <button type="button" id="dnm-back-to-user-profile" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;display:flex;align-items:center;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span style="font-size:15px;font-weight:700;">@${client.slug}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--ig-verified)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      </div>

      <div class="dnm-profile-header">
        <div class="dnm-profile-top-row">
          <div class="dnm-profile-avatar-large" style="background:linear-gradient(135deg, #0095F6, #1FAF64);">
            <img src="${client.logo || './Logo/logo.png'}" alt="${client.name}">
          </div>
          <div class="dnm-profile-stats-row">
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">${brandReels.length}</span>
              <span class="dnm-stat-label">Reels</span>
            </div>
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">${client.branches ? client.branches.length : 0}</span>
              <span class="dnm-stat-label">Branches</span>
            </div>
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">${client.collections ? client.collections.length : 0}</span>
              <span class="dnm-stat-label">Collections</span>
            </div>
          </div>
        </div>

        <div class="dnm-profile-bio-box">
          <span class="dnm-profile-fullname">${client.name}</span>
          <span class="dnm-profile-handle">@${client.slug} &bull; Verified Brand</span>
          ${client.tagline ? `<p class="dnm-profile-bio">${client.tagline}</p>` : ''}
        </div>

        <div class="dnm-profile-actions-strip">
          <button type="button" class="dnm-profile-btn primary" id="dnm-brand-follow-btn">Follow Brand</button>
          <a href="https://daynight-portal.pages.dev/?client=${client.slug}" target="_blank" class="dnm-profile-btn" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span>Client Portal</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
      </div>

      <div class="dnm-profile-grid">
        ${brandReels.map(r => `
          <div class="dnm-explore-item" data-reel-id="${r.id}">
            <img class="dnm-explore-thumb" src="${r.coverUrl || './Logo/logo.png'}" alt="">
          </div>
        `).join('')}
      </div>
    `;

    wrap.querySelectorAll('.dnm-profile-grid .dnm-explore-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.reelId;
        const targetReel = brandReels.find(x => x.id === id);
        if (targetReel && window.DNM_PLAYER) {
          window.DNM_PLAYER.openVideoPlaybackModal(targetReel, brandReels);
        }
      });
    });

    wrap.querySelector('#dnm-back-to-user-profile')?.addEventListener('click', () => {
      activeBrandClient = null;
      renderProfileTab(wrap);
    });

    wrap.querySelector('#dnm-brand-follow-btn')?.addEventListener('click', e => {
      const btn = e.target;
      if (btn.textContent === 'Follow Brand') {
        btn.textContent = 'Following';
        btn.classList.remove('primary');
      } else {
        btn.textContent = 'Follow Brand';
        btn.classList.add('primary');
      }
    });
  }

  function hideAppLoadingScreen() {
    const loader = document.querySelector('#dnm-app-loading-screen');
    if (loader) {
      setTimeout(() => {
        loader.classList.add('dnm-loading-hidden');
        setTimeout(() => {
          if (loader.parentNode) loader.parentNode.removeChild(loader);
        }, 450);
      }, 350);
    }
  }

  function updateUserAvatars() {
    const user = window.DNM_AUTH.getCurrentUser();
    const avatarImg = document.querySelector('#dnm-nav-user-avatar');
    if (avatarImg) {
      avatarImg.src = user ? user.photoURL : './Logo/logo.png?v=2.6';
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  window.DNM_APP = {
    init,
    switchTab,
    openBrandProfile
  };

})(window);
