# Remote ADB Solution

[![Android APK](https://github.com/CKissinger1988/RemoteADB/actions/workflows/build-android.yml/badge.svg)](https://github.com/CKissinger1988/RemoteADB/actions/workflows/build-android.yml)
[![Release](https://img.shields.io/github/v/release/CKissinger1988/RemoteADB)](https://github.com/CKissinger1988/RemoteADB/releases)

A comprehensive, professional-grade suite for remote Android device management over ADB. Provides a full-featured web UI and Electron desktop app that bridges your Windows PC to any connected Android device — over USB or Wi-Fi.

---

## 🚀 Features

### Core Management
- **Device Dashboard** — Real-time device list with auto-polling every 5 seconds
- **Auto-Connect** — Remembers preferred devices and reconnects automatically on startup
- **ADB Auto-Detection** — Finds `adb.exe` automatically from `ADB_PATH`, bundled installer, or system PATH (`where adb`)
- **Reverse Port Forwarding** — Automatically runs `adb reverse tcp:5200 tcp:5200` on device connect, and re-applies it whenever a device is replugged (via `adb track-devices` watcher)

### Remote Control & Interaction
- **Screen Preview** — Captures and displays a live screenshot; click anywhere on the preview to send a precise tap to the device
- **Quick Shell** — Full ADB shell terminal with persistent output log, Enter-key support, and syntax-colored output
- **Device Wake** — Remote wake-up command via `input keyevent 26`

### File Explorer
- **Remote File Browser** — Browse `/sdcard` (or any path) with file cards showing name and size
- **Drag-and-Drop Uploads** — Drop files anywhere in the File Manager panel to upload them to the current device directory
- **Upload Progress Bar** — Real-time percentage progress bar with a Cancel button for large uploads (supports up to ~37 MB files)
- **File Downloads** — Pull any file from the device directly to your browser download folder

### Media & Capture
- **Screen Recording** — Start/stop `screenrecord` with automatic MP4 pull to your local machine
- **Camera Control** — Open the camera app, trigger the shutter, and download the latest photo from `DCIM/Camera`
- **Microphone Recording** — Record audio via `tinycap` (developer/rooted devices) and download as WAV

### Settings & Updates
- **Auto-Update System** — Backend polls GitHub Releases hourly; prompts with one-click update and restart
- **ADB Reinstaller** — Trigger the PowerShell ADB installer from within the UI (runs elevated)
- **Dark / Light Mode** — Persistent theme preference stored in `localStorage`

---

## 🏗️ Architecture

```
RemoteADB/
├── Remote-ADB-Back/        Node.js + Express REST API server
│   └── src/backend.js      ADB wrapper, device watcher, file/screen/media endpoints
│
├── Remote-ADB-Front/       Web SPA + Electron desktop shell
│   ├── index.html          4-tab SPA: Dashboard, File Manager, Media, Settings
│   ├── app.js              All frontend logic (~1100 lines)
│   ├── styles.css          CSS custom-property theming (dark/light)
│   └── main.js             Electron: spawns backend, system tray, auto-updater
│
├── Remote-ADB-Control/     Lightweight standalone Electron control panel
│   ├── index.html          Connect / Disconnect / Shell UI
│   ├── main.js             Electron main process
│   └── preload.js          contextBridge → window.adb (connect/disconnect/shellCommand)
│
└── Remote-ADB-App/         Android companion app (Kotlin + WebView)
    └── app/src/main/       Loads the web UI inside a full-screen WebView
```

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js** v18 or higher
- **Windows** (for the ADB installer and Electron desktop app)
- **ADB** (`adb.exe`) — either place it in `Remote-ADB-Back/installer/bin/adb.exe` or install [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools) and add to PATH

### 1. Install dependencies

```bash
cd Remote-ADB-Back  && npm install
cd ../Remote-ADB-Front && npm install
```

### 2. Run

**Browser mode** (dev / headless):
```bash
cd Remote-ADB-Back
npm start
# Then open http://127.0.0.1:5200
```

**Electron desktop mode** (full app with tray):
```bash
cd Remote-ADB-Front
npm start
```

**Standalone control panel** (minimal, no backend spawning):
```bash
cd Remote-ADB-Control
npm install
npm start
# Requires the backend to already be running on port 5200
```

---

## 📱 Android Companion App

The `Remote-ADB-App` APK can be installed on an Android device to provide a native WebView wrapper for the backend UI. It:
- Loads `http://127.0.0.1:5200` by default (reachable via `adb reverse`)
- Allows changing the backend URL (LAN IP for Wi-Fi ADB)
- Saves and restores the last URL in SharedPreferences
- Shows a Snackbar retry prompt on connection failure
- Checks GitHub Releases for new APK versions on startup

**Build / Download**: The APK is built and published automatically via [GitHub Actions](https://github.com/CKissinger1988/RemoteADB/actions/workflows/build-android.yml) on every push to `master`.

---

## 🔒 Security

| Feature | Details |
|---|---|
| **Authentication** | Set `AUTH_SECRET` env var to enable HMAC cookie-based login on all routes |
| **TLS/HTTPS** | Set `HTTPS=1`, `SSL_KEY`, and `SSL_CERT` env vars; HTTP-to-HTTPS redirect included |
| **CSP Headers** | Strict `default-src 'self'` Content Security Policy on all responses |
| **Security Headers** | `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` |
| **Path Validation** | All file download/upload paths validated — path traversal attacks are blocked |
| **No Auth by Default** | For LAN-only use. Enable `AUTH_SECRET` if the backend is exposed beyond localhost |

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5200` | HTTP port for the backend server |
| `HOST` | `0.0.0.0` | Bind address |
| `ADB_PATH` | auto-detected | Full path to `adb.exe` |
| `AUTH_SECRET` | *(none)* | Enable login gate with this HMAC secret |
| `HTTPS` | `0` | Set to `1` to enable TLS |
| `SSL_KEY` | `certs/server.key` | Path to TLS private key |
| `SSL_CERT` | `certs/server.crt` | Path to TLS certificate |
| `REDIRECT_PORT` | `PORT+1` | HTTP→HTTPS redirect server port |

---

## 📋 Changelog

### v1.1.0
- **Fixed** critical crash on page load — `tapBtn`/`swipeBtn` null references halted all JS initialization
- **Fixed** device list never auto-refreshing — `pollDevices()` now runs every 5 seconds
- **Fixed** screen recording state machine — failed recordings no longer leave `recordingPath` set, causing false 500s on `/camera/record/stop`
- **Fixed** duplicate "Connect" button rendered per device card
- **Added** Enter key support on the Quick Shell command input
- **Added** `resolveAdbPath()` in Electron `main.js` — auto-detects system ADB via `where adb`; no manual config needed
- **Added** 12 missing CSS class rules (`btn-primary`, `btn-icon`, `btn-small`, `btn-warn`, `terminal-output`, `version-badge`, etc.)
- **Added** ARIA roles and `aria-label` attributes for accessibility (tab navigation, all inputs)
- **Added** `Remote-ADB-Control` — new lightweight standalone Electron control panel with `contextBridge` IPC
- **Added** `Remote-ADB-App` to VS Code workspace; fixed broken `install.ps1` workspace task
- **Added** `favicon.ico` for system tray and browser tab
- **Improved** JSON body limit raised from 1 MB to 50 MB for large file uploads
- **Improved** CSS dead-code removed (10 orphaned rules), 6 duplicate selectors eliminated
- **Improved** Release CI/CD workflows for both Electron desktop app and backend ZIP (were empty)
- **Added** comprehensive test suite: `test-all.js`, `test-frontend.js`, `test-android.js`

### v1.0.0
- Initial release: backend API, web SPA, Electron shell, Android WebView app, PowerShell ADB installer

---

## 🧪 Testing

```bash
# Full backend API test suite (72 tests)
node test-all.js

# Frontend HTML/CSS/JS/accessibility test suite (183 tests)
node test-frontend.js

# Android connectivity & project validation (114 tests)
node test-android.js
```

---

## 📝 License

MIT License — see [LICENSE](LICENSE) for details.

---

*Professional-grade remote Android management — built for developers, QA engineers, and power users.*
