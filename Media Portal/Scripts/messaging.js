/**
 * Daynight-Media: Instagram-Grade Direct Messages (DMs)
 * Real-time 1:1 and group messaging with media sharing, reactions, and vanilla JS
 */
(function(window) {
  'use strict';

  let activeThreadId = null;
  let messagesListener = null;
  let threadsListener = null;
  let dmsScrim = null;

  async function initMessaging() {
    // Initialize DMs system - called from app.js or settings
  }

  async function openDMs() {
    const user = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;
    if (!user) {
      window.DNM_AUTH.signInWithGoogle();
      return;
    }

    if (dmsScrim) {
      dmsScrim.remove();
    }

    dmsScrim = document.createElement('div');
    dmsScrim.className = 'dnm-scrim active';
    dmsScrim.id = 'dnm-dms-scrim';
    dmsScrim.style.cssText = 'z-index: 1000004 !important;';
    dmsScrim.innerHTML = `
      <div class="dnm-dms-drawer" style="width:100%;max-width:470px;height:100vh;max-height:100vh;background:var(--ig-bg);display:flex;flex-direction:column;position:relative;">
        <!-- Header -->
        <div class="dnm-dms-header" style="position:sticky;top:0;z-index:50;background:var(--ig-header-bg);backdrop-filter:blur(16px);border-bottom:1px solid var(--ig-border);padding:calc(env(safe-area-inset-top, 10px) + 10px) 16px 12px;display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:10px;">
            <button type="button" id="dnm-dms-close" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;padding:8px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>
            <span style="font-size:17px;font-weight:700;color:var(--ig-text-primary);">Messages</span>
          </div>
          <button type="button" id="dnm-dms-new" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;padding:8px;" title="New Message"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 3h6v6"/><path d="M18 3l-6 6"/><path d="M3 21l18-18"/></svg></button>
        </div>

        <!-- Search Bar -->
        <div style="padding:10px 16px;border-bottom:1px solid var(--ig-border);">
          <div class="dnm-search-bar" style="position:relative;background:var(--ig-surface);border:1px solid var(--ig-border);border-radius:20px;overflow:hidden;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--ig-text-muted);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="dnm-dms-search" placeholder="Search messages..." style="width:100%;background:transparent;border:none;padding:10px 14px 10px 42px;font-size:14px;color:var(--ig-text-primary);outline:none;">
          </div>
        </div>

        <!-- Threads List -->
        <div class="dnm-dms-threads" id="dnm-dms-threads-list" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;">
          <div class="dnm-loading-threads" style="padding:40px 16px;text-align:center;color:var(--ig-text-secondary);font-size:13px;">
            <div class="dnm-loading-spinner" style="width:24px;height:24px;margin:0 auto 8px;border-width:2.5px;"></div>
            <span>Loading messages...</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(dmsScrim);

    const closeBtn = dmsScrim.querySelector('#dnm-dms-close');
    const newBtn = dmsScrim.querySelector('#dnm-dms-new');
    const searchInput = dmsScrim.querySelector('#dnm-dms-search');
    const threadsList = dmsScrim.querySelector('#dnm-dms-threads-list');

    closeBtn.addEventListener('click', closeDMs);
    dmsScrim.addEventListener('click', e => { if (e.target === dmsScrim) closeDMs(); });

    newBtn.addEventListener('click', openNewMessageModal);

    // Listen for real-time threads from Firestore
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.db) {
      listenForThreads(threadsList, searchInput);
    } else {
      threadsList.innerHTML = '<div style="padding:40px 16px;text-align:center;color:var(--ig-text-secondary);">Connecting to chat server...</div>';
    }

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      threadsList.querySelectorAll('.dnm-dms-thread-item').forEach(item => {
        const name = item.dataset.name?.toLowerCase() || '';
        const preview = item.dataset.preview?.toLowerCase() || '';
        item.style.display = (name.includes(query) || preview.includes(query)) ? 'flex' : 'none';
      });
    });
  }

  function listenForThreads(threadsList, searchInput) {
    if (threadsListener) {
      try { threadsListener(); } catch(_) {}
    }

    const user = window.DNM_AUTH.getCurrentUser();
    if (!user) return;

    threadsListener = window.DNM_FIREBASE.db.collection('threads')
      .where('participants', 'array-contains', user.uid)
      .orderBy('lastMessageAt', 'desc')
      .onSnapshot(snapshot => {
        const threads = [];
        let totalUnread = 0;
        snapshot.forEach(doc => {
          const data = doc.data();
          threads.push(Object.assign({ id: doc.id }, data));
          totalUnread += data.unreadCounts?.[user.uid] || 0;
        });
        renderThreadsList(threadsList, threads, user.uid);
        // Update badge in header
        if (window.DNM_APP && window.DNM_APP.updateMessagesBadge) {
          window.DNM_APP.updateMessagesBadge(totalUnread);
        }
      }, err => {
        console.warn('Threads listener error:', err);
        renderThreadsList(threadsList, inMemoryThreads, user.uid);
      });
  }

  const inMemoryThreads = [];
  const inMemoryMessages = new Map();

  function loadThreadsFromLocal(threadsList) {
    const user = window.DNM_AUTH.getCurrentUser();
    renderThreadsList(threadsList, inMemoryThreads, user?.uid);
  }

  function renderThreadsList(threadsList, threads, currentUserId) {
    if (!threads.length) {
      threadsList.innerHTML = `
        <div style="padding:40px 16px;text-align:center;color:var(--ig-text-secondary);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px;opacity:0.5;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <p>No messages yet</p>
          <button type="button" id="dnm-dms-start-first" class="dnm-btn dnm-btn-primary dnm-btn-md" style="margin-top:16px;">Start a Conversation</button>
        </div>
      `;
      threadsList.querySelector('#dnm-dms-start-first')?.addEventListener('click', openNewMessageModal);
      return;
    }

    // Calculate total unread for badge
    let totalUnread = 0;
    threads.forEach(t => {
      totalUnread += t.unreadCounts?.[currentUserId] || 0;
    });
    if (window.DNM_APP && window.DNM_APP.updateMessagesBadge) {
      window.DNM_APP.updateMessagesBadge(totalUnread);
    }

    threadsList.innerHTML = threads.map(t => {
      const otherParticipant = t.participants.find(p => p !== currentUserId);
      const otherName = t.participantNames?.[otherParticipant] || otherParticipant || 'Unknown';
      const otherAvatar = t.participantAvatars?.[otherParticipant] || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherName)}&background=262626&color=ffffff&bold=true`;
      const lastMsg = t.lastMessage || '';
      const lastTime = t.lastMessageAt ? formatTime(t.lastMessageAt) : '';
      const unread = t.unreadCounts?.[currentUserId] || 0;
      const isOnline = t.onlineUsers?.includes(otherParticipant) || false;

      return `
        <div class="dnm-dms-thread-item" data-thread-id="${t.id}" data-name="${otherName}" data-preview="${lastMsg}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;transition:background 0.1s ease;border-bottom:1px solid var(--ig-border);">
          <div class="dnm-dms-thread-avatar" style="position:relative;width:52px;height:52px;border-radius:50%;overflow:hidden;flex-shrink:0;">
            <img src="${otherAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;">
            ${isOnline ? '<span style="position:absolute;bottom:2px;right:2px;width:12px;height:12px;border-radius:50%;background:var(--ig-green);border:2px solid var(--ig-bg);"></span>' : ''}
          </div>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <span style="font-weight:600;font-size:14.5px;color:var(--ig-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(otherName)}</span>
              <span style="font-size:11.5px;color:var(--ig-text-muted);flex-shrink:0;">${lastTime}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <span style="font-size:13px;color:var(--ig-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(lastMsg)}</span>
              ${unread > 0 ? `<span style="flex-shrink:0;background:var(--ig-accent);color:#FFF;font-size:11px;font-weight:700;padding:1px 6px;border-radius:10px;min-width:18px;text-align:center;">${unread > 99 ? '99+' : unread}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    threadsList.querySelectorAll('.dnm-dms-thread-item').forEach(item => {
      item.addEventListener('click', () => openThread(item.dataset.threadId));
    });
  }

  async function openThread(threadId) {
    const user = window.DNM_AUTH.getCurrentUser();
    if (!user) return;

    activeThreadId = threadId;

    if (messagesListener) {
      try { messagesListener(); } catch(_) {}
    }

    // Find thread data
    let threadData = null;
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.db) {
      const doc = await window.DNM_FIREBASE.db.collection('threads').doc(threadId).get();
      if (doc.exists) threadData = Object.assign({ id: doc.id }, doc.data());
    }

    if (!threadData) {
      threadData = inMemoryThreads.find(t => t.id === threadId);
    }

    if (!threadData) return;

    const otherParticipant = threadData.participants.find(p => p !== user.uid);
    const otherName = threadData.participantNames?.[otherParticipant] || otherParticipant || 'Unknown';
    const otherAvatar = threadData.participantAvatars?.[otherParticipant] || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherName)}&background=262626&color=ffffff&bold=true`;

    dmsScrim.innerHTML = `
      <div class="dnm-dms-drawer" style="width:100%;max-width:470px;height:100vh;max-height:100vh;background:var(--ig-bg);display:flex;flex-direction:column;position:relative;">
        <!-- Thread Header -->
        <div class="dnm-dms-thread-header" style="position:sticky;top:0;z-index:50;background:var(--ig-header-bg);backdrop-filter:blur(16px);border-bottom:1px solid var(--ig-border);padding:calc(env(safe-area-inset-top, 10px) + 10px) 16px 12px;display:flex;align-items:center;gap:12px;">
          <button type="button" id="dnm-thread-back" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;padding:8px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>
          <div class="dnm-dms-thread-avatar" style="position:relative;width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;">
            <img src="${otherAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;">
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:16px;color:var(--ig-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(otherName)}</div>
            <div style="font-size:12px;color:var(--ig-text-secondary);">Active now</div>
          </div>
          <button type="button" id="dnm-thread-call" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;padding:8px;" title="Video Call"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
          <button type="button" id="dnm-thread-more" style="background:none;border:none;color:var(--ig-text-primary);cursor:pointer;padding:8px;"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
        </div>

        <!-- Messages List -->
        <div class="dnm-dms-messages" id="dnm-dms-messages-list" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;display:flex;flex-direction:column;gap:8px;background-image:url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M30 30c0-16.57 13.43-30 30-30v60C43.43 60 30 46.57 30 30zm0 0"/%3E%3C/svg%3E');background-size:200px;opacity:0.03;">
          <div class="dnm-loading-messages" style="padding:40px 16px;text-align:center;color:var(--ig-text-secondary);font-size:13px;">
            <div class="dnm-loading-spinner" style="width:24px;height:24px;margin:0 auto 8px;border-width:2.5px;"></div>
            <span>Loading messages...</span>
          </div>
        </div>

        <!-- Input Bar -->
        <div class="dnm-dms-input-bar" style="padding:10px 16px calc(env(safe-area-inset-bottom, 10px) + 10px);border-top:1px solid var(--ig-border);background:var(--ig-bg);display:flex;align-items:flex-end;gap:8px;">
          <button type="button" id="dnm-dms-attach" style="background:none;border:none;color:var(--ig-text-secondary);cursor:pointer;padding:8px;flex-shrink:0;" title="Attach Media"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
          <form id="dnm-dms-message-form" style="flex:1;display:flex;align-items:flex-end;gap:8px;background:var(--ig-surface);border:1px solid var(--ig-border);border-radius:24px;padding:6px 12px;">
            <input type="text" id="dnm-dms-message-input" placeholder="Message..." style="flex:1;background:transparent;border:none;padding:8px 4px;font-size:14.5px;color:var(--ig-text-primary);outline:none;min-height:20px;max-height:100px;" rows="1">
            <button type="submit" id="dnm-dms-send-btn" style="background:none;border:none;color:var(--ig-accent);font-weight:700;font-size:14px;padding:8px 4px;cursor:pointer;flex-shrink:0;" disabled>Send</button>
          </form>
        </div>
      </div>
    `;

    const backBtn = dmsScrim.querySelector('#dnm-thread-back');
    const messagesList = dmsScrim.querySelector('#dnm-dms-messages-list');
    const messageForm = dmsScrim.querySelector('#dnm-dms-message-form');
    const messageInput = dmsScrim.querySelector('#dnm-dms-message-input');
    const sendBtn = dmsScrim.querySelector('#dnm-dms-send-btn');
    const attachBtn = dmsScrim.querySelector('#dnm-dms-attach');
    const callBtn = dmsScrim.querySelector('#dnm-thread-call');
    const moreBtn = dmsScrim.querySelector('#dnm-thread-more');

    backBtn.addEventListener('click', openDMs);

    messageInput.addEventListener('input', () => {
      sendBtn.disabled = !messageInput.value.trim();
      // Auto-resize
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px';
    });

    messageForm.addEventListener('submit', async e => {
      e.preventDefault();
      const text = messageInput.value.trim();
      if (!text) return;

      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';

      const message = {
        id: 'msg_' + Date.now(),
        threadId: activeThreadId,
        senderId: user.uid,
        senderName: user.displayName || user.username,
        senderAvatar: user.photoURL,
        text,
        timestamp: Date.now(),
        type: 'text',
        status: 'sent'
      };

      try {
        if (window.DNM_FIREBASE && window.DNM_FIREBASE.db) {
          await window.DNM_FIREBASE.db.collection('threads').doc(activeThreadId).collection('messages').add(message);
          await window.DNM_FIREBASE.db.collection('threads').doc(activeThreadId).update({
            lastMessage: text,
            lastMessageAt: Date.now(),
            [`unreadCounts.${threadData.participants.find(p => p !== user.uid)}`]: window.DNM_FIREBASE.db.FieldValue.increment(1)
          });
        }
      } catch(err) {
        console.error('Send message error:', err);
      }

      // Local fallback
      saveMessageLocal(message);
      messageInput.value = '';
      messageInput.style.height = 'auto';
      sendBtn.disabled = true;
      sendBtn.textContent = 'Send';

      // Scroll to bottom
      setTimeout(() => messagesList.scrollTop = messagesList.scrollHeight, 50);
    });

    attachBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        // Handle media upload
        alert('Media sharing in DMs coming soon!');
      };
      input.click();
    });

    callBtn.addEventListener('click', () => {
      if (window.DNM_FEED && window.DNM_FEED.showToast) {
        window.DNM_FEED.showToast('Video calling coming soon!');
      }
    });

    moreBtn.addEventListener('click', () => openThreadOptions(threadId, otherName));

    // Listen for real-time messages
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.db) {
      messagesListener = window.DNM_FIREBASE.db.collection('threads')
        .doc(activeThreadId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
          const messages = [];
          snapshot.forEach(doc => {
            messages.push(Object.assign({ id: doc.id }, doc.data()));
          });
          renderMessages(messagesList, messages, user.uid);
          // Mark as read
          markThreadAsRead(threadId, user.uid);
        }, err => {
          console.warn('Messages listener error:', err);
          loadMessagesLocal(messagesList, threadId, user.uid);
        });
    } else {
      loadMessagesLocal(messagesList, threadId, user.uid);
    }
  }

  function renderMessages(messagesList, messages, currentUserId) {
    if (!messages.length) {
      messagesList.innerHTML = `
        <div style="padding:40px 16px;text-align:center;color:var(--ig-text-secondary);">
          <p>No messages yet. Send the first message!</p>
        </div>
      `;
      return;
    }

    messagesList.innerHTML = messages.map(m => {
      const isOwn = m.senderId === currentUserId;
      const time = formatTime(m.timestamp);
      const statusIcon = m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓';

      return `
        <div class="dnm-dms-message ${isOwn ? 'own' : ''}" style="display:flex;${isOwn ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}gap:8px;max-width:75%;${isOwn ? 'margin-left:auto;' : 'margin-right:auto;'}">
          ${!isOwn ? `<img src="${m.senderAvatar || 'https://ui-avatars.com/api/?name=User&background=262626&color=fff'}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-bottom:4px;">` : ''}
          <div style="display:flex;flex-direction:column;${isOwn ? 'align-items:flex-end;' : 'align-items:flex-start;'}gap:2px;">
            <div style="background:${isOwn ? 'var(--ig-accent)' : 'var(--ig-surface)'};color:${isOwn ? '#FFF' : 'var(--ig-text-primary)'};border-radius:18px;padding:8px 14px;max-width:100%;word-break:break-word;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
              ${escapeHtml(m.text)}
            </div>
            <div style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--ig-text-muted);">
              <span>${time}</span>
              ${isOwn ? `<span>${statusIcon}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Auto-scroll to bottom
    messagesList.scrollTop = messagesList.scrollHeight;
  }

  function loadMessagesLocal(messagesList, threadId, currentUserId) {
    const list = inMemoryMessages.get(threadId) || [];
    renderMessages(messagesList, list, currentUserId);
  }

  function saveMessageLocal(message) {
    if (!message || !message.threadId) return;
    const list = inMemoryMessages.get(message.threadId) || [];
    list.push(message);
    inMemoryMessages.set(message.threadId, list);
  }

  async function markThreadAsRead(threadId, userId) {
    if (window.DNM_FIREBASE && window.DNM_FIREBASE.db) {
      try {
        await window.DNM_FIREBASE.db.collection('threads').doc(threadId).update({
          [`unreadCounts.${userId}`]: 0
        });
      } catch(_) {}
    }
  }

  function openNewMessageModal() {
    const user = window.DNM_AUTH.getCurrentUser();
    if (!user) return;

    const clients = window.DNM_DATA.getClients ? window.DNM_DATA.getClients() : [];
    const existing = document.querySelector('#dnm-new-msg-scrim');
    if (existing) existing.remove();

    const scrim = document.createElement('div');
    scrim.className = 'dnm-scrim active';
    scrim.id = 'dnm-new-msg-scrim';
    scrim.style.cssText = 'z-index: 1000005 !important;';
    scrim.innerHTML = `
      <div class="dnm-modal-dialog" style="max-width:420px;width:90%;max-height:85vh;overflow-y:auto;">
        <div style="padding:16px;border-bottom:1px solid var(--ig-border);display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:17px;font-weight:700;">New Message</span>
          <button type="button" id="dnm-new-msg-close" style="background:none;border:none;font-size:24px;color:var(--ig-text-primary);cursor:pointer;">&times;</button>
        </div>
        <div style="padding:12px 16px;border-bottom:1px solid var(--ig-border);">
          <div class="dnm-search-bar" style="background:var(--ig-surface);border:1px solid var(--ig-border);border-radius:20px;overflow:hidden;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:12px 14px;color:var(--ig-text-muted);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="dnm-new-msg-search" placeholder="Search people..." style="width:calc(100% - 52px);background:transparent;border:none;padding:12px 0;font-size:14.5px;color:var(--ig-text-primary);outline:none;">
          </div>
        </div>
        <div style="padding:12px 16px;max-height:60vh;overflow-y:auto;">
          <div style="font-size:12px;font-weight:600;color:var(--ig-text-muted);text-transform:uppercase;margin-bottom:8px;">Suggested</div>
          <div id="dnm-new-msg-list">
            ${clients.map(c => `
              <div class="dnm-new-msg-item" data-target="${c.id}" data-type="client" style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;cursor:pointer;transition:background 0.1s ease;">
                <div style="width:48px;height:48px;border-radius:50%;overflow:hidden;background:var(--ig-gradient-ring);display:flex;align-items:center;justify-content:center;padding:2px;">
                  <img src="${c.logo || './Logo/logo.png'}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;border:2px solid var(--ig-bg);">
                </div>
                <div style="flex:1;">
                  <div style="font-weight:600;color:var(--ig-text-primary);">${c.name}</div>
                  <div style="font-size:12.5px;color:var(--ig-text-secondary);">@${c.slug} &bull; Verified Brand</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(scrim);

    scrim.querySelector('#dnm-new-msg-close')?.addEventListener('click', () => scrim.remove());
    scrim.addEventListener('click', e => { if (e.target === scrim) scrim.remove(); });

    scrim.querySelectorAll('.dnm-new-msg-item').forEach(item => {
      item.addEventListener('click', () => startConversation(item.dataset.target, item.dataset.type));
    });
  }

  async function startConversation(targetId, type) {
    const user = window.DNM_AUTH.getCurrentUser();
    if (!user) return;

    document.querySelector('#dnm-new-msg-scrim')?.remove();

    const threadId = [user.uid, targetId].sort().join('_');
    let threadData = null;

    if (window.DNM_FIREBASE && window.DNM_FIREBASE.db) {
      const doc = await window.DNM_FIREBASE.db.collection('threads').doc(threadId).get();
      if (doc.exists) {
        threadData = Object.assign({ id: doc.id }, doc.data());
      } else {
        // Create new thread
        let otherName, otherAvatar;
        if (type === 'client') {
          const client = window.DNM_DATA.getClient(targetId);
          otherName = client?.name || targetId;
          otherAvatar = client?.logo || './Logo/logo.png';
        } else {
          otherName = targetId;
          otherAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(targetId)}&background=262626&color=fff`;
        }

        threadData = {
          id: threadId,
          participants: [user.uid, targetId],
          participantNames: {
            [user.uid]: user.displayName || user.username,
            [targetId]: otherName
          },
          participantAvatars: {
            [user.uid]: user.photoURL,
            [targetId]: otherAvatar
          },
          createdAt: Date.now(),
          lastMessageAt: Date.now(),
          unreadCounts: { [targetId]: 0, [user.uid]: 0 },
          onlineUsers: [user.uid]
        };

        try {
          await window.DNM_FIREBASE.db.collection('threads').doc(threadId).set(threadData);
        } catch(err) {
          console.error('Create thread error:', err);
        }
      }
    }

    if (threadData) {
      openThread(threadData.id);
    }
  }

  function openThreadOptions(threadId, otherName) {
    // Show options sheet for thread (mute, block, delete, etc.)
    if (window.DNM_FEED && window.DNM_FEED.showToast) {
      window.DNM_FEED.showToast('Thread options coming soon!');
    }
  }

  function closeDMs() {
    if (messagesListener) {
      try { messagesListener(); } catch(_) {}
      messagesListener = null;
    }
    activeThreadId = null;
    if (dmsScrim) {
      dmsScrim.remove();
      dmsScrim = null;
    }
  }

  function formatTime(ts) {
    const date = new Date(ts);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.DNM_MESSAGING = {
    initMessaging,
    openDMs,
    closeDMs
  };

})(window);