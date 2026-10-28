/**
 * Daynight-Media: Settings Page & Working Controls Engine
 */
(function(window) {
  'use strict';

  const settingsStorage = window.DNM_STORAGE_SETTINGS || (window.DNM_STORAGE_SETTINGS = new StorageAdapter({ namespace: 'settings' }));

  async function initSettingsPage(container) {
    if (!container) return;
    await renderSettings(container);
  }

  async function renderSettings(container) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Load preferences from StorageAdapter (Memory & Server sync)
    let isAutoplay = true;
    let isMutedDefault = true;
    let streamQuality = 'hd';
    try {
      isAutoplay = (await settingsStorage.getItem('autoplay')) !== false;
      isMutedDefault = (await settingsStorage.getItem('default_muted')) !== false;
      streamQuality = await settingsStorage.getItem('stream_quality') || 'hd';
    } catch (_) {}

    const user = window.DNM_AUTH.getCurrentUser();
    const reelsCount = window.DNM_DATA.getAllApprovedReels().length;
    const clients = window.DNM_DATA.getClients ? window.DNM_DATA.getClients() : [];

    container.innerHTML = `
      <div class="dnm-settings-container">
        <!-- Header with Back to Profile Navigation -->
        <div class="dnm-settings-header" style="display:flex;align-items:center;justify-content:space-between;">
          <button type="button" id="dnm-settings-back-btn" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;display:flex;align-items:center;padding:4px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div class="dnm-settings-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
            <span>Platform Settings</span>
          </div>
          <div style="width:24px;"></div>
        </div>

        <!-- 1. Account & Identity Section -->
        <div class="dnm-settings-section">
          <span class="dnm-settings-section-title">Google Account &amp; Identity</span>
          <div class="dnm-settings-row">
            <div class="dnm-settings-label-group">
              <span class="dnm-settings-label">${user ? user.displayName : 'Guest User'}</span>
              <span class="dnm-settings-desc">${user ? user.email : 'Sign in with your Google account'}</span>
            </div>
            ${user ? `
              <button type="button" class="dnm-settings-btn danger" id="dnm-btn-signout">
                <span>Sign Out</span>
              </button>
            ` : `
              <button type="button" class="dnm-settings-btn primary" id="dnm-btn-signin">
                <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#FFF" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H8l4-5v4h3l-4 5z"/></svg>
                <span>Google Sign-In</span>
              </button>
            `}
          </div>
        </div>

        <!-- 2. Display & Playback Preferences -->
        <div class="dnm-settings-section">
          <span class="dnm-settings-section-title">Preferences</span>
          
          <!-- Theme Switch -->
          <div class="dnm-settings-row">
            <div class="dnm-settings-label-group">
              <span class="dnm-settings-label">Dark Mode Theme</span>
              <span class="dnm-settings-desc">Switch between Dark and Light mode</span>
            </div>
            <label class="dnm-toggle-switch">
              <input type="checkbox" id="dnm-toggle-theme" ${isDark ? 'checked' : ''}>
              <span class="dnm-toggle-slider"></span>
            </label>
          </div>

          <!-- Autoplay on Scroll -->
          <div class="dnm-settings-row">
            <div class="dnm-settings-label-group">
              <span class="dnm-settings-label">Autoplay on Scroll</span>
              <span class="dnm-settings-desc">Play video automatically when card enters viewport</span>
            </div>
            <label class="dnm-toggle-switch">
              <input type="checkbox" id="dnm-toggle-autoplay" ${isAutoplay ? 'checked' : ''}>
              <span class="dnm-toggle-slider"></span>
            </label>
          </div>

          <!-- Default Audio State -->
          <div class="dnm-settings-row">
            <div class="dnm-settings-label-group">
              <span class="dnm-settings-label">Start Videos Muted</span>
              <span class="dnm-settings-desc">Prevent sudden audio when browsing feeds</span>
            </div>
            <label class="dnm-toggle-switch">
              <input type="checkbox" id="dnm-toggle-sound" ${isMutedDefault ? 'checked' : ''}>
              <span class="dnm-toggle-slider"></span>
            </label>
          </div>

          <!-- Stream Quality (Default Preference - Actual switching in Player) -->
          <div class="dnm-settings-row">
            <div class="dnm-settings-label-group">
              <span class="dnm-settings-label">Default Stream Quality</span>
              <span class="dnm-settings-desc">Used when opening videos (Player has per-video override)</span>
            </div>
            <button type="button" class="dnm-settings-btn ${streamQuality === 'auto' ? 'primary' : ''}" id="dnm-quality-auto" style="flex:1;">Auto</button>
            <button type="button" class="dnm-settings-btn ${streamQuality === '1080' ? 'primary' : ''}" id="dnm-quality-1080" style="flex:1;">1080p</button>
            <button type="button" class="dnm-settings-btn ${streamQuality === '720' ? 'primary' : ''}" id="dnm-quality-720" style="flex:1;">720p</button>
            <button type="button" class="dnm-settings-btn ${streamQuality === '480' ? 'primary' : ''}" id="dnm-quality-480" style="flex:1;">480p</button>
            <button type="button" class="dnm-settings-btn ${streamQuality === '360' ? 'primary' : ''}" id="dnm-quality-360" style="flex:1;">360p</button>
          </div>
        </div>

        <!-- 3. Data & Cache Actions -->
        <div class="dnm-settings-section">
          <span class="dnm-settings-section-title">Storage &amp; Actions</span>
          <div class="dnm-settings-row">
            <div class="dnm-settings-label-group">
              <span class="dnm-settings-label">Clear Cache &amp; History</span>
              <span class="dnm-settings-desc">Reset temporary local preferences and likes cache</span>
            </div>
            <button type="button" class="dnm-settings-btn danger" id="dnm-btn-clear-cache">
              <span>Clear Cache</span>
            </button>
          </div>
        </div>

        <!-- Platform Info -->
        <div style="text-align:center;padding:12px 0;font-size:11.5px;color:var(--ig-text-muted);">
          <span>Daynight-media Platform &bull; Production v2.4.0</span>
        </div>
      </div>
    `;

    attachSettingsEvents(container);
  }

  function attachSettingsEvents(container) {
    // Back to Profile
    const backBtn = container.querySelector('#dnm-settings-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (window.DNM_APP) window.DNM_APP.switchTab('profile');
      });
    }

    // 1. Dark Mode Theme Toggle
    const themeToggle = container.querySelector('#dnm-toggle-theme');
    if (themeToggle) {
      themeToggle.addEventListener('change', async e => {
        const dark = e.target.checked;
        if (dark) {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
        }
        try {
          await settingsStorage.setItem('theme', dark ? 'dark' : 'light');
        } catch (_) {}
      });
    }

    // 2. Autoplay Toggle
    const autoToggle = container.querySelector('#dnm-toggle-autoplay');
    if (autoToggle) {
      autoToggle.addEventListener('change', async e => {
        try {
          await settingsStorage.setItem('autoplay', e.target.checked);
        } catch (_) {}
      });
    }

    // 3. Sound Toggle
    const soundToggle = container.querySelector('#dnm-toggle-sound');
    if (soundToggle) {
      soundToggle.addEventListener('change', async e => {
        try {
          await settingsStorage.setItem('default_muted', e.target.checked);
        } catch (_) {}
      });
    }

    // 4. Stream Quality Buttons (Auto, 1080p, 720p, 480p, 360p)
    const qualityBtns = container.querySelectorAll('[id^="dnm-quality-"]');
    qualityBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const quality = btn.id.replace('dnm-quality-', '');
        try {
          await settingsStorage.setItem('stream_quality', quality);
        } catch (_) {}
        qualityBtns.forEach(b => b.classList.remove('primary'));
        btn.classList.add('primary');
      });
    });

    // 5. Sign In / Sign Out
    const signinBtn = container.querySelector('#dnm-btn-signin');
    if (signinBtn) {
      signinBtn.addEventListener('click', () => {
        window.DNM_AUTH.signInWithGoogle();
      });
    }

    const signoutBtn = container.querySelector('#dnm-btn-signout');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', () => {
        window.DNM_AUTH.signOut();
        renderSettings(container);
      });
    }

    // 7. Clear Cache
    const clearBtn = container.querySelector('#dnm-btn-clear-cache');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        // Clear via StorageAdapter
        try {
          const feedStorage = window.DNM_STORAGE_FEED || (window.DNM_STORAGE_FEED = new StorageAdapter({ namespace: 'feed' }));
          const reelsStorage = window.DNM_STORAGE_REELS || (window.DNM_STORAGE_REELS = new StorageAdapter({ namespace: 'reels' }));
          await feedStorage.removeItem('liked_posts');
          await feedStorage.removeItem('saved_posts');
          await reelsStorage.removeItem('following_set');
          await settingsStorage.removeItem('theme');
          await settingsStorage.removeItem('autoplay');
          await settingsStorage.removeItem('default_muted');
          await settingsStorage.removeItem('stream_quality');
        } catch (_) {}
        alert('Cache cleared successfully!');
      });
    }
  }

  window.DNM_SETTINGS = {
    initSettingsPage
  };

})(window);
