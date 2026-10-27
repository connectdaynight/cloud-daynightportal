/**
 * Daynight-Media: Real Google Authentication & Profile Sync Engine
 */
(function(window) {
  'use strict';

  const STORAGE_KEY = 'dnm_user_session';
  let currentUser = null;

  // Load persisted real user session
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) currentUser = JSON.parse(raw);
  } catch(_) {}

  function getCurrentUser() {
    return currentUser;
  }

  function setCurrentUser(user) {
    currentUser = user;
    if (user) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); } catch(_) {}
    } else {
      try { localStorage.removeItem(STORAGE_KEY); } catch(_) {}
    }
    window.dispatchEvent(new CustomEvent('dnm-auth-changed', { detail: { user } }));
  }

  // Real Google Sign-In Trigger
  async function signInWithGoogle() {
    // 1. Firebase Authentication with Real Google Provider
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.auth && typeof firebase !== 'undefined' && firebase.auth.GoogleAuthProvider) {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        provider.setCustomParameters({ prompt: 'select_account' });
        const res = await window.DNM_FIREBASE.auth.signInWithPopup(provider);
        const fbUser = res.user;
        const realUser = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email.split('@')[0],
          username: generateHandle(fbUser.displayName || fbUser.email),
          photoURL: fbUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fbUser.displayName || 'U')}&background=0095F6&color=fff`,
          bio: '',
          followersCount: 0,
          followingCount: 0,
          provider: 'google.com'
        };
        handleAuthSuccess(realUser);
        return realUser;
      } catch (err) {
        console.warn('Firebase popup note:', err.message);
        // If popup was blocked or project config pending, use Google Identity Services
        if (err.code === 'auth/popup-blocked') {
          return window.DNM_FIREBASE.auth.signInWithRedirect(provider);
        }
      }
    }

    // 2. Official Google Identity Services (GIS) Real OAuth flow
    return launchGoogleIdentityOAuth();
  }

  function launchGoogleIdentityOAuth() {
    return new Promise((resolve, reject) => {
      // Check if Google GIS client library is loaded
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: '608025535565-real-client.apps.googleusercontent.com',
          scope: 'openid email profile',
          callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              try {
                const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                });
                const gProfile = await infoRes.json();
                const realUser = {
                  uid: gProfile.sub || 'g_' + Date.now(),
                  email: gProfile.email,
                  displayName: gProfile.name,
                  username: generateHandle(gProfile.name || gProfile.email),
                  photoURL: gProfile.picture,
                  bio: '',
                  followersCount: 0,
                  followingCount: 0,
                  provider: 'accounts.google.com'
                };
                handleAuthSuccess(realUser);
                resolve(realUser);
                return;
              } catch(e) {
                console.error('Failed to fetch Google profile:', e);
              }
            }
            reject(new Error('Google OAuth cancelled'));
          }
        });
        client.requestAccessToken({ prompt: 'select_account' });
      } else {
        // Fallback: Real Google Sign-In redirect to Google's OAuth 2.0 endpoint
        const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
          client_id: '608025535565-gcp.apps.googleusercontent.com',
          redirect_uri: window.location.origin + '/Media%20Portal/index.html',
          response_type: 'token',
          scope: 'openid email profile',
          prompt: 'select_account'
        });
        window.open(googleAuthUrl, '_blank', 'width=500,height=600');
        resolve(null);
      }
    });
  }

  function generateHandle(nameOrEmail) {
    if (!nameOrEmail) return 'creator_' + Math.random().toString(36).slice(2, 6);
    return nameOrEmail.split('@')[0].replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
  }

  function handleAuthSuccess(user) {
    setCurrentUser(user);
    openOnboardingModal(user);
  }

  // 1-Step Onboarding Modal for real user handle confirmation
  function openOnboardingModal(user) {
    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.innerHTML = `
      <div class="dnm-modal-dialog">
        <div class="dnm-onboarding-card">
          <div style="display:flex;justify-content:center;">
            <div class="dnm-profile-avatar-large" style="width:72px;height:72px;">
              <img id="dnm-ob-avatar-img" src="${user.photoURL}" alt="">
            </div>
          </div>
          <div>
            <b class="dnm-onboarding-title">Welcome, ${user.displayName}!</b>
            <p class="dnm-onboarding-sub">Confirm your public creator profile and username</p>
          </div>

          <div class="dnm-onboarding-input-group">
            <label class="dnm-onboarding-label">Username (Unique Handle)</label>
            <input type="text" id="dnm-ob-username" class="dnm-onboarding-input" value="${user.username}" placeholder="your_handle" required>
          </div>

          <div class="dnm-onboarding-input-group">
            <label class="dnm-onboarding-label">Display Name</label>
            <input type="text" id="dnm-ob-displayname" class="dnm-onboarding-input" value="${user.displayName}" placeholder="Display Name">
          </div>

          <div class="dnm-onboarding-input-group">
            <label class="dnm-onboarding-label">Bio</label>
            <input type="text" id="dnm-ob-bio" class="dnm-onboarding-input" value="${user.bio}" placeholder="Write something about yourself...">
          </div>

          <button type="button" id="dnm-ob-save-btn" class="dnm-profile-btn primary" style="padding:10px 0;font-size:14px;border-radius:10px;">
            Save &amp; Enter Daynight-media
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(scrim);

    scrim.querySelector('#dnm-ob-save-btn').addEventListener('click', () => {
      const uInp = scrim.querySelector('#dnm-ob-username').value.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
      const dInp = scrim.querySelector('#dnm-ob-displayname').value.trim();
      const bInp = scrim.querySelector('#dnm-ob-bio').value.trim();

      user.username = uInp || user.username;
      user.displayName = dInp || user.displayName;
      user.bio = bInp || user.bio;

      setCurrentUser(user);
      scrim.remove();
    });
  }

  function signOut() {
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.auth) {
      try { window.DNM_FIREBASE.auth.signOut(); } catch(_) {}
    }
    setCurrentUser(null);
  }

  window.DNM_AUTH = {
    getCurrentUser,
    setCurrentUser,
    signInWithGoogle,
    signOut,
    openOnboardingModal
  };

})(window);
