/**
 * Daynight-Media: Firebase Configuration & SDK Initialization
 * Project: daynight-media-portal
 */
(function(window) {
  'use strict';

  // Firebase configuration object for project daynight-media-portal
  const firebaseConfig = {
    apiKey: "AIzaSyBt3eCmu_sGhfY01DiKgsTLqQrmq6EmDxw",
    authDomain: "daynight-media-portal.firebaseapp.com",
    projectId: "daynight-media-portal",
    storageBucket: "daynight-media-portal.firebasestorage.app",
    messagingSenderId: "151346419700",
    appId: "1:151346419700:web:dbe069eff93d27b1170ba1"
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
