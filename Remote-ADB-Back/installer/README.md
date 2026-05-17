# Installer

This folder contains the silent ADB installer used by the backend service.

## Before running

1. Place `adb.exe` into `installer/bin/`.
2. Run `install.ps1` from an elevated PowerShell session.
   - If the script is not already elevated, it will re-launch itself as Administrator.

## What it does

- Copies `adb.exe` into `C:\ProgramData\RemoteADBBack`
- Creates a scheduled task named `RemoteADBServer` for persistence
- Runs `adb start-server` and `adb reverse tcp:5200 tcp:5200`
- Restores reverse port forwarding after reboot

## Notes

- The backend listens on port `5200` by default.
- Ensure the frontend uses `http://localhost:5200` or the matching HTTPS endpoint.
