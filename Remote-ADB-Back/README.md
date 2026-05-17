# Remote-ADB-Back

Backend repository scaffold for a silent ADB USB installer with reboot persistence and reverse front-end connection.

## Overview

- `src/backend.js` runs a local backend service for remote ADB control.
- `installer/install.ps1` installs ADB silently, sets reboot persistence, and configures reverse port forwarding.
- `installer/startup.ps1` is the persistence helper that restores the USB ADB connection on reboot.

## Quick start

1. Copy `adb.exe` into `installer/bin/` before running the installer.
2. Run `installer/install.ps1` as Administrator.
3. Start the backend with `npm install` and `npm start`.

## HTTPS and wireless access

To serve the frontend from the backend over HTTPS, set the backend host and TLS certificate paths before starting the server.

Example:

```powershell
$env:HOST = '0.0.0.0'
$env:HTTPS = 'true'
$env:SSL_KEY = 'C:\path\to\server.key'
$env:SSL_CERT = 'C:\path\to\server.crt'
$env:REDIRECT_PORT = '5201'
npm start
```

Then open `https://<pc-ip>:5200` on your phone over the same Wi-Fi network.

If a phone or browser requests `http://<pc-ip>:5201`, it will be redirected to HTTPS automatically.

Use a certificate trusted by the phone to avoid SSL warnings.

## Access control

To protect the frontend from unauthorized users, set `AUTH_SECRET` before starting the backend:

```powershell
$env:AUTH_SECRET = 'your-secret-password'
```

When auth is enabled, phones must sign in via the login page before loading the frontend.

## Installer behavior

- Installs ADB into `C:\ProgramData\RemoteADBBack`.
- Adds a scheduled task for reboot persistence.
- Configures `adb reverse tcp:5200 tcp:5200` so the device can reach the front-end backend port.
- The backend auto-runs the installer when ADB is unavailable during status or reverse setup requests.
