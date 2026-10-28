# Daynight-Media Portal: Comprehensive Instagram Clone Feature Audit
**Date:** 2026-10-28 | **Target:** Media Portal Only  
**Codebase Version:** Production v2.4.0 (post-security-hardening migration)

---

## Executive Summary

The Media Portal has a **solid foundation** with real Firebase/Firestore sync, Google Auth, Google Drive uploads, modular CSS architecture, and a working SPA router. However, it is **~35% feature-complete** vs. Instagram's consumer experience. The critical gaps fall into five categories:

| Category | Completion | Critical Gaps |
|----------|-----------|---------------|
| **Core Social Features** | 45% | No DMs, No Stories creation/viewer, No Live, No Broadcast Channels |
| **Reels/Video Player** | 55% | No ABR/quality selector, No scrubber preview, No speed/volume/captions, No Remix/Collab |
| **Discovery & Search** | 30% | No user search results, No recent searches, No topic clusters, No Shop/IGTV tabs |
| **Profile & Identity** | 40% | No Highlights, No Archive, No QR/Nametag, No Insights, No Verification request |
| **UI/UX Polish** | 35% | No bottom sheets (80% of IG actions), No spring animations, No skeleton loaders, Inconsistent spacing |

---

## 1. CRITICAL MISSING FEATURES (Instagram Core)

### 1.1 Direct Messages (DMs) — **0% Implemented**
- **Missing:** Entire messaging system — threads, media sharing, voice notes, reactions, vanish mode, group chats, message requests
- **Backend:** Requires Firestore `conversations` + `messages` collections, FCM push notifications, presence indicators
- **Fix:** Add `Scripts/messaging.js` with `DNM_MESSAGING` module; new `dnm-tab-messages` in bottom nav (or slidebar entry)

### 1.2 Stories Creation & Viewer — **10% (Only Brand Stories Display)**
- **Current:** Feed shows client brand stories in tray (`feed.js:39-81`) — click opens brand profile
- **Missing:** User story camera (photo/video capture, text, stickers, music, AR effects), 24h expiry, viewer list, replies, highlights save
- **Fix:** Add `Scripts/stories.js` with `StoryCamera`, `StoryViewer` components; integrate camera API (`getUserMedia`), Canvas-based composer

### 1.3 Live Streaming — **0%**
- **Missing:** Go Live button, RTMP/SRT ingest, viewer comments overlay, guest invites, Live badges, replay saving to IGTV/Reels
- **Fix:** Integrate Mux/Cloudflare Stream or custom WebRTC SFU; new `dnm-tab-live` or Reels tab entry point

### 1.4 Reels Remix / Duet / Collab — **0%**
- **Missing:** "Remix this Reel" (side-by-side recording), "Collab" (co-authored posts), "Templates" (pre-cut timing)
- **Fix:** Multi-track video recorder in `upload.js`; `player.js` needs "Remix" action button

### 1.5 Close Friends / Audience Segmentation — **0%**
- **Missing:** Green-ring story audience, Close Friends list management, "Share to Close Friends" toggle on upload
- **Fix:** Firestore `closeFriends` subcollection per user; UI in profile slidebar + upload modal

### 1.6 Story Highlights — **0%**
- **Missing:** Highlight circles on profile, cover editing, reorder, delete
- **Fix:** Firestore `highlights` collection; render in `profile.js` above grid

### 1.7 Notes (Ephemeral Text Status) — **0%**
- **Missing:** 60-char text above DMs/profile, 24h TTL, replies route to DMs
- **Fix:** Lightweight Firestore `notes` collection; add to profile header + DM list

### 1.8 Broadcast Channels — **0%**
- **Missing:** One-to-many creator→followers messaging, reactions, polls, join links
- **Fix:** Separate `channels` Firestore collection; new tab or profile entry

### 1.9 Shopping / Product Tagging — **0%**
- **Missing:** Product catalog, tag products in reels/posts, checkout flow, affiliate commissions
- **Fix:** Major backend — likely out of scope for clone audit

### 1.10 Push Notifications (FCM/Web Push) — **0%**
- **Missing:** Like/comment/follow/live/mention notifications, in-app notification center, deep links
- **Fix:** Service Worker + FCM; `Scripts/notifications.js`; VAPID keys in runtime-config

---

## 2. ADAPTIVE BITRATE STREAMING (Quality Selection) — **BROKEN UI ONLY**

### Current State (`settings.js:116-119`, `player.js:106-114`)
```javascript
// Settings — VISUAL ONLY (lines 116-119)
<button id="dnm-quality-hd">HD 1080p</button>
<button id="dnm-quality-sd">720p</button>

// Player — Sound toggle exists, NO quality menu (lines 106-114)
<button id="ig-btn-sound">...</button>  // Only sound toggle in top bar
```

### What's Missing
| Component | Status | Required Fix |
|-----------|--------|--------------|
| **HLS/DASH Manifest Parsing** | ❌ None | Integrate `hls.js` or `dash.js` in `player.js` |
| **Multi-bitrate Encoding** | ❌ Single file only | GAS/Drive stores one MP4; need transcoding pipeline (MediaConvert, Mux, or FFmpeg on Cloud Run) |
| **Bandwidth Detection** | ❌ None | `hls.js` auto-ABR or custom `PerformanceObserver` + `navigator.connection` |
| **Quality Selector Menu** | ❌ Buttons don't switch | Bottom sheet with rendition list (Auto, 1080p, 720p, 480p, 360p) |
| **Thumbnail Preview Scrubber** | ❌ Basic bar only | Generate VTT sprite sheet or MP4 keyframe extraction; show tooltip on hover/drag |
| **Stream Token Quality Param** | ❌ Not passed | `getStreamUrl()` in `data.js:400-415` needs `&quality=` param |

### Fix Plan — `player.js` + `data.js` + Backend
1. **Add HLS.js** via CDN in `index.html` 
2. **Modify `getStreamUrl()`** to accept quality param → return HLS manifest URL
3. **Build Quality Menu** in `player.js` top-bar (replace sound-btn area or add `ig-btn-quality`)
4. **Implement ABR Logic**: `hls.js` handles auto; expose `hls.levels` for manual selector
5. **Scrubber Preview**: Generate sprite VTT during upload (`upload.js`); fetch on `mousemove` over scrubber
6. **Persist Preference**: Save selected quality to `StorageAdapter` (`stream_quality` key) — already exists in settings but unused

---

## 3. BROKEN / NON-FUNCTIONAL BUTTONS

| Button / Location | Current Behavior | Expected | Fix |
|-------------------|------------------|----------|-----|
| **Reels Tab: Like** (`reels.js:126-135`) | Visual toggle only (class `liked`, SVG fill) — **NO Firestore sync** | Persist to `likes` subcollection; update `likesCount` on post doc | Add `DNM_FIREBASE.incrementLike(postId)` call in click handler |
| **Reels Tab: Save** (`reels.js:60-62`) | Visual only — no persistence | Save to user's `saved_posts` in Firestore + local StorageAdapter | Wire to `DNM_FIREBASE.savePost()` or `DNM_STORAGE.social.set('saved_posts')` |
| **Reels Tab: Follow** (`reels.js:94-112`) | Local `followingSet` only — **NO Firestore sync**, doesn't update profile follower count | Write to `follows` collection; update `followersCount`/`followingCount` on user docs | Add Firestore batch write in click handler |
| **Player: Quality Selector** | Doesn't exist in player (only in settings, non-functional) | Functional HLS quality menu | See Section 2 |
| **Player: Download** (`player.js:620-632`) | Creates `<a download>` — **fails for proxied streams** (CORS, auth token) | Server-side signed URL or Cloudflare Workers proxy with `Content-Disposition` | Modify `/api/video` to accept `?dl=1` → set header |
| **Player: Share** (`player.js:536-550`) | `navigator.share` fallback only — no Instagram-style share sheet (Copy Link, Share to..., Embed) | Bottom sheet with: Copy Link, Share to DM, Share to..., Report | Add `DNM_MODALS.openShareSheet(postId)` |
| **Explore Search** (`app.js:267-343`) | No debounce (fires on every keystroke), no recent searches, no user accounts in results (only clients) | 300ms debounce, recent searches from storage, user search via Firestore `users` collection | Add debounce, `recentSearches` in StorageAdapter, user query |
| **Upload: Album/Wave/Branch** (`upload.js:165-172`) | Hardcoded `<select>` — values don't persist, no multi-select, no create-new | Chips input with autocomplete from Firestore `albums`/`branches` collections | Replace `<select>` with chip input; persist to post metadata |
| **Settings: HD/SD** (`settings.js:198-220`) | Toggles UI class + localStorage — **doesn't affect actual video quality** | Wire to actual ABR (see Section 2) | Connect to `player.js` quality state |
| **Profile: Edit** (`app.js:660-662`) | Opens onboarding modal — may not save to Firestore | Save `username`, `displayName`, `bio`, `photoURL` to Firestore `users/{uid}` | Add `updateProfile()` in `auth.js` + Firestore write |
| **Comment: Post** (`feed.js:473-522`) | Writes to Firestore — **no optimistic UI** (spinner, instant local append) | Optimistic add to `inMemoryComments`; rollback on error | Prepend to list immediately, sync in background |
| **Share Sheet (Global)** | No native share targets configured (no Web Share Target API manifest) | Register as share target in `manifest.json` + handle in `app.js` | Add `share_target` to PWA manifest; handle `GET /?share_target=...` |

---

## 4. ILLOGICAL / CONFUSING USER FLOWS

| Flow | Problem | Instagram Pattern | Fix |
|------|---------|-------------------|-----|
| **Reels Tab Navigation** (`app.js:169-176`) | Bottom nav "Reels" opens full-screen player immediately — **not a tab**, no grid view | Reels tab = vertical feed grid; tap reel → full-screen player | Separate: `dnm-tab-reels` = grid (`reels.js`); player = modal from grid click |
| **Profile Settings Access** | 3 entry points: Top header gear, Profile slidebar "Settings", Profile tab "Settings" button | Single: Profile → Hamburger menu → Settings | Remove duplicate top-header gear; keep slidebar + profile tab button |
| **Explore Search** (`app.js:267-343`) | Global header search + Explore tab search = duplicate; mixed accounts/reels no filter tabs | Single search entry; tabs: Top, Accounts, Audio, Tags, Places, Reels | Unify into one search controller; add filter chips in dropdown |
| **Upload Flow** (`upload.js:241-394`) | Client → Caption → Album/Wave/Branch → Post — **no draft save**, no scheduling, no music picker | Drafts auto-save; Schedule for later; Music/AR/Green Screen tools | Add `draft` status; `scheduledAt` field; music library integration |
| **Comment Drawer** (`feed.js:370-523`) | No reply threading UI, no like on comments, no report, no pin | Nested replies, heart on comments, "Pin" (author), "Report" | Add reply data model; UI for thread expansion |
| **Follow State Sync** | Reels follow (`reels.js`) ≠ Profile follow (`app.js:753-762`) ≠ Feed follow — separate state | Single source of truth: Firestore `follows` collection | Centralize in `DNM_DATA.followUser()` / `unfollowUser()` |
| **Saved Posts Access** | Only via Profile → Slidebar → Saved — **no bottom nav access** | Dedicated "Saved" in profile tabs (already has tab) + optionally bottom nav | Already has Saved tab in profile — ensure it works; consider bottom nav on tablet |
| **Settings: Stream Quality** | Buttons don't control actual quality | Quality selector in player + global default in settings | Implement ABR (Section 2); settings = default preference |
| **Theme Toggles** | 3 toggles: Top header, Slidebar, Settings — all write same key | Single source: Settings only (or sync all via StorageAdapter listener) | Remove top-header + slidebar toggles; keep Settings only |
| **Search Entry Points** | Header search button → Explore tab; Explore tab has own search bar | Header search = global; Explore = trending/topics | Keep header search global; Explore shows trending without search focus |
| **Brand Profile Follow** (`app.js:753-762`) | Visual toggle only — no Firestore, no "Following" feed filter | Follow brand → appears in Following feed; unfollow removes | Wire to `follows` collection with `targetType: 'brand'` |
| **Video Autoplay Conflict** | Feed observer (`feed.js:637-689`) + Reels observer (`reels.js:138-173`) both run — may fight | Single `IntersectionObserver` per tab; pause all when modal opens | Already has `has-modal` check — verify no race; consider shared `DNM_AUTOPLAY` manager |

---

## 5. UI INCONSISTENCIES — "PLAIN, NOT INSTAGRAM"

### 5.1 Design System Gaps

| Instagram System | Current State | Gap |
|------------------|---------------|-----|
| **Spacing Scale** (4, 8, 12, 16, 24, 32) | Ad-hoc px values throughout CSS | Define `--ig-space-*` tokens; migrate all stylesheets |
| **Border Radius Scale** (4, 8, 12, 16, 20, 28, 50%) | Inconsistent: 6px, 8px, 10px, 12px, 14px, 16px, 22px, 24px | Standardize: `--ig-radius-sm:8px`, `md:12px`, `lg:16px`, `xl:20px`, `2xl:28px`, `full:50%` |
| **Shadow System** (3 elevations) | Ad-hoc `box-shadow` | Define `--ig-shadow-1/2/3`; use consistently |
| **Color Tokens** | Partial (CSS vars exist but not semantic) | Add semantic aliases: `--ig-btn-primary-bg`, `--ig-btn-primary-hover`, `--ig-btn-danger-bg`, `--ig-input-bg`, `--ig-input-border`, `--ig-skeleton-bg`, `--ig-skeleton-shimmer` |
| **Typography Scale** | Only `--ig-font` + size scattered | Define `--ig-text-xs` (11px), `sm` (12px), `base` (14px), `lg` (16px), `xl` (18px), `2xl` (22px); font-weights 400/500/600/700 |
| **Animation Curves** | Only `cubic-bezier(0.16, 1, 0.3, 1)` used | Define `--ig-ease-out-expo`, `--ig-ease-spring`, `--ig-ease-quick`; use for sheets, modals, buttons |
| **Z-Index Scale** | Magic numbers: 20, 25, 30, 35, 40, 1000000, 1000001 | Define `--ig-z-dropdown:100`, `--ig-z-modal:200`, `--ig-z-toast:300`, `--ig-z-sheet:400`, `--ig-z-loading:9999` |

### 5.2 Missing Instagram Signature Patterns

| Pattern | Instagram | Current | Fix |
|---------|-----------|---------|-----|
| **Bottom Sheets** (80% of actions) | Share, Report, Copy Link, More Options, Quality, Speed, Captions, Remix | Custom modals (`.dnm-scrim` + `.dnm-modal-dialog`) — centered, not bottom-anchored | Create `DNM_BOTTOMSHEET` component in `app.js`; replace all modals |
| **Spring Animations** | Like heart pop (cubic-bezier 0.175, 0.885, 0.32, 1.275), sheet drag, follow button | Basic `transition: transform 0.15s` | Add spring curves; implement heart pop on double-tap (exists in player/feed — verify reels) |
| **Skeleton Loaders** | Shimmer placeholders for avatars, feed cards, stories, comments | Spinner only (`.dnm-loading-spinner`) | Add `.dnm-skeleton` + `.dnm-skeleton-shimmer` classes; use in `feed.js`, `reels.js`, `explore.js`, `profile.js` |
| **Pull-to-Refresh** | Feed, Reels, Explore, Profile | None | Add `PullToRefresh` class using `overscroll-behavior` + touch tracking |
| **Header Scroll Physics** | Hide on down-scroll (>15px), instant show on up-scroll, elastic bounce at top | `initSmartHeaderScroll()` exists (`app.js:117-162`) — works but no elastic bounce | Add `transform: translateY(-100%)` with spring; elastic pull at top |
| **Aspect Ratio Handling** | 1:1, 4:5, 16:9, 9:16 — native, no crop | `feed.css:98-110` uses `aspect-ratio` attr — **good**; reels forced 9:16 — **good** | Verify all aspect ratios render correctly; add 4:5 portrait support in reels |
| **Avatar Rings** | Gradient ring for stories, solid for posts, verified badge | Stories: gradient ✓; Posts: gradient ✓; Verified: SVG ✓ | Consistent — minor: story "seen" state uses border color — should desaturate avatar too |
| **Action Button Style** | Rounded pill (40px), icon+label, weighted icons (24-28px), haptic feedback | Square buttons, icon-only in reels/player, inconsistent sizing | Redesign `.dnm-action-btn` / `.ig-action-btn` to 40px pill with label on hover/focus |
| **Divider Consistency** | 1px `var(--ig-border)` full-width or inset 16px | Mix of full-width, inset, none | Standardize: `.dnm-divider` (full), `.dnm-divider-inset` (16px) |
| **Empty States** | Illustration + centered copy + primary action | Plain text "No posts available" | Add illustrated empty states for feed, explore, reels, saved, profile grid |

### 5.3 Tab-by-Tab UI Audit

| Tab | Specific Issues |
|-----|-----------------|
| **Feed** | Stories tray: no "Your Story" add button (only shows if logged in); no story viewer; feed cards lack "Sponsored" label support; no suggested users carousel between cards |
| **Explore** | Grid only — no topic clusters (IGTV, Shop, Reels, Audio tabs); no "For You" personalization; search dropdown lacks recent searches, user accounts |
| **Reels** | Full-screen only (no grid view); vinyl disc animation blocks avatar on click; no progress bar; no volume slider; no speed selector; no caption toggle; no remix button |
| **Settings** | Flat list — Instagram groups: Account, Privacy, Security, Notifications, Ads, Help, About; no 2FA, no data download, no account center |
| **Profile** | Header stats row: followers/following not clickable (should open list); no Highlights row; no Archive tab; no QR code; no Insights; no "Edit Profile" bottom sheet (uses onboarding modal) |
| **Upload** | No drag-reorder for multi-file; no video trimmer; no cover selector; no music picker; no effects/green screen/timer; no drafts; no scheduling |
| **Player** | No quality menu; no scrubber preview thumbnails; no speed (0.3x-2x); no captions/CC; no picture-in-picture; no "Watch on Facebook" cross-post |

---

## 6. FILE-SPECIFIC FIX ROADMAP

### 6.1 `player.js` — **Highest Priority** (Core viewing experience)
| Task | Effort | Details |
|------|--------|---------|
| Integrate `hls.js` for ABR | High | Load via CDN; replace `<video src>` with `hls.loadSource(manifest)` |
| Quality selector bottom sheet | Medium | New `ig-btn-quality` in top bar → bottom sheet with rendition list |
| Scrubber thumbnail preview | High | Generate sprite VTT during upload; fetch on `mousemove` over `.ig-scrubber-bar` |
| Speed selector (0.3x-2x) | Low | Bottom sheet in `⋯` menu; `video.playbackRate` |
| Captions/CC toggle | Medium | WebVTT support; parse from Firestore `captions` field |
| Volume slider | Low | Replace mute toggle with slider in `⋯` menu |
| Picture-in-Picture | Low | `video.requestPictureInPicture()` in `⋯` menu |
| Remix / Collab buttons | High | New action items → open multi-track recorder in `upload.js` |
| Share sheet (Instagram-style) | Medium | Bottom sheet: Copy Link, Share to DM, Share to..., Report, Embed |

### 6.2 `feed.js` — **High Priority** (Primary engagement surface)
| Task | Effort | Details |
|------|--------|---------|
| Pull-to-refresh | Medium | Touch-tracking + `overscroll-behavior: contain` + skeleton reload |
| Skeleton loaders for cards | Low | `.dnm-skeleton-card` matching `.dnm-post-card` structure |
| Suggested users carousel | Medium | Insert every 5 cards; query Firestore `users` with `isSuggested: true` |
| Infinite scroll pagination | Medium | `IntersectionObserver` on sentinel; `limit(10)` + cursor |
| Optimistic comment UI | Medium | Prepend to `inMemoryComments` immediately; background sync |
| Comment reply threading | High | Nested `.ig-reply-item` in `ig-comments-drawer` (player.css has styles) |
| Comment like + report | Medium | Heart on comment; `⋯` menu → Report → Firestore `reports` collection |
| Sponsored post support | Low | Add `isSponsored` flag; render "Sponsored" badge in header |

### 6.3 `reels.js` — **High Priority** (Reels tab experience)
| Task | Effort | Details |
|------|--------|---------|
| **Fix: Reels tab = Grid, not Player** | Critical | `app.js:169-176` → remove auto-player; `reels.js` renders grid; click → `DNM_PLAYER.openVideoPlaybackModal()` |
| Sync Like/Save/Follow to Firestore | High | Wrap handlers in `DNM_FIREBASE.incrementLike()`, `DNM_DATA.savePost()`, `DNM_DATA.followUser()` |
| Add progress bar to each reel | Low | `<div class="ig-scrubber-bar">` at bottom of `.dnm-reel-viewport` |
| Volume slider + mute memory | Medium | Persist per-reel volume in StorageAdapter |
| Speed selector | Low | Long-press or `⋯` menu |
| Caption toggle | Low | `⋯` menu → toggle `.dnm-reel-caption-text` visibility |
| Remix button | High | Action stack item → `DNM_UPLOAD.openRemixModal(reel)` |
| Follow button sync | Medium | Centralize follow state in `DNM_DATA`; listen for `dnm-follow-changed` |

### 6.4 `settings.js` — **Medium Priority**
| Task | Effort | Details |
|------|--------|---------|
| Replace HD/SD buttons with functional quality default | Medium | Connect to ABR system (Section 2); save preference to `stream_quality` |
| Reorganize into Instagram sections | Low | Account, Privacy, Security, Notifications, Ads, Help, About |
| Add 2FA setup | High | Firebase Auth: `user.multiFactor.enroll()` + TOTP/SMS |
| Add Account Switching | High | Firebase `fetchSignInMethodsForEmail` + account chooser modal |
| Add Close Friends management | Medium | Firestore `closeFriends` subcollection; UI in slidebar |
| Add Data Download / Delete Account | Medium | GDPR compliance; Cloud Function for data export |
| Add Push Notification toggles | Medium | FCM topic subscriptions per category |
| Remove duplicate theme toggles | Low | Keep only Settings toggle; remove top-header + slidebar |

### 6.5 `upload.js` — **High Priority** (Content creation)
| Task | Effort | Details |
|------|--------|---------|
| Draft auto-save (local + cloud) | Medium | `localStorage` draft key; periodic Firestore `drafts/{uid}/{draftId}` |
| Scheduled posting | Medium | `scheduledAt` field; Cloud Scheduler / Cloud Function to publish |
| Video trimmer | High | Canvas-based trim UI; output trimmed blob |
| Cover selector (frame picker) | Medium | Scrubber + "Select Cover" button; save frame as `coverUrl` |
| Music / Audio library | High | Licensed music API (Epidemic, Meta Sound Collection) or user upload |
| AR Effects / Filters | Very High | WebGL shaders / MediaPipe — likely out of scope |
| Green Screen / Align / Timer | High | Camera overlay tools in Story/Reel camera |
| Multi-file album (carousel) | Medium | Multiple files → single post with `media[]` array; swipe in player |
| Collab / Co-author invite | High | Invite flow → `collaborators[]` on post; shared ownership |
| Reels Templates | High | Pre-cut timing JSON; apply to user clips |
| Text-to-Speech / Voiceover | Medium | Web Speech API or ElevenLabs integration |

### 6.6 `auth.js` — **Medium Priority**
| Task | Effort | Details |
|------|--------|---------|
| 2FA (TOTP/SMS) | High | Firebase Multi-factor Auth |
| Account Switching | Medium | Store multiple `user_session` keys; avatar stack in header |
| Close Friends list management | Medium | UI in profile slidebar; Firestore sync |
| Verification request flow | Medium | Form → Firestore `verificationRequests`; admin review in Client Portal |
| Phone/Email backup | Low | `user.updatePhoneNumber()`, `user.updateEmail()` |

### 6.7 `app.js` — **High Priority** (Navigation & Shell)
| Task | Effort | Details |
|------|--------|---------|
| Bottom Sheet component (`DNM_BOTTOMSHEET`) | High | Reusable class: `open(content, options)`, drag-to-dismiss, backdrop blur |
| Replace all modals with bottom sheets | High | `DNM_MODALS` → use `DNM_BOTTOMSHEET`; consistent animation |
| Unified Search Controller | Medium | Single `DNM_SEARCH` module; debounce, recent searches, user/hashtag/place results |
| Header scroll physics (elastic) | Medium | Add spring at top; `transform: translateY()` with `cubic-bezier(0.16, 1, 0.3, 1)` |
| Profile header: clickable stats | Low | `followersCount`/`followingCount` → open bottom sheet with user list |
| Brand profile follow sync | Medium | Wire `dnm-brand-follow-btn` to `DNM_DATA.followBrand()` |
| QR Code / Nametag generator | Low | `qrcode` library; profile slidebar → "QR Code" → bottom sheet with SVG |

### 6.8 `profile.js` (in `app.js:375-763`) — **Medium Priority**
| Task | Effort | Details |
|------|--------|---------|
| Story Highlights row | Medium | Render above grid; Firestore `highlights` collection; cover editor |
| Archive tab | Medium | `hidden: true` posts → Archive grid; "Show on profile" action |
| Insights tab (creator) | High | Charts: reach, impressions, engagement, follower growth (Chart.js) |
| Saved Collections (folders) | Medium | `savedPosts` → `savedCollections` with `collectionId`; UI in Saved tab |
| QR Code / Nametag | Low | See `app.js` |
| Verified badge request | Medium | See `auth.js` |

### 6.9 Stylesheets — **Design System Overhaul**
| File | Key Changes |
|------|-------------|
| `instagram-core.css` | Add design tokens (spacing, radius, shadow, color semantics, typography, z-index, animation curves); skeleton shimmer keyframes; bottom sheet base styles |
| `feed.css` | Skeleton card variant; suggested user card; sponsored badge; consistent action button pills |
| `reels.css` | Grid view (new); progress bar overlay; volume/speed/caption controls; remix button |
| `player.css` | Quality menu bottom sheet; scrubber thumbnail tooltip; speed/captions/PIP menus; share sheet |
| `settings.css` | Section groups (Account, Privacy, etc.); 2FA UI; account switcher; notification toggles |
| `profile.css` | Highlights row; archive tab; insights charts container; collections in Saved; QR code sheet |
| `upload.css` | Trimmer UI; cover selector; music picker; effects tray; draft banner; schedule picker |
| `explore.css` | Search filter chips; topic cluster sections; recent searches; skeleton grid |

### 6.10 New Files Needed
| File | Purpose |
|------|---------|
| `Scripts/messaging.js` | DM system: threads, real-time sync, push, media, reactions |
| `Scripts/stories.js` | Story camera (capture, edit, stickers, music), viewer (24h, replies, highlights) |
| `Scripts/notifications.js` | FCM/Web Push; in-app notification center; deep links |
| `Scripts/bottomsheet.js` | Reusable `DNM_BOTTOMSHEET` component (extract from modal patterns) |
| `Scripts/search.js` | Unified `DNM_SEARCH` with debounce, recent, filters, user results |
| `Scripts/insights.js` | Creator analytics dashboard (Chart.js wrapper) |
| `Scripts/trimmer.js` | Video trimmer UI for upload |
| `public/sw.js` | Service Worker for offline caching, push, background sync |
| `manifest.json` | PWA manifest + Share Target API registration |

---

## 7. BACKEND / INFRASTRUCTURE REQUIREMENTS

| Requirement | Current | Needed For |
|-------------|---------|------------|
| **HLS/DASH Transcoding Pipeline** | Single MP4 on Drive | Adaptive quality, scrubber thumbnails, fast start |
| **Cloudflare Stream / Mux / MediaConvert** | None | ABR, signed URLs, analytics, DRM option |
| **Firestore Collections** | `posts`, `comments` | Add: `users`, `follows`, `conversations`, `messages`, `stories`, `highlights`, `closeFriends`, `notifications`, `reports`, `verificationRequests`, `drafts`, `channels`, `albums`, `music` |
| **Cloud Functions** | None | Scheduled posts, data export, transcoding triggers, notification fan-out, search indexing (Algolia/Meilisearch) |
| **FCM / Web Push** | None | Push notifications for all events |
| **Service Worker** | Planned, not implemented | Offline feed, background sync, push handling |
| **Search Index** | Client-side filter only | Algolia / Meilisearch / Typesense for user/hashtag/place search |
| **CDN for Thumbnails/Sprites** | Data URLs in JSON | Cloudflare R2 / Images for sprite sheets, story frames |

---

## 8. PRIORITIZED IMPLEMENTATION ORDER

### Phase 1: Core Experience Fixes (Weeks 1-3)
1. **Fix Reels tab navigation** — Grid view, not auto-player (`app.js`, `reels.js`)
2. **Wire Reels Like/Save/Follow to Firestore** (`reels.js`, `firebase-config.js`)
3. **Implement ABR + Quality Selector** (`player.js`, `data.js`, backend transcoding)
4. **Bottom Sheet component + migrate modals** (`app.js` → new `bottomsheet.js`)
5. **Pull-to-refresh + Skeleton loaders** (`feed.js`, `reels.js`, `instagram-core.css`)
6. **Unified Search with debounce + recent + user results** (`app.js`, new `search.js`)

### Phase 2: Instagram Parity Features (Weeks 4-8)
7. **Stories Camera + Viewer + Highlights** (new `stories.js`)
8. **Direct Messages** (new `messaging.js` + FCM)
9. **Upload: Drafts, Trim, Cover, Music, Scheduling** (`upload.js`, new `trimmer.js`)
10. **Reels: Progress bar, Speed, Captions, Remix** (`player.js`, `reels.js`)
11. **Profile: Highlights, Archive, QR, Insights** (`app.js` profile section)
12. **Settings: Sections, 2FA, Account Switch, Notifications** (`settings.js`, `auth.js`)

### Phase 3: Platform Scale (Weeks 9+)
13. **Live Streaming** (WebRTC SFU or Mux)
14. **Broadcast Channels**
15. **Shopping / Product Tagging**
16. **AR Effects / Filters**
17. **Creator Monetization (Badges, Gifts, Subscriptions)**
18. **Advanced Search (Places, Audio, Hashtag autocomplete)**

---

## 9. ESTIMATED EFFORT SUMMARY

| Area | Files to Modify | New Files | Est. Dev Days |
|------|-----------------|-----------|---------------|
| Video Player + ABR | `player.js`, `data.js`, `settings.js`, `instagram-core.css`, `player.css` | — | 15 |
| Reels Tab Fix + Sync | `reels.js`, `app.js`, `firebase-config.js`, `reels.css` | — | 8 |
| Bottom Sheets + Modals | `app.js`, `feed.js`, `player.js`, `settings.js`, `profile.css`, `instagram-core.css` | `bottomsheet.js` | 12 |
| Search + Discovery | `app.js`, `explore.css`, `feed.js` | `search.js` | 8 |
| Stories System | — | `stories.js`, `stories.css` | 20 |
| Direct Messages | — | `messaging.js`, `notifications.js` | 25 |
| Upload Studio Enhancements | `upload.js`, `upload.css` | `trimmer.js` | 18 |
| Profile + Settings Overhaul | `app.js`, `settings.js`, `auth.js`, `profile.css`, `settings.css` | — | 15 |
| Design System Tokens | `instagram-core.css`, all feature CSS | — | 10 |
| Backend/Infra (Transcoding, Functions, FCM) | — | Cloud Functions, SW, Manifest | 20 |
| **Total** | **9 existing** | **6 new** | **~151 days** |

---

## 10. QUICK WINS (Do This Week)

1. **Fix Reels tab** — Change `app.js:169-176` to render grid via `reels.js` instead of opening player
2. **Wire Reels Like/Save/Follow** — Add Firestore calls in `reels.js:94-135`
3. **Add skeletons** — Define `.dnm-skeleton` in `instagram-core.css`; use in `feed.js`, `reels.js`, `explore.js`
4. **Debounce search** — 300ms in `app.js:240`
5. **Remove duplicate theme toggles** — Delete top-header + slidebar handlers; keep Settings only
6. **Add pull-to-refresh** — 50 lines in `feed.js` + CSS
7. **Player download fix** — Add `?dl=1` to `/api/video` for `Content-Disposition: attachment`
8. **Quality selector UI** — Build bottom sheet in `player.css` (non-functional until ABR backend ready)

---

## Appendix: Key File References

| Module | Path | Lines of Interest |
|--------|------|-------------------|
| App Router | `Scripts/app.js` | `switchTab()` (185), `setupBottomNav()` (164), `initSmartHeaderScroll()` (117) |
| Feed | `Scripts/feed.js` | `initFeed()` (30), `renderFeedCards()` (84), `openCommentsDrawer()` (370) |
| Reels Tab | `Scripts/reels.js` | `initReelsTab()` (12), `attachReelsEvents()` (93) |
| Player | `Scripts/player.js` | `openVideoPlaybackModal()` (12), `syncReelUi()` (272), quality — **missing** |
| Upload | `Scripts/upload.js` | `openUploadModal()` (128), `handleFileSelect()` (225), `publishBtn` (241) |
| Settings | `Scripts/settings.js` | `renderSettings()` (14), quality buttons (116), `attachSettingsEvents()` (147) |
| Auth | `Scripts/auth.js` | `signInWithGoogle()` (38), `openOnboardingModal()` (140) |
| Data Layer | `Scripts/data.js` | `getStreamUrl()` (400), `mergeAllReels()` (54), `followUser()` — **missing** |
| Firebase | `Scripts/firebase-config.js` | `syncPosts()` (86), `savePost()` (108), `syncComments()` (175) |
| Core Styles | `Stylesheets/instagram-core.css` | Design tokens (4), Dark mode (27), Bottom nav (232), Modals (418) |
| Player Styles | `Stylesheets/player.css` | `.ig-player-wrapper` (1184), scrubber (1562), comments drawer (1701) |
| Feed Styles | `Stylesheets/feed.css` | Post card (11), Media wrapper (98), Action row (216) |
| Reels Styles | `Stylesheets/reels.css` | Viewport (19), Actions stack (40), Vinyl disc (80) |
| Profile Styles | `Stylesheets/profile.css` | Header (4), Slidebar (237), Stats (41), Tabs (140) |

---

*End of Audit — Generated from codebase analysis as of 2026-10-28*