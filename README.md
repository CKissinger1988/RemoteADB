# RemoteADB Workspace

This workspace groups the four RemoteADB subprojects and provides quick start instructions.

Projects:
- Remote-ADB-Android — installer scripts for adb.exe (silent install + persistence)
- Remote-ADB-Back — Node backend serving API and static frontend
- Remote-ADB-Front — static web frontend UI
- Remote-ADB-Control — small controller UI (renderer scripts)

Quick start (development):
1. Open `RemoteADB.code-workspace` in VS Code.
2. In the `Remote-ADB-Back` folder run:
   - `npm install`
   - `npm start`
3. Open the frontend in a browser: `http://127.0.0.1:5200`

Install ADB (optional, for full device access):
1. Copy `adb.exe` into `Remote-ADB-Back/installer/bin/`.
2. Run the installer as Administrator: `installer/install.ps1` (PowerShell).

VS Code tasks included in the workspace:
- Install Remote-ADB-Back dependencies
- Start Remote-ADB-Back
- Open Remote-ADB-Front in browser
- Run Remote-ADB-Android installer

Security notes:
- To enable authentication for the backend set `AUTH_SECRET` before starting the server.
- To enable HTTPS set `HTTPS`, `SSL_KEY`, and `SSL_CERT` environment variables.

If you want, I can start the backend now and open the frontend in your browser.