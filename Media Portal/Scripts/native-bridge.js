/**
 * Daynight-Media: Intelligent Native Kotlin & Capacitor App Bridge
 * Identifies native environments (Kotlin WebView, Capacitor, Cordova, standalone PWA),
 * optimizes viewport scaling, safe-area insets, back button dispatching, and haptics.
 */
(function(window) {
  'use strict';

  const ua = navigator.userAgent || '';
  const urlParams = new URLSearchParams(window.location.search);

  // 1. Intelligent Environment Identification
  const isCapacitor = typeof window.Capacitor !== 'undefined' || /Capacitor/i.test(ua);
  const isAndroidBridge = typeof window.Android !== 'undefined' || typeof window.AndroidInterface !== 'undefined';
  const isAndroidWebView = /Android.*(wv|Version\/4\.0)/i.test(ua) || (isCapacitor && /Android/i.test(ua));
  const isIOSWebView = /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua) || (isCapacitor && /iPhone|iPad/i.test(ua));
  const isQueryNative = urlParams.get('platform') === 'native' || urlParams.get('platform') === 'capacitor' || urlParams.get('platform') === 'android' || urlParams.get('app') === 'true';
  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;

  const isNativeApp = isCapacitor || isAndroidBridge || isAndroidWebView || isIOSWebView || isQueryNative;
  const isAndroid = isAndroidBridge || isAndroidWebView || /Android/i.test(ua);
  const isIOS = isIOSWebView || /iPhone|iPad|iPod/i.test(ua);

  // 2. Mark Root DOM for responsive CSS targeting
  function applyDomClasses() {
    const docEl = document.documentElement;
    const body = document.body;

    if (isNativeApp) {
      docEl.classList.add('dnm-native-app');
      if (body) body.classList.add('dnm-native-app');
    }
    if (isCapacitor) {
      docEl.classList.add('dnm-capacitor-app');
      if (body) body.classList.add('dnm-capacitor-app');
    }
    if (isAndroid) {
      docEl.classList.add('dnm-android-native');
      if (body) body.classList.add('dnm-android-native');
    }
    if (isIOS) {
      docEl.classList.add('dnm-ios-native');
      if (body) body.classList.add('dnm-ios-native');
    }
    if (isStandalone) {
      docEl.classList.add('dnm-standalone-pwa');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDomClasses);
  } else {
    applyDomClasses();
  }

  // 3. Android Hardware Back Button Handling
  const backListeners = [];
  function registerBackHandler(fn) {
    backListeners.push(fn);
  }
  function unregisterBackHandler(fn) {
    const idx = backListeners.indexOf(fn);
    if (idx !== -1) backListeners.splice(idx, 1);
  }

  function handleBackEvent() {
    // If listeners registered, execute the most recent one (LIFO)
    for (let i = backListeners.length - 1; i >= 0; i--) {
      try {
        const handled = backListeners[i]();
        if (handled !== false) return true;
      } catch (e) {
        console.warn('Back handler error:', e);
      }
    }
    return false;
  }

  // Hook Capacitor App back button
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    try {
      window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
        const handled = handleBackEvent();
        if (!handled && canGoBack) {
          window.history.back();
        }
      });
    } catch (_) {}
  }

  // Hook standard Cordova/Android backbutton
  document.addEventListener('backbutton', (e) => {
    const handled = handleBackEvent();
    if (handled) {
      e.preventDefault();
    }
  });

  // 4. Native Haptics & Vibration
  function haptic(type = 'light') {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
        if (type === 'heavy') window.Capacitor.Plugins.Haptics.impact({ style: 'Heavy' });
        else if (type === 'medium') window.Capacitor.Plugins.Haptics.impact({ style: 'Medium' });
        else window.Capacitor.Plugins.Haptics.impact({ style: 'Light' });
      } else if (navigator.vibrate) {
        if (type === 'heavy') navigator.vibrate(25);
        else if (type === 'medium') navigator.vibrate(15);
        else navigator.vibrate(8);
      }
    } catch (_) {}
  }

  window.DNM_NATIVE = {
    isNativeApp,
    isCapacitor,
    isAndroid,
    isIOS,
    isAndroidWebView,
    isIOSWebView,
    registerBackHandler,
    unregisterBackHandler,
    haptic
  };

})(window);
