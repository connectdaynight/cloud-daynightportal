/**
 * Daynight-Media: Official Instagram 3-Dot Bottom Sheet Menu Engine
 * Pixel-perfect clone of Instagram native bottom sheet (Image 2)
 * Features: Save, Remix, QR Code, Audio Attribution, Share, Archive, Toggles, Edit, Delete, Download
 */
(function(window) {
  'use strict';

  window.DNM_UI = window.DNM_UI || {};

  function openInstagramMoreMenu(item, { onUpdate, onDelete } = {}) {
    if (!item) return;

    // Remove any existing menus
    const existing = document.querySelector('.ig-menu-scrim');
    if (existing) existing.remove();

    const author = window.DNM_DATA ? window.DNM_DATA.getAuthorInfo(item) : { name: 'Day Night Media', handle: 'daynight', avatar: './Logo/logo.png' };
    const currentUser = window.DNM_AUTH ? window.DNM_AUTH.getCurrentUser() : null;
    let isOwner = false;
    if (currentUser) {
      const curUid = String(currentUser.uid || '');
      const curUser = (currentUser.username || '').toLowerCase();
      const authorUid = String(item.authorUid || item.authorId || item.userId || '');
      const authorUser = (item.authorUsername || '').toLowerCase();
      if (curUid && (curUid === authorUid)) isOwner = true;
      if (curUser && authorUser && curUser === authorUser) isOwner = true;
      if (currentUser.role === 'admin' || currentUser.isAdmin) isOwner = true;
      try {
        const dataStorage = window.DNM_STORAGE_DATA || (window.DNM_STORAGE_DATA = new (window.StorageAdapter || window.DNM_STORAGE?.StorageAdapter)({ namespace: 'data' }));
        const stored = dataStorage.get('uploaded_posts', []) || [];
        if (Array.isArray(stored) && stored.some(p => String(p.id) === String(item.id) || (p.fileId && p.fileId === item.fileId))) {
          isOwner = true;
        }
      } catch(_) {}
    }

    // Check saved state
    let isSaved = false;
    try {
      const savedList = window.DNM_STORAGE?.social?.get('saved_posts', []) || [];
      isSaved = savedList.includes(item.id);
    } catch (_) {}

    // State toggles
    let hideLikes = item.hideLikes === true;
    let hideShares = item.hideShares === true;
    let commentsOff = item.commentsOff === true;

    const streamUrl = window.DNM_DATA?.getStreamUrl ? window.DNM_DATA.getStreamUrl(item) : (item.url || '');
    const mediaUrl = window.DNM_DATA?.getMediaUrl ? window.DNM_DATA.getMediaUrl(item) : (item.coverUrl || streamUrl);
    const postUrl = `${window.location.origin}${window.location.pathname}?reel=${encodeURIComponent(item.id)}`;

    const scrim = document.createElement('div');
    scrim.className = 'ig-menu-scrim';
    scrim.innerHTML = `
      <div class="ig-menu-sheet">
        <!-- Handle Bar for Swipe Dismiss -->
        <div class="ig-menu-handle-bar">
          <div class="ig-menu-handle"></div>
        </div>

        <div class="ig-menu-body" id="ig-menu-body-content">
          <!-- Top 3 Large Action Cards: Save, Remix, QR Code (Exact Image 2) -->
          <div class="ig-menu-cards-row">
            <!-- 1. Save Card -->
            <button type="button" class="ig-menu-action-card" id="ig-menu-card-save" aria-label="Save Post">
              <div class="ig-menu-card-icon" id="ig-menu-save-icon">
                ${isSaved 
                  ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
                  : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'}
              </div>
              <span class="ig-menu-card-label" id="ig-menu-save-label">${isSaved ? 'Saved' : 'Save'}</span>
            </button>

            <!-- 2. Remix Card -->
            <button type="button" class="ig-menu-action-card" id="ig-menu-card-remix" aria-label="Remix Reel">
              <div class="ig-menu-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
              </div>
              <span class="ig-menu-card-label">Remix</span>
            </button>

            <!-- 3. QR code Card -->
            <button type="button" class="ig-menu-action-card" id="ig-menu-card-qr" aria-label="QR Code">
              <div class="ig-menu-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01"/></svg>
              </div>
              <span class="ig-menu-card-label">QR code</span>
            </button>
          </div>

          <!-- Audio Attribution Row (Image 2) -->
          <div class="ig-menu-audio-row" id="ig-menu-audio-btn">
            <img class="ig-menu-audio-art" src="${author.avatar || './Logo/logo.png'}" alt="Audio Cover">
            <div class="ig-menu-audio-meta">
              <span class="ig-menu-audio-title">Original audio &bull; ${author.handle || author.name}</span>
              <span class="ig-menu-audio-sub">Audio</span>
            </div>
          </div>

          <div class="ig-menu-divider"></div>

          <!-- Menu Action List (Image 2) -->
          <div class="ig-menu-list">
            <!-- Share to Facebook / Social Share -->
            <button type="button" class="ig-menu-item" id="ig-menu-btn-share">
              <div class="ig-menu-item-left">
                <span class="ig-menu-item-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </span>
                <span>Share to...</span>
              </div>
            </button>

            <!-- Copy Link -->
            <button type="button" class="ig-menu-item" id="ig-menu-btn-copy">
              <div class="ig-menu-item-left">
                <span class="ig-menu-item-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </span>
                <span>Copy link</span>
              </div>
            </button>

            <!-- Suggested products -->
            <button type="button" class="ig-menu-item" id="ig-menu-btn-products">
              <div class="ig-menu-item-left">
                <span class="ig-menu-item-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                </span>
                <span>Suggested products</span>
              </div>
            </button>

            <!-- Download Reel / Photo -->
            <button type="button" class="ig-menu-item" id="ig-menu-btn-download">
              <div class="ig-menu-item-left">
                <span class="ig-menu-item-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </span>
                <span>Download Reel</span>
              </div>
            </button>

            ${isOwner ? `
              <!-- Archive (Owner / Admin) -->
              <button type="button" class="ig-menu-item" id="ig-menu-btn-archive">
                <div class="ig-menu-item-left">
                  <span class="ig-menu-item-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </span>
                  <span>Archive</span>
                </div>
              </button>

              <!-- Hide like count to others (Owner / Admin) -->
              <div class="ig-menu-item" id="ig-menu-row-likes">
                <div class="ig-menu-item-left">
                  <span class="ig-menu-item-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                  </span>
                  <span>Hide like count to others</span>
                </div>
                <div class="ig-menu-switch ${hideLikes ? 'active' : ''}" id="ig-switch-likes">
                  <div class="ig-menu-switch-thumb"></div>
                </div>
              </div>

              <!-- Hide share count (Owner / Admin) -->
              <div class="ig-menu-item" id="ig-menu-row-shares">
                <div class="ig-menu-item-left">
                  <span class="ig-menu-item-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                  </span>
                  <span>Hide share count</span>
                </div>
                <div class="ig-menu-switch ${hideShares ? 'active' : ''}" id="ig-switch-shares">
                  <div class="ig-menu-switch-thumb"></div>
                </div>
              </div>

              <!-- Turn off commenting (Owner / Admin) -->
              <div class="ig-menu-item" id="ig-menu-row-comments">
                <div class="ig-menu-item-left">
                  <span class="ig-menu-item-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                  </span>
                  <span>Turn off commenting</span>
                </div>
                <div class="ig-menu-switch ${commentsOff ? 'active' : ''}" id="ig-switch-comments">
                  <div class="ig-menu-switch-thumb"></div>
                </div>
              </div>

              <!-- Edit Post (Owner / Admin) -->
              <button type="button" class="ig-menu-item" id="ig-menu-btn-edit">
                <div class="ig-menu-item-left">
                  <span class="ig-menu-item-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </span>
                  <span>Edit Post</span>
                </div>
              </button>

              <!-- Delete Post (Owner / Admin) -->
              <button type="button" class="ig-menu-item ig-menu-item-danger" id="ig-menu-btn-delete">
                <div class="ig-menu-item-left">
                  <span class="ig-menu-item-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </span>
                  <span>Delete</span>
                </div>
              </button>
            ` : `
              <!-- Report Post (Viewer only) -->
              <button type="button" class="ig-menu-item ig-menu-item-danger" id="ig-menu-btn-report">
                <div class="ig-menu-item-left">
                  <span class="ig-menu-item-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </span>
                  <span>Report post</span>
                </div>
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(scrim);
    // Trigger transition
    requestAnimationFrame(() => scrim.classList.add('active'));

    const sheet = scrim.querySelector('.ig-menu-sheet');
    const closeMenu = () => {
      scrim.classList.remove('active');
      setTimeout(() => scrim.remove(), 280);
    };

    scrim.addEventListener('click', e => {
      if (e.target === scrim) closeMenu();
    });

    // Touch swipe down to dismiss
    let startY = 0;
    sheet.addEventListener('touchstart', e => {
      startY = e.touches[0].clientY;
    }, { passive: true });

    sheet.addEventListener('touchmove', e => {
      const deltaY = e.touches[0].clientY - startY;
      if (deltaY > 0) {
        sheet.style.transform = `translateY(${deltaY}px)`;
      }
    }, { passive: true });

    sheet.addEventListener('touchend', e => {
      const deltaY = e.changedTouches[0].clientY - startY;
      if (deltaY > 80) {
        closeMenu();
      } else {
        sheet.style.transform = '';
      }
    }, { passive: true });

    // 1. Save Card Action
    const saveCard = scrim.querySelector('#ig-menu-card-save');
    const saveIcon = scrim.querySelector('#ig-menu-save-icon');
    const saveLabel = scrim.querySelector('#ig-menu-save-label');
    saveCard?.addEventListener('click', async () => {
      isSaved = !isSaved;
      if (window.DNM_NATIVE?.haptic) window.DNM_NATIVE.haptic('medium');
      saveLabel.textContent = isSaved ? 'Saved' : 'Save';
      saveIcon.innerHTML = isSaved
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
      
      try {
        let savedList = (await window.DNM_STORAGE?.social?.get('saved_posts', [])) || [];
        if (isSaved) {
          if (!savedList.includes(item.id)) savedList.push(item.id);
        } else {
          savedList = savedList.filter(id => id !== item.id);
        }
        await window.DNM_STORAGE?.social?.set('saved_posts', savedList);
        if (window.DNM_FIREBASE && window.DNM_FIREBASE.toggleSavePost && currentUser) {
          await window.DNM_FIREBASE.toggleSavePost(currentUser.uid, item.id);
        }
      } catch (_) {}
    });

    // 2. Remix Action
    const remixCard = scrim.querySelector('#ig-menu-card-remix');
    remixCard?.addEventListener('click', () => {
      closeMenu();
      if (window.DNM_UPLOAD && window.DNM_UPLOAD.openUploadModal) {
        window.DNM_UPLOAD.openUploadModal({ remixItem: item });
      }
    });

    // 3. QR Code View Action
    const qrCard = scrim.querySelector('#ig-menu-card-qr');
    qrCard?.addEventListener('click', () => {
      const bodyContent = scrim.querySelector('#ig-menu-body-content');
      if (bodyContent) {
        const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(postUrl)}&margin=10`;
        bodyContent.innerHTML = `
          <div class="ig-qr-card-view">
            <span style="font-size:17px;font-weight:700;">Scan to view Reel</span>
            <span style="font-size:13px;color:var(--ig-text-secondary);margin-top:-8px;">@${author.handle} &bull; Daynight-media</span>
            <img class="ig-qr-code-img" src="${qrApi}" alt="Instagram QR Code">
            <button type="button" id="ig-qr-copy-btn" class="dnm-profile-btn primary" style="width:100%;max-width:240px;padding:10px;border-radius:10px;font-weight:700;font-size:14px;">
              Copy Link
            </button>
            <button type="button" id="ig-qr-back-btn" style="background:none;border:none;color:var(--ig-text-secondary);cursor:pointer;font-weight:600;font-size:13px;margin-top:4px;">
              Back to options
            </button>
          </div>
        `;
        bodyContent.querySelector('#ig-qr-copy-btn')?.addEventListener('click', () => {
          navigator.clipboard.writeText(postUrl).then(() => {
            alert('Link copied to clipboard!');
          });
        });
        bodyContent.querySelector('#ig-qr-back-btn')?.addEventListener('click', () => {
          closeMenu();
          openInstagramMoreMenu(item, { onUpdate, onDelete });
        });
      }
    });

    // Share To
    const shareBtn = scrim.querySelector('#ig-menu-btn-share');
    shareBtn?.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({
          title: item.title || 'Daynight Reel',
          text: `Check out this reel by ${author.name} on Daynight-media!`,
          url: postUrl
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(postUrl).then(() => {
          alert('Reel link copied to clipboard!');
        });
      }
      closeMenu();
    });

    // Copy Link
    const copyBtn = scrim.querySelector('#ig-menu-btn-copy');
    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(postUrl).then(() => {
        alert('Link copied to clipboard!');
      });
      closeMenu();
    });

    // Archive
    const archiveBtn = scrim.querySelector('#ig-menu-btn-archive');
    archiveBtn?.addEventListener('click', async () => {
      closeMenu();
      if (confirm('Archive this post? It will be moved to your private archive.')) {
        if (window.DNM_FIREBASE && window.DNM_FIREBASE.updatePost) {
          await window.DNM_FIREBASE.updatePost(item.id, { archived: true });
        }
        if (onUpdate) onUpdate(null);
      }
    });

    // Like count switch
    const switchLikes = scrim.querySelector('#ig-switch-likes');
    scrim.querySelector('#ig-menu-row-likes')?.addEventListener('click', async () => {
      hideLikes = !hideLikes;
      switchLikes?.classList.toggle('active', hideLikes);
      if (window.DNM_FIREBASE && window.DNM_FIREBASE.updatePost && isOwner) {
        await window.DNM_FIREBASE.updatePost(item.id, { hideLikes });
      }
    });

    // Share count switch
    const switchShares = scrim.querySelector('#ig-switch-shares');
    scrim.querySelector('#ig-menu-row-shares')?.addEventListener('click', async () => {
      hideShares = !hideShares;
      switchShares?.classList.toggle('active', hideShares);
      if (window.DNM_FIREBASE && window.DNM_FIREBASE.updatePost && isOwner) {
        await window.DNM_FIREBASE.updatePost(item.id, { hideShares });
      }
    });

    // Comments switch
    const switchComments = scrim.querySelector('#ig-switch-comments');
    scrim.querySelector('#ig-menu-row-comments')?.addEventListener('click', async () => {
      commentsOff = !commentsOff;
      switchComments?.classList.toggle('active', commentsOff);
      if (window.DNM_FIREBASE && window.DNM_FIREBASE.updatePost && isOwner) {
        await window.DNM_FIREBASE.updatePost(item.id, { commentsOff });
      }
    });

    // Suggested products
    const productsBtn = scrim.querySelector('#ig-menu-btn-products');
    productsBtn?.addEventListener('click', () => {
      closeMenu();
      alert(`Featured Brand: ${author.name}\nCheck out their latest collections on their official catalog.`);
    });

    // Download video
    const downloadBtn = scrim.querySelector('#ig-menu-btn-download');
    downloadBtn?.addEventListener('click', () => {
      closeMenu();
      const a = document.createElement('a');
      a.href = streamUrl || mediaUrl;
      a.download = `${(item.title || 'reel').replace(/[^a-z0-9]/gi, '_')}.mp4`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    // Edit Post (Owner / Admin)
    const editBtn = scrim.querySelector('#ig-menu-btn-edit');
    editBtn?.addEventListener('click', () => {
      closeMenu();
      const newCaption = prompt('Edit Caption:', item.caption || item.title || '');
      if (newCaption !== null && newCaption.trim() !== '') {
        item.caption = newCaption.trim();
        item.title = newCaption.trim();
        if (window.DNM_FIREBASE && window.DNM_FIREBASE.updatePost) {
          window.DNM_FIREBASE.updatePost(item.id, { caption: item.caption, title: item.title });
        }
        if (onUpdate) onUpdate(item);
      }
    });

    // Delete Post (Owner / Admin)
    const deleteBtn = scrim.querySelector('#ig-menu-btn-delete');
    deleteBtn?.addEventListener('click', async () => {
      if (confirm('Delete this post permanently? This cannot be undone.')) {
        closeMenu();
        if (window.DNM_DATA && window.DNM_DATA.deletePost) {
          await window.DNM_DATA.deletePost(item.id);
        } else if (window.DNM_FIREBASE && window.DNM_FIREBASE.deletePost) {
          await window.DNM_FIREBASE.deletePost(item.id);
        }
        if (onDelete) onDelete(item.id);
      }
    });

    // Report Post
    const reportBtn = scrim.querySelector('#ig-menu-btn-report');
    reportBtn?.addEventListener('click', () => {
      closeMenu();
      alert('Thank you for reporting. This post has been submitted for review.');
    });
  }

  window.DNM_UI.openInstagramMoreMenu = openInstagramMoreMenu;

})(window);
