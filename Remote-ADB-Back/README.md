# Remote-ADB-Back

Backend service for remote ADB control, frontend hosting, and ADB persistence support.

## Overview

- `src/backend.js` runs the Node backend service and hosts the frontend UI.
- `installer/install.ps1` installs ADB, creates persistence, and configures reverse port forwarding.
- `installer/startup.ps1` restores ADB reverse forwarding after reboot.

## Quick start

1. Copy `adb.exe` into `installer/bin/`.
2. Run `installer/install.ps1` from PowerShell.
   - The installer will request Administrator elevation automatically if needed.
3. Start the backend:
   - `npm install`
   - `npm start`

## Frontend options

- Browser UI: `http://127.0.0.1:5200`
- Electron desktop: open `Remote-ADB-Front`, install dependencies, and run `npm start`

## HTTPS and wireless access

To use HTTPS, set env vars before starting the backend:

```powershell
$env:HOST = '0.0.0.0'
$env:HTTPS = 'true'
$env:SSL_KEY = 'C:\path\to\server.key'
$env:SSL_CERT = 'C:\path\to\server.crt'
$env:REDIRECT_PORT = '5201'
npm start
```

Then open `https://<pc-ip>:5200` from another device.

## Authentication

Set `AUTH_SECRET` before booting the backend to enable login protection:

```powershell
$env:AUTH_SECRET = 'your-secret'
```

The frontend will require a login if auth is enabled.

## Installer behavior

- Installs ADB into `C:\ProgramData\RemoteADBBack`.
- Creates a scheduled task named `RemoteADBServer` to restore startup persistence.
- Configures `adb reverse tcp:5200 tcp:5200`.
- Uses elevation logic to request Administrator rights if the installer is not already elevated.
