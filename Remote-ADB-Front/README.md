# Remote-ADB-Front

A simple static web app starter for remote ADB control.

## Usage

1. Start the backend in `Remote-ADB-Back` first.
2. Open `index.html` in the browser.
3. Optionally enable Auto-connect on startup.
4. Refresh devices, choose one or use a device ID, then click Connect.
5. Use the screen preview, refresh, tap, swipe, or shell commands.

## Notes

- The frontend now uses the same origin as the page for backend API calls when served through the backend.
- If you host the backend over HTTPS, open the app at `https://<pc-ip>:5200` on your phone.
- The backend will auto-install ADB when needed.
- The new device list supports per-device auto-connect toggles.
- If auto-connect is enabled and a saved device is present, the frontend attempts to connect on load.
