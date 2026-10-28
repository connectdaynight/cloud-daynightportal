// Runtime Configuration Module
// This file is generated at build time with environment-specific values
// DO NOT COMMIT SECRETS - values are injected via build process

(function(window) {
  'use strict';

  // Build-time injected configuration (replaced during build)
  window.DNM_RUNTIME_CONFIG = {
    // API Endpoints
    apiBase: '/api',
    portalOrigin: typeof __PORTAL_ORIGIN__ !== 'undefined' ? __PORTAL_ORIGIN__ : 'https://daynight-portal.pages.dev',
    gasUrl: typeof __GAS_URL__ !== 'undefined' ? __GAS_URL__ : '',

    // Firebase Config (public-safe values only)
    firebaseConfig: typeof __FIREBASE_CONFIG__ !== 'undefined' ? __FIREBASE_CONFIG__ : {},

    // Environment
    environment: typeof __ENVIRONMENT__ !== 'undefined' ? __ENVIRONMENT__ : 'production',
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',

    // Feature Flags
    features: {
      useFirebase: true,
      useGAS: true,
      useOfflineCache: true,
      useServerSync: true,
      useServiceWorker: true,
      enableAnalytics: false
    },

    // Security
    security: {
      cspNonce: '',
      allowedOrigins: ['https://daynight-portal.pages.dev', 'https://drive.google.com', 'https://www.googleapis.com'],
      maxUploadSize: 100 * 1024 * 1024, // 100MB
      tokenRefreshBuffer: 5 * 60 * 1000 // 5 minutes
    }
  };

  // Helper functions
  window.DNM_CONFIG_HELPERS = {
    getApiUrl: function(path) {
      return window.DNM_RUNTIME_CONFIG.apiBase + path;
    },

    getGasUrl: function(action, params) {
      if (!window.DNM_RUNTIME_CONFIG.gasUrl) return '';
      const url = new URL(window.DNM_RUNTIME_CONFIG.gasUrl);
      url.searchParams.set('action', action);
      if (params) {
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      }
      return url.toString();
    },

    getStreamUrl: function(fileId, token) {
      const config = window.DNM_RUNTIME_CONFIG;
      const url = new URL(config.portalOrigin + '/api/video');
      url.searchParams.set('id', fileId);
      if (token) url.searchParams.set('token', token);
      url.searchParams.set('v', '3');
      return url.toString();
    },

    getFirebaseConfig: function() {
      return window.DNM_RUNTIME_CONFIG.firebaseConfig;
    },

    isFeatureEnabled: function(feature) {
      return window.DNM_RUNTIME_CONFIG.features[feature] === true;
    },

    getSecurityConfig: function() {
      return window.DNM_RUNTIME_CONFIG.security;
    }
  };

  // CSP Nonce Generator (for inline scripts)
  function generateNonce() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  window.DNM_RUNTIME_CONFIG.security.cspNonce = generateNonce();

})(window);