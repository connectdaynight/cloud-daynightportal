/**
 * Daynight-Media: Main SPA Controller & Navigation Router
 */
(function(window) {
  'use strict';

  let currentTab = 'feed'; // 'feed', 'explore', 'reels', 'pictures', 'profile'
  let activeBrandClient = null;

  async function init() {
    console.log('Daynight-Media Initializing...');
    
    // 1. Load Data Layer
    await window.DNM_DATA.loadData();

    // 2. Setup Top Header
    setupTopHeader();

    // 3. Setup Bottom Navigation
    setupBottomNav();

    // 4. Setup Global Search Bar
    setupGlobalSearch();

    // 5. Render Active Tab
    switchTab('feed');

    // 6. Listen for auth changes
    window.addEventListener('dnm-auth-changed', () => {
      updateUserAvatars();
      if (currentTab === 'profile') renderProfileTab();
    });

    updateUserAvatars();
  }

  function setupTopHeader() {
    const logo = document.querySelector('#dnm-header-logo');
    if (logo) {
      logo.addEventListener('click', e => {
        e.preventDefault();
        switchTab('feed');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    const searchBtn = document.querySelector('#dnm-btn-search-header');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => switchTab('explore'));
    }

    const notifBtn = document.querySelector('#dnm-btn-notif');
    if (notifBtn) {
      notifBtn.addEventListener('click', () => {
        alert('You are all caught up! New notifications will appear here.');
      });
    }
  }

  function setupBottomNav() {
    const navItems = document.querySelectorAll('.dnm-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        if (tab === 'upload') {
          window.DNM_UPLOAD.openUploadModal();
        } else {
          switchTab(tab);
        }
      });
    });
  }

  function switchTab(tab) {
    currentTab = tab;

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
      } else if (tab === 'reels') {
        window.DNM_REELS.initReelsTab(targetView.querySelector('#dnm-reels-feed-container'));
      } else if (tab === 'explore') {
        renderExploreGrid(targetView.querySelector('#dnm-explore-grid-wrap'));
      } else if (tab === 'pictures') {
        window.DNM_AI.initAIEngine(targetView);
      } else if (tab === 'profile') {
        renderProfileTab(targetView);
      }
    }

    // Scroll to top
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

    // Close dropdown on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('.dnm-search-bar')) {
        dropdown.classList.remove('active');
      }
    });
  }

  function executeSearch(query, dropdown) {
    const reels = window.DNM_DATA.getAllApprovedReels();
    const clients = [
      { id: 'tcs', name: 'The Chennai Silks', slug: 'thechennaisilks', logo: '/Logo/tcs-logo.png' },
      { id: 'shealin', name: 'Shealin Designers', slug: 'shealin', logo: '/Logo/logo.png' },
      { id: 'sarasaa', name: 'Sarasaa Saloon', slug: 'sarasaa', logo: '/Logo/logo.png' },
      { id: 'khalids', name: 'Khalids Multi Cuisine Restaurant', slug: 'khalids', logo: '/Logo/logo.png' },
      { id: 'vivaha', name: 'Vivaha Silks & Sarees', slug: 'vivaha', logo: '/Logo/logo.png' }
    ];

    // Filter accounts
    const matchAccounts = clients.filter(c => c.name.toLowerCase().includes(query) || c.slug.includes(query));

    // Filter reels
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
            <img class="dnm-search-result-thumb" src="${c.logo}" alt="">
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
      html += '<div class="dnm-search-section-title">Reels & Videos</div>';
      matchReels.slice(0, 6).forEach(r => {
        html += `
          <div class="dnm-search-result-item" data-action="open-search-reel" data-reel-id="${r.id}">
            <img class="dnm-search-result-thumb square" src="${r.coverUrl || '/Logo/logo.png'}" alt="">
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

    // Attach click events on search results
    dropdown.querySelectorAll('[data-action="open-client-brand"]').forEach(item => {
      item.addEventListener('click', () => {
        dropdown.classList.remove('active');
        openBrandProfile(item.dataset.client);
      });
    });

    dropdown.querySelectorAll('[data-action="open-search-reel"]').forEach(item => {
      item.addEventListener('click', () => {
        dropdown.classList.remove('active');
        switchTab('reels');
      });
    });
  }

  // Render Explore Grid
  function renderExploreGrid(gridWrap) {
    if (!gridWrap) return;
    const reels = window.DNM_DATA.getAllApprovedReels();
    let html = '';
    reels.slice(0, 18).forEach((r, idx) => {
      const isTall = idx % 5 === 2;
      html += `
        <div class="dnm-explore-item ${isTall ? 'tall' : ''}" data-action="explore-click" data-id="${r.id}">
          <img class="dnm-explore-thumb" src="${r.coverUrl || '/Logo/logo.png'}" alt="" loading="lazy">
          <div class="dnm-explore-reel-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
      `;
    });
    gridWrap.innerHTML = html;

    gridWrap.querySelectorAll('.dnm-explore-item').forEach(item => {
      item.addEventListener('click', () => switchTab('reels'));
    });
  }

  // Render User Profile / Brand Profile
  function renderProfileTab(profileContainer) {
    const wrap = profileContainer || document.querySelector('#dnm-tab-profile');
    if (!wrap) return;

    // Check if viewing a specific client brand page or the logged-in user
    if (activeBrandClient) {
      renderBrandProfilePage(wrap, activeBrandClient);
      return;
    }

    const user = window.DNM_AUTH.getCurrentUser();
    if (!user) {
      wrap.innerHTML = `
        <div style="padding:60px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px;">
          <div style="width:72px;height:72px;border-radius:50%;background:var(--ig-surface);display:flex;align-items:center;justify-content:center;">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div>
            <b style="font-size:18px;color:var(--ig-text-primary);display:block;margin-bottom:6px;">Create Your Profile</b>
            <p style="font-size:13px;color:var(--ig-text-secondary);max-width:300px;">Sign in with your Google account to set your unique @username, upload videos and photos, and save reels.</p>
          </div>
          <button type="button" id="dnm-login-prompt-btn" class="dnm-profile-btn primary" style="max-width:260px;padding:10px 0;border-radius:10px;font-size:14px;">
            Sign in with Google
          </button>
        </div>
      `;
      wrap.querySelector('#dnm-login-prompt-btn')?.addEventListener('click', () => {
        window.DNM_AUTH.signInWithGoogle();
      });
      return;
    }

    const userPosts = window.DNM_DATA.getCommunityPosts().filter(p => p.authorId === user.uid);
    const savedPosts = JSON.parse(localStorage.getItem('dnm_saved_posts') || '[]');

    wrap.innerHTML = `
      <div class="dnm-profile-header">
        <div class="dnm-profile-top-row">
          <div class="dnm-profile-avatar-large">
            <img src="${user.photoURL}" alt="">
          </div>
          <div class="dnm-profile-stats-row">
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">${userPosts.length}</span>
              <span class="dnm-stat-label">Posts</span>
            </div>
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">${user.followersCount || 18}</span>
              <span class="dnm-stat-label">Followers</span>
            </div>
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">${user.followingCount || 8}</span>
              <span class="dnm-stat-label">Following</span>
            </div>
          </div>
        </div>

        <div class="dnm-profile-bio-box">
          <span class="dnm-profile-fullname">${user.displayName}</span>
          <span class="dnm-profile-handle">@${user.username}</span>
          <p class="dnm-profile-bio">${user.bio || 'Creative Member on Daynight-media'}</p>
        </div>

        <div class="dnm-profile-actions-strip">
          <button type="button" id="dnm-edit-profile-btn" class="dnm-profile-btn">Edit Profile</button>
          <button type="button" id="dnm-signout-btn" class="dnm-profile-btn" style="color:var(--ig-heart);">Sign Out</button>
        </div>
      </div>

      <!-- Segmented Tabs -->
      <div class="dnm-profile-tabs">
        <div class="dnm-profile-tab active" data-p-tab="posts">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        </div>
        <div class="dnm-profile-tab" data-p-tab="saved">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </div>
      </div>

      <div class="dnm-profile-grid" id="dnm-profile-grid-items">
        ${userPosts.length ? userPosts.map(p => `
          <div class="dnm-explore-item">
            <img class="dnm-explore-thumb" src="${p.coverUrl || p.mediaUrl}" alt="">
          </div>
        `).join('') : `
          <div style="grid-column:span 3;padding:40px 20px;text-align:center;color:var(--ig-text-muted);">
            <p>No uploads yet. Tap (+) to upload your first reel or photo!</p>
          </div>
        `}
      </div>
    `;

    wrap.querySelector('#dnm-edit-profile-btn')?.addEventListener('click', () => {
      window.DNM_AUTH.openOnboardingModal(user);
    });

    wrap.querySelector('#dnm-signout-btn')?.addEventListener('click', () => {
      window.DNM_AUTH.signOut();
    });
  }

  function openBrandProfile(clientId) {
    activeBrandClient = clientId;
    switchTab('profile');
  }

  function renderBrandProfilePage(wrap, clientId) {
    const clients = [
      { id: 'tcs', name: 'The Chennai Silks', slug: 'thechennaisilks', logo: '/Logo/tcs-logo.png', bio: 'India’s largest textile kingdom with pure silk weaves, festive bridal wear & daily heritage collections.', branch: 'T. Nagar, Chennai' },
      { id: 'shealin', name: 'Shealin Designers', slug: 'shealin', logo: '/Logo/logo.png', bio: 'Boutique bridal couture, designer lehengas, and contemporary festive wear.', branch: 'Chennai, India' },
      { id: 'sarasaa', name: 'Sarasaa Saloon', slug: 'sarasaa', logo: '/Logo/logo.png', bio: 'Luxury family salon, bridal artistry & organic skin therapies.', branch: 'Coimbatore, India' },
      { id: 'khalids', name: 'Khalids Multi Cuisine Restaurant', slug: 'khalids', logo: '/Logo/logo.png', bio: 'Legendary authentic biryani and coastal specialties since 1998.', branch: 'Chennai, India' },
      { id: 'vivaha', name: 'Vivaha Silks & Sarees', slug: 'vivaha', logo: '/Logo/logo.png', bio: 'Exclusive handloom wedding silks and auspicious ceremonial sarees.', branch: 'Kanchipuram, India' }
    ];

    const brand = clients.find(c => c.id === clientId) || clients[0];
    const brandReels = window.DNM_DATA.getClientReels(brand.id);

    wrap.innerHTML = `
      <div style="padding:10px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--ig-border);">
        <button type="button" id="dnm-back-to-user-profile" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;display:flex;align-items:center;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span style="font-size:15px;font-weight:700;">@${brand.slug}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--ig-verified)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      </div>

      <div class="dnm-profile-header">
        <div class="dnm-profile-top-row">
          <div class="dnm-profile-avatar-large" style="background:linear-gradient(135deg, #0095F6, #1FAF64);">
            <img src="${brand.logo}" alt="">
          </div>
          <div class="dnm-profile-stats-row">
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">${brandReels.length || 50}</span>
              <span class="dnm-stat-label">Reels</span>
            </div>
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">284K</span>
              <span class="dnm-stat-label">Followers</span>
            </div>
            <div class="dnm-stat-block">
              <span class="dnm-stat-number">12</span>
              <span class="dnm-stat-label">Following</span>
            </div>
          </div>
        </div>

        <div class="dnm-profile-bio-box">
          <span class="dnm-profile-fullname">${brand.name}</span>
          <span class="dnm-profile-handle">@${brand.slug} &bull; Verified Brand</span>
          <p class="dnm-profile-bio">${brand.bio}</p>
        </div>

        <div class="dnm-profile-actions-strip">
          <button type="button" class="dnm-profile-btn primary" id="dnm-brand-follow-btn">Follow Brand</button>
          <a href="https://daynight-portal.pages.dev/?client=${brand.slug}" target="_blank" class="dnm-profile-btn" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span>Client Portal</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
      </div>

      <div class="dnm-profile-grid">
        ${brandReels.map(r => `
          <div class="dnm-explore-item" data-reel-id="${r.id}">
            <img class="dnm-explore-thumb" src="${r.coverUrl || '/Logo/logo.png'}" alt="">
          </div>
        `).join('')}
      </div>
    `;

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

  function updateUserAvatars() {
    const user = window.DNM_AUTH.getCurrentUser();
    const avatarImg = document.querySelector('#dnm-nav-user-avatar');
    if (avatarImg) {
      avatarImg.src = user ? user.photoURL : '/Logo/logo.png';
    }
  }

  // Bootstrap when DOM is ready
  document.addEventListener('DOMContentLoaded', init);

  window.DNM_APP = {
    init,
    switchTab,
    openBrandProfile
  };

})(window);
