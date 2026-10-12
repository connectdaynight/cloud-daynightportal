# Day Night Client Portal - Cloudflare & Google Drive Deployment Guide

This guide walks you through deploying the **Day Night Media Client Portal** to **Cloudflare Pages** ($0 free tier) and connecting it to **Google Drive** via **Google Apps Script** for video storage, streaming, and database synchronization.

---

## 📁 Repository Structure

* [**`index.html`**](file:///d:/ZDDayNightHost/index.html): Production entry point for Cloudflare Pages (exact same theme, aligned code, real engine).
* [**`day-night-client-portal.html`**](file:///d:/ZDDayNightHost/day-night-client-portal.html): Mirror copy of the portal.
* [**`_headers`**](file:///d:/ZDDayNightHost/_headers): Cloudflare security and caching header rules.
* [**`gas/Code.gs`**](file:///d:/ZDDayNightHost/gas/Code.gs): Complete serverless backend for Google Apps Script.
* [**`portal-data.json`**](file:///d:/ZDDayNightHost/portal-data.json): Standalone seed dataset (settings, clients, reels).

---

## Part 1: Deploy Google Apps Script (Backend & Google Drive)

1. Open [script.google.com](https://script.google.com/) (or in Google Drive: **+ New** > **More** > **Google Apps Script**).
2. Title your project: `Day Night Media Portal Backend`.
3. Open [`gas/Code.gs`](file:///d:/ZDDayNightHost/gas/Code.gs), copy the entire code, and paste it into the editor replacing any existing text.
4. Click the **Save** icon (`Ctrl+S`).
5. In the top right, click **Deploy** > **New deployment**.
6. Click the gear icon next to "Select type" and choose **Web app**.
7. Set the configuration:
   * **Description**: `Production v1`
   * **Execute as**: `Me (your Google email)`
   * **Who has access**: `Anyone` *(Crucial: Allows Cloudflare Pages to communicate with Google Drive)*.
8. Click **Deploy**.
9. Click **Authorize access** > Choose your Google account > Click **Advanced** > Click **Go to Day Night Media Portal Backend (unsafe)** > Click **Allow**.
10. Copy your **Web app URL** (looks like `https://script.google.com/macros/s/.../exec`).

---

## Part 2: Deploy to Cloudflare Pages (Frontend)

You have two simple options to deploy to Cloudflare:

### Option A: Cloudflare Dashboard (Drag & Drop or Git)
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) and navigate to **Workers & Pages** > **Create application** > **Pages**.
2. **Direct Upload (Easiest)**:
   * Select **Upload assets**.
   * Give your project a name (e.g. `daynight-portal`).
   * Drag and drop the `ZDDayNightHost` folder (containing `index.html`, `_headers`).
   * Click **Deploy site**.
3. **Or Connect to GitHub**:
   * Push this repository to GitHub and connect it to Cloudflare Pages.
   * Build command: *(leave empty)*
   * Output directory: *(leave empty or `./`)*
   * Click **Save and Deploy**.

### Option B: Cloudflare Wrangler CLI
From your terminal in `d:/ZDDayNightHost`:
```powershell
npx wrangler pages deploy . --project-name daynight-portal
```

---

## Part 3: Connect & Test in Real-Time

1. Open your live Cloudflare Pages URL (or open `index.html` locally).
2. On the **Splash screen**, click the **Gear icon** in the top right (or enter PIN `0000` / `9999` in the PIN modal).
3. Select **Google Apps Script & Drive Setup**.
4. Paste your **Apps Script Web App URL** from Part 1 into the field.
5. Click **Save & Test Connection**.
6. The status pill will instantly turn **🟢 Google Drive connected**!

---

## ✨ Features Available in Production

1. **In-App 9:16 Video Player**:
   * Tapping any reel poster or clicking **View** opens a responsive 9:16 modal streaming the video natively via Google Drive.
2. **Direct Video Upload to Google Drive**:
   * In the Admin panel, click **+ Add Reel**, choose **Upload to Drive**, select an MP4 file (up to 50MB), and watch the progress bar upload and register the reel directly to Google Drive.
   * Or switch to **Paste Link** to paste any existing Google Drive link.
3. **Client PIN Isolation**:
   * Client PIN `4821` authenticates The Chennai Silks.
   * Master Admin PIN `0000` or `9999` instantly opens the Admin Panel.
4. **100% Preserved Theme**:
   * Exact milk-white background, navy typography, colorful icons, canvas confetti burst, typewriter tagline animations, and zari-bordered reel posters.
