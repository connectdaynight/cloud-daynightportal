/**
 * Daynight-Media: Firebase Configuration & SDK Initialization
 * Project: daynight-media
 */
(function(window) {
  'use strict';

  // Firebase configuration object for project daynight-media
  const firebaseConfig = {
    apiKey: "AIzaSyDayNightMediaAppKey2026Real",
    authDomain: "daynight-media.firebaseapp.com",
    projectId: "daynight-media",
    storageBucket: "daynight-media.firebasestorage.app",
    messagingSenderId: "608025535565",
    appId: "1:608025535565:web:daynightmedia2026app"
  };

  window.DNM_CONFIG = {
    firebase: firebaseConfig,
    gasUrl: 'https://script.google.com/macros/s/AKfycbxTaYOdXlJ8Sy-yfbh68gq4iJn1ThlQXoTY83Bc75tlPYcQrbz1lv_WWfDySu4CYaGE/exec',
    storageSubfolders: {
      videos: 'Day Night Media Portal/Community Uploads/Videos',
      photos: 'Day Night Media Portal/Community Uploads/Photos'
    }
  };

  // Safe Firebase App Initialization
  let firebaseApp = null;
  let firebaseAuth = null;
  try {
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      firebaseApp = firebase.initializeApp(firebaseConfig);
      firebaseAuth = firebase.auth();
    }
  } catch (err) {
    console.warn('Firebase SDK initialization note:', err.message);
  }

  window.DNM_FIREBASE = {
    app: firebaseApp,
    auth: firebaseAuth
  };

})(window);
