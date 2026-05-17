# Installer

This folder contains the silent ADB installer for the backend.

## Before running

1. Place `adb.exe` into `installer/bin/`.
2. Run `install.ps1` as Administrator.

## What it does

- Copies `adb.exe` into `C:\ProgramData\RemoteADBBack`
- Creates a scheduled task named `RemoteADBBackStartup`
- Runs `adb start-server` and `adb reverse tcp:5200 tcp:5200`
- Restores reverse port forwarding after reboot

## Notes

- The backend listens on port `5200` by default.
- Ensure the front-end is configured to use `http://localhost:5200` or the chosen reverse port.
