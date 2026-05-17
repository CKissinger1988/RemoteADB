# Remote-ADB-Front

Web frontend and Electron desktop UI for remote ADB control.

## Usage

### Browser mode

1. Start the backend in `Remote-ADB-Back`.
2. Open the browser at `http://127.0.0.1:5200`.

### Electron mode

1. In `Remote-ADB-Front`, run:
   - `npm install`
   - `npm start`
2. The Electron app will launch and connect to the backend if available.

## Features

- Device list with per-device auto-connect toggles
- Connect using a selected device ID or the default USB device
- Remote shell command execution
- Remote screen refresh, tap, swipe, and wake-up control
- Remote camera launch, photo capture, and video recording support
- Remote audio recording support (requires device support)
- Dark/light theme toggle
- Status log for realtime backend feedback

## Notes

- The frontend uses same-origin API calls when served through the backend.
- For HTTPS access, use `https://<pc-ip>:5200` and set the backend TLS environment variables.
- If `AUTH_SECRET` is set on the backend, the UI will require login.
- If ADB is missing, the backend can install it via the elevated installer.
- Auto-connect devices are remembered in local storage and attempted on page load.
