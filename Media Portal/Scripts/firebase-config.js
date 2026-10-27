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
  let firebaseDb = null;
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
    }
  } catch (err) {
    console.warn('Firebase SDK initialization note:', err.message);
  }

  // Auto ensure auth session for Firebase Firestore operations
  function ensureAuth() {
    return new Promise(resolve => {
      if (!firebaseAuth) return resolve(null);
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
            if (data && !data.hidden) posts.push(data);
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
    app: firebaseApp,
    auth: firebaseAuth,
    db: firebaseDb,
    ensureAuth,
    syncPosts,
    savePost,
    updatePost,
    deletePost,
    syncComments,
    addComment
  };

})(window);
