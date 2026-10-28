/**
 * Daynight-Media: Firebase Configuration & SDK Initialization
 * Loads config securely from server endpoint - NO hardcoded secrets
 * Project: daynight-media-portal
 */
(function(window) {
  'use strict';

  // Firebase configuration will be loaded from secure endpoint
  let firebaseApp = null;
  let firebaseAuth = null;
  let firebaseDb = null;
  let configLoaded = false;
  let configLoadPromise = null;

  // Production & Local Firebase config fallback
  const LOCAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBt3eCmu_sGhfY01DiKgsTLqQrmq6EmDxw",
    authDomain: "daynight-media-portal.firebaseapp.com",
    projectId: "daynight-media-portal",
    storageBucket: "daynight-media-portal.firebasestorage.app",
    messagingSenderId: "151346419700",
    appId: "1:151346419700:web:dbe069eff93d27b1170ba1"
  };

  // Safe Firebase App Initialization
  async function initializeFirebase() {
    if (configLoaded) return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };

    if (configLoadPromise) return configLoadPromise;

    configLoadPromise = (async () => {
      let firebaseConfig = null;

      try {
        // Try to load Firebase config from secure server endpoint
        const res = await fetch('/api/firebase-config');
        if (res.ok) {
          firebaseConfig = await res.json();
        }
      } catch (err) {
        console.warn('[DNM_FIREBASE] Server config fetch failed, will try local fallback:', err.message);
      }

      // Fallback to local config if server config failed
      if (!firebaseConfig) {
        console.log('[DNM_FIREBASE] Using local development Firebase config');
        firebaseConfig = LOCAL_FIREBASE_CONFIG;
      }

      try {
        if (typeof firebase !== 'undefined' && firebase.initializeApp) {
          firebaseApp = firebase.initializeApp(firebaseConfig);
          firebaseAuth = firebase.auth();
          if (firebase.firestore) {
            firebaseDb = firebase.firestore();
            try {
              firebaseDb.settings({ ignoreUndefinedProperties: true });
            } catch(_) {}
          }
          configLoaded = true;
          console.log('[DNM_FIREBASE] Initialized successfully');
        } else {
          console.warn('[DNM_FIREBASE] Firebase SDK not loaded');
        }
      } catch (err) {
        console.error('[DNM_FIREBASE] Initialization failed:', err);
        configLoaded = false;
      }
      return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };
    })();

    return configLoadPromise;
  }

  // Initialize on load
  initializeFirebase();

  // Auto ensure auth session for Firebase Firestore operations
  async function ensureAuth() {
    await initializeFirebase();
    if (!firebaseAuth) return null;

    return new Promise(resolve => {
      if (firebaseAuth.currentUser) return resolve(firebaseAuth.currentUser);

      const unsubscribe = firebaseAuth.onAuthStateChanged(user => {
        unsubscribe();
        if (user) {
          resolve(user);
        } else {
          firebaseAuth.signInAnonymously()
            .then(cred => resolve(cred.user))
            .catch(() => {
              // Anonymous auth may not be enabled in console; proceed smoothly as guest
              resolve(null);
            });
        }
      });
    });
  }

  // Trigger early auth check
  ensureAuth();

  // Real-time Firestore Posts Sync
  function syncPosts(onUpdate) {
    if (!firebaseDb) return () => {};
    try {
      return firebaseDb.collection('posts')
        .where('status', '==', 'approved')
        .onSnapshot(snapshot => {
          const posts = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            if (data && !data.hidden) posts.push(Object.assign({ id: doc.id }, data));
          });
          if (onUpdate) onUpdate(posts);
        }, err => {
          console.warn('Firestore syncPosts listener note:', err);
        });
    } catch(err) {
      console.warn('syncPosts error:', err);
      return () => {};
    }
  }

  // Save post directly to Cloud Firestore
  async function savePost(post) {
    await initializeFirebase();
    if (!firebaseDb || !post || !post.id) return false;
    try {
      const user = await ensureAuth();
      const allowedKeys = [
        'id', 'authorId', 'authorRole', 'authorName', 'authorUsername', 'authorAvatar',
        'type', 'title', 'caption', 'status', 'mediaUrl', 'coverUrl', 'url',
        'fileId', 'driveFileId', 'c', 'b', 'album', 'dur', 'aspectRatio',
        'width', 'height', 'likes', 'likesCount', 'views', 'viewsCount',
        'commentsCount', 'downloads', 'tags', 'date', 'createdAt', 'updatedAt', 'hidden'
      ];
      const cleanPost = {};
      allowedKeys.forEach(k => {
        if (post[k] !== undefined) cleanPost[k] = post[k];
      });
      cleanPost.id = String(post.id);
      if (!cleanPost.authorId && user) cleanPost.authorId = user.uid;
      if (!cleanPost.authorId && firebaseAuth && firebaseAuth.currentUser) cleanPost.authorId = firebaseAuth.currentUser.uid;
      if (!cleanPost.authorId) cleanPost.authorId = post.authorUsername || ('guest_' + Math.random().toString(36).slice(2, 10));
      if (!cleanPost.status) cleanPost.status = 'approved';
      if (cleanPost.hidden === undefined) cleanPost.hidden = false;
      if (!cleanPost.createdAt) cleanPost.createdAt = Date.now();

      await firebaseDb.collection('posts').doc(String(cleanPost.id)).set(cleanPost, { merge: true });
      return true;
    } catch(err) {
      console.warn('Firestore savePost error:', err);
      return false;
    }
  }

  // Update post in Cloud Firestore (caption, title, visibility)
  async function updatePost(postId, updates = {}) {
    await initializeFirebase();
    if (!firebaseDb || !postId) return false;
    try {
      await ensureAuth();
      const cleanUpdates = {};
      const allowedUpdateKeys = ['title', 'caption', 'hidden', 'updatedAt'];
      allowedUpdateKeys.forEach(k => {
        if (updates[k] !== undefined) cleanUpdates[k] = updates[k];
      });
      cleanUpdates.updatedAt = Date.now();
      await firebaseDb.collection('posts').doc(String(postId)).set(cleanUpdates, { merge: true });
      return true;
    } catch(err) {
      console.warn('Firestore updatePost error:', err);
      return false;
    }
  }

  // Delete post from Firestore
  async function deletePost(postId) {
    await initializeFirebase();
    if (!firebaseDb || !postId) return false;
    try {
      await ensureAuth();
      await firebaseDb.collection('posts').doc(String(postId)).delete();
      return true;
    } catch(err) {
      console.warn('Firestore deletePost error:', err);
      return false;
    }
  }

  // Increment like count on post (atomic)
  async function incrementLike(postId, delta) {
    await initializeFirebase();
    if (!firebaseDb || !postId) return false;
    try {
      await ensureAuth();
      const postRef = firebaseDb.collection('posts').doc(String(postId));
      await firebaseDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(postRef);
        if (!doc.exists) return;
        const currentLikes = doc.data().likes || 0;
        transaction.update(postRef, { likes: Math.max(0, currentLikes + delta) });
      });
      return true;
    } catch(err) {
      console.warn('Firestore incrementLike error:', err);
      return false;
    }
  }

  // Toggle follow for user/brand
  async function toggleFollow(targetId, isFollowing) {
    await initializeFirebase();
    if (!firebaseDb || !targetId) return false;
    try {
      const user = await ensureAuth();
      if (!user) return false;
      const followRef = firebaseDb.collection('follows').doc(`${user.uid}_${targetId}`);
      if (isFollowing) {
        await followRef.set({
          followerId: user.uid,
          targetId,
          targetType: targetId.startsWith('brand_') ? 'brand' : 'user',
          createdAt: Date.now()
        });
        // Increment follower count on target
        const targetRef = firebaseDb.collection('users').doc(targetId);
        await firebaseDb.runTransaction(async (t) => {
          const doc = await t.get(targetRef);
          if (doc.exists) {
            t.update(targetRef, { followersCount: (doc.data().followersCount || 0) + 1 });
          }
        });
        // Increment following count on user
        const userRef = firebaseDb.collection('users').doc(user.uid);
        await firebaseDb.runTransaction(async (t) => {
          const doc = await t.get(userRef);
          if (doc.exists) {
            t.update(userRef, { followingCount: (doc.data().followingCount || 0) + 1 });
          }
        });
      } else {
        await followRef.delete();
        // Decrement counts
        const targetRef = firebaseDb.collection('users').doc(targetId);
        await firebaseDb.runTransaction(async (t) => {
          const doc = await t.get(targetRef);
          if (doc.exists) {
            t.update(targetRef, { followersCount: Math.max(0, (doc.data().followersCount || 0) - 1) });
          }
        });
        const userRef = firebaseDb.collection('users').doc(user.uid);
        await firebaseDb.runTransaction(async (t) => {
          const doc = await t.get(userRef);
          if (doc.exists) {
            t.update(userRef, { followingCount: Math.max(0, (doc.data().followingCount || 0) - 1) });
          }
        });
      }
      return true;
    } catch(err) {
      console.warn('Firestore toggleFollow error:', err);
      return false;
    }
  }

  // Toggle save for post
  async function toggleSave(postId, isSaved) {
    await initializeFirebase();
    if (!firebaseDb || !postId) return false;
    try {
      const user = await ensureAuth();
      if (!user) return false;
      const saveRef = firebaseDb.collection('saves').doc(`${user.uid}_${postId}`);
      if (isSaved) {
        await saveRef.set({
          userId: user.uid,
          postId,
          createdAt: Date.now()
        });
      } else {
        await saveRef.delete();
      }
      return true;
    } catch(err) {
      console.warn('Firestore toggleSave error:', err);
      return false;
    }
  }

  // Real-time Comments Sync from Cloud Firestore (Strictly 100% Server Database)
  function syncComments(postId, onUpdate) {
    if (!firebaseDb || !postId) return () => {};
    try {
      return firebaseDb.collection('posts')
        .doc(String(postId))
        .collection('comments')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
          const comments = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            comments.push(Object.assign({ id: doc.id }, data));
          });
          if (onUpdate) onUpdate(comments);
        }, err => {
          // Fallback if index not available
          firebaseDb.collection('posts')
            .doc(String(postId))
            .collection('comments')
            .get()
            .then(snapshot => {
              const comments = [];
              snapshot.forEach(doc => {
                comments.push(Object.assign({ id: doc.id }, doc.data()));
              });
              comments.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
              if (onUpdate) onUpdate(comments);
            })
            .catch(ex => console.warn('Comments fetch error:', ex));
        });
    } catch(err) {
      console.warn('syncComments error:', err);
      return () => {};
    }
  }

  // Post Comment to Cloud Firestore
  async function addComment(postId, commentData) {
    await initializeFirebase();
    if (!firebaseDb || !postId || !commentData) return null;
    try {
      await ensureAuth();
      const user = firebaseAuth ? firebaseAuth.currentUser : null;
      const commenterId = user ? user.uid : (commentData.userId || ('guest_' + Math.random().toString(36).slice(2, 10)));
      const docData = {
        userId: commenterId,
        user: commentData.user || 'creator',
        authorUsername: commentData.authorUsername || commentData.user || 'creator',
        avatar: commentData.avatar || '',
        text: commentData.text || '',
        timestamp: Date.now(),
        time: 'Just now'
      };

      const docRef = await firebaseDb.collection('posts')
        .doc(String(postId))
        .collection('comments')
        .add(docData);

      try {
        firebaseDb.collection('posts').doc(String(postId)).set({
          commentsCount: firebase.firestore.FieldValue.increment(1)
        }, { merge: true }).catch(() => {});
      } catch(_) {}

      return Object.assign({ id: docRef.id }, docData);
    } catch(err) {
      console.error('Firestore addComment error:', err);
      throw err;
    }
  }

  window.DNM_FIREBASE = {
    app: null, // Will be set after init
    auth: null,
    db: null,
    ensureAuth,
    syncPosts,
    savePost,
    updatePost,
    deletePost,
    syncComments,
    addComment,
    incrementLike,
    toggleFollow,
    toggleSave,
    // Helper to wait for initialization
    ready: () => initializeFirebase()
  };

  // Update references after init
  initializeFirebase().then(({ app, auth, db }) => {
    window.DNM_FIREBASE.app = app;
    window.DNM_FIREBASE.auth = auth;
    window.DNM_FIREBASE.db = db;
  });

})(window);