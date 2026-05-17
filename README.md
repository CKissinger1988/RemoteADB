# RemoteADB Workspace

This workspace includes the RemoteADB backend, frontend, Android installer, and desktop control UI.

Projects:
- `Remote-ADB-Android` — ADB installer scripts for Android/Windows persistence.
- `Remote-ADB-Back` — Node backend service with ADB device control and frontend hosting.
- `Remote-ADB-Front` — Web-based frontend UI and Electron desktop wrapper.
- `Remote-ADB-Control` — additional controller UI renderer scripts.

## Quick start (backend + browser frontend)

1. Open `RemoteADB.code-workspace` in VS Code.
2. In `Remote-ADB-Back` run:
   - `npm install`
   - `npm start`
3. In `Remote-ADB-Front` run:
   - `npm install`
4. Open the frontend in a browser at `http://127.0.0.1:5200`

## Electron desktop frontend

1. In `Remote-ADB-Front` run:
   - `npm install`
   - `npm start`
2. The Electron app will launch and connect to the backend on `http://127.0.0.1:5200`.

## Install ADB (optional)

1. Copy `adb.exe` into `Remote-ADB-Back/installer/bin/`.
2. Run `Remote-ADB-Back/installer/install.ps1` from PowerShell.

The installer now requests Administrator elevation automatically if it is not already running elevated.

## Environment variables

- `AUTH_SECRET` — enable frontend login authentication.
- `HTTPS` — set to `true` to enable HTTPS.
- `SSL_KEY` / `SSL_CERT` — paths to TLS key and certificate.
- `REDIRECT_PORT` — optional HTTP redirect port when HTTPS is enabled.

## Notes

- The backend hosts the frontend and API together for same-origin access.
- The Electron frontend includes a tray menu and connects to the backend automatically if available.
- If backend authentication is enabled, users must sign in with the secret before using the app.
