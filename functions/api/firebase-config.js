/**
 * Cloudflare Pages Function: /api/firebase-config
 * Serves Firebase configuration securely from environment variables
 * No API keys exposed in client code
 */

export async function onRequestGet(context) {
  const { env, request } = context;

  // Expose public Firebase web client config
  const config = {
    apiKey: env.FIREBASE_API_KEY || 'AIzaSyBt3eCmu_sGhfY01DiKgsTLqQrmq6EmDxw',
    authDomain: env.FIREBASE_AUTH_DOMAIN || 'daynight-media-portal.firebaseapp.com',
    projectId: env.FIREBASE_PROJECT_ID || 'daynight-media-portal',
    storageBucket: env.FIREBASE_STORAGE_BUCKET || 'daynight-media-portal.firebasestorage.app',
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '151346419700',
    appId: env.FIREBASE_APP_ID || '1:151346419700:web:dbe069eff93d27b1170ba1'
  };

  // Validate required config
  const missing = Object.entries(config).filter(([_, v]) => !v);
  if (missing.length > 0) {
    console.warn('[firebase-config] Missing config:', missing.map(([k]) => k));
  }

  // Set security headers
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });

  // CORS for same-origin only
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.PORTAL_ORIGIN || 'https://daynight-portal.pages.dev';
  if (origin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }

  return new Response(JSON.stringify(config), { headers });
}

// Also handle OPTIONS for CORS preflight
export async function onRequestOptions(context) {
  const { env, request } = context;
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  });

  const origin = request.headers.get('Origin');
  const allowedOrigin = env.PORTAL_ORIGIN || 'https://daynight-portal.pages.dev';
  if (origin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }

  return new Response(null, { status: 204, headers });
}