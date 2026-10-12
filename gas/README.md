# Google Apps Script Setup Guide (2 Minutes)

Follow these steps to deploy your Google Drive backend:

### Step 1: Create a Google Apps Script Project
1. Go to [script.google.com](https://script.google.com/) or open [Google Drive](https://drive.google.com/) -> Click **+ New** -> **More** -> **Google Apps Script**.
2. Rename the project at the top to: `Day Night Media Portal Backend`.

### Step 2: Paste the Code
1. Erase anything currently in `Code.gs`.
2. Open `gas/Code.gs` from this project, copy the entire code, and paste it into the Apps Script editor.
3. Click the **Save** floppy icon (or press `Ctrl+S`).

### Step 3: Deploy as Web App
1. At the top right, click **Deploy** -> **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the deployment settings:
   - **Description**: `Production Backend v1`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` *(Crucial: This enables Cloudflare Pages to communicate with your Drive backend)*.
4. Click **Deploy**.
5. Click **Authorize access** -> Select your Google Account -> Click **Advanced** -> Click **Go to Day Night Media Portal Backend (unsafe)** -> Click **Allow**.

### Step 4: Copy Your Web App URL
1. Copy the **Web app URL** (it looks like `https://script.google.com/macros/s/.../exec`).
2. Open your deployed portal on Cloudflare (or locally), click the **Gear icon** in the top right (Admin), paste the URL into **Google Apps Script Web App URL**, and click **Save & Test Connection**.
3. You will immediately see: **🟢 Connected to Google Drive & Google Apps Script**!
