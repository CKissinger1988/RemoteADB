param(
  [string]$BackendInstallDir = "$env:ProgramData\RemoteADBBack\Server",
  [string]$FrontendDest = ""
)

function Require-Admin {
  if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    throw 'This installer must be run as Administrator.'
  }
}

function Resolve-FrontendDest {
  if ($FrontendDest -ne "") {
    return $FrontendDest
  }
  $candidate = Join-Path $BackendInstallDir '..\..\..\Remote-ADB-Front' | Resolve-Path -ErrorAction SilentlyContinue
  if ($candidate) {
    return $candidate.Path
  }
  return Join-Path $BackendInstallDir 'frontend'
}

function Install-Frontend {
  param([string]$Dest)
  Write-Host "Installing frontend to $Dest..."
  New-Item -ItemType Directory -Path $Dest -Force | Out-Null
  $files = @('index.html', 'login.html', 'app.js', 'login.js', 'styles.css')
  foreach ($file in $files) {
    $src = Join-Path $PSScriptRoot $file
    if (Test-Path $src) {
      Copy-Item -Force $src $Dest
      Write-Host "  Copied $file"
    }
  }
}

Require-Admin
$dest = Resolve-FrontendDest
Install-Frontend -Dest $dest

Write-Host ""
Write-Host "Remote ADB Frontend installation complete."
Write-Host "  Installed to : $dest"
Write-Host "  Open browser : http://localhost:5200"
Write-Host ""
Write-Host "Note: The backend must be running to serve the frontend."
Write-Host "Run install-backend.ps1 from the Remote-ADB-Back package if not already installed."
