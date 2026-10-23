# SADV Logger - Geolocation Attendance & Shift Management System

A full-stack, decoupled **Geolocation Attendance, Leave, and Device Management System** developed for **SA Digital Villages (SADV)** matching the vibrant brand aesthetics, colors, and themes of [sadv.co.za](https://sadv.co.za/).

---

## 🎨 SADV Brand Palette & Design Tokens

- **Electric Navy Blue (`#0553a0`):** Core corporate color, navigation, primary buttons, table headers.
- **Vibrant Cyan (`#00b4d8` / `#51edf1`):** High-speed fibre gradients, glow effects, highlights.
- **Hot Pink / Magenta (`#ff40b4`):** Signature "Live XTRA" pill buttons, badges, critical alerts.
- **Electric Yellow (`#ffe600`):** Accent tags and highlights.
- **Modern Typography:** Plus Jakarta Sans & JetBrains Mono with glassmorphism and micro-animations.

---

## 📁 System Architecture

```text
SADV_Logger/
├── Code.gs                   # Complete Google Apps Script backend & Web App API
├── index.html                # SADV branded Login & Registration portal
├── auth/
│   └── auth.js               # Sign in/up logic, validation, role-based redirection
├── shared/
│   ├── css/
│   │   └── base.css          # Core SADV design system tokens, modals, tables, badges
│   └── js/
│       ├── api.js            # CORS-safe fetch client, google.script.run shim, session helpers
│       └── leave.js          # Shared modal controller for leave applications
├── employee/
│   ├── index.html            # Staff attendance portal (GPS Clock In/Out & Leave)
│   ├── employee.css          # Mobile-first responsive card layout
│   └── employee.js           # Live clock, geolocation telemetry logger
└── admin/
    ├── index.html            # Operations Dashboard with 7 tabs & modal managers
    ├── admin.css             # Wide dashboard layout, toolbar filters, badges
    └── admin.js              # Real-time telemetry, shift editing/deleting, PDF/CSV/ZIP export
```

---

## 🚀 Deployment Guide

### Step 1: Initialize Google Sheets Database
1. Open [Google Sheets](https://sheets.new) and create a new spreadsheet named **"SADV Logger Database"**.
2. Go to **Extensions** → **Apps Script**.
3. Replace the contents of `Code.gs` with the code in `Code.gs` from this project.
4. Select the function **`setupDatabase`** in the function dropdown and click **Run**.
5. Grant permissions when prompted. The script will automatically generate all 6 formatted sheets:
   - `Users`
   - `Activity_Logs`
   - `Daily_Summaries`
   - `Weekly_Summaries`
   - `Monthly_Summaries`
   - `Leave_Requests`

### Step 1b: Google Sheets Custom Menu Tab
Whenever you open or reload your Google Sheet, a custom top-level menu tab **`⚡ SADV Logger`** appears in the spreadsheet toolbar:
- **`🔄 Extract Logs to Daily Summaries (Calculate Hours)`**: Automatically synchronizes unlinked activity logs into daily summaries, calculates floor hours and overtime, updates pending shifts, and aggregates weekly and monthly totals with real-time popup confirmation.
- **`🕒 Standardize Clock-Out Floor Times`**: Ensures historical records adhere strictly to standardized floor out policies.

### Step 2: Deploy Backend Web App
1. In Apps Script, click **Deploy** → **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set the configuration:
   - **Execute as:** `Me` (your Google Account)
   - **Who has access:** `Anyone`
4. Click **Deploy** and copy the **Web App URL** (ends in `/exec`).

### Step 3: Connect Frontend to Backend
1. Open [`shared/js/api.js`](shared/js/api.js).
2. Set the `APPS_SCRIPT_WEB_APP_URL` variable to your copied Web App URL:
   ```javascript
   const APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/YOUR_EXEC_ID/exec";
   ```

### Step 4: Configure Admin Account
1. Open `index.html` in your browser (or deploy to **GitHub Pages**).
2. Register your administrative account through the registration form.
3. Open your Google Sheet, switch to the **`Users`** sheet, and change your user's **`Account Type`** column from `Employee` to `Admin`.
4. Return to the portal and log in to access the **Manager Dashboard**.

---

## ⏱️ Core Business Logic & Floor Times

- **Clock-In Floor Time:** Records the exact morning telemetry time formatted as `HH:mm` (**excluding seconds**).
- **Clock-Out Floor Time:** Standardized end time: `17:00` (Monday – Friday) and `13:00` (Saturday).
- **Lunch Deduction:** Deducts exactly 1 hour for lunch when standard work minutes exceed 1 hour on Monday – Friday (no lunch deduction on Saturday).
- **Overtime Lockdown:** Normal clock-outs lock overtime to `0 mins`. Overtime is only awarded when an Admin explicitly edits a shift beyond standard end times.
- **Auto-Failsafes:** Automatically closes orphaned shifts from previous days and auto-generates clock-in records if an employee clocks out without a prior clock-in.
- **Exports:** PDF, CSV, and ZIP timesheet reports with official SADV corporate styling.