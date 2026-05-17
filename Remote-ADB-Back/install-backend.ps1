param(
  [string]$InstallDir = "$env:ProgramData\RemoteADBBack\Server",
  [string]$Port = "5200",
  [string]$Host = "0.0.0.0"
)

function Ensure-Elevated {
  if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    $args = @()
    if ($PSBoundParameters.ContainsKey('InstallDir')) { $args += "-InstallDir `"$InstallDir`"" }
    if ($PSBoundParameters.ContainsKey('Port')) { $args += "-Port `"$Port`"" }
    if ($PSBoundParameters.ContainsKey('Host')) { $args += "-Host `"$Host`"" }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $($args -join ' ')"
    $psi.Verb = 'runas'
    $psi.UseShellExecute = $true

    try {
      [System.Diagnostics.Process]::Start($psi) | Out-Null
      exit
    } catch {
      throw 'Administrator privileges are required to run this installer.'
    }
  }
}

function Check-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required but not installed. Download from https://nodejs.org and re-run this installer.'
  }
  $version = & node --version
  Write-Host "Node.js found: $version"
}

function Install-Backend {
  Write-Host "Installing backend to $InstallDir..."
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Copy-Item -Recurse -Force "$PSScriptRoot\src" "$InstallDir\src"
  Copy-Item -Force "$PSScriptRoot\package.json" "$InstallDir\package.json"
  Copy-Item -Force "$PSScriptRoot\package-lock.json" "$InstallDir\package-lock.json" -ErrorAction SilentlyContinue

  if (Test-Path "$PSScriptRoot\installer") {
    Copy-Item -Recurse -Force "$PSScriptRoot\installer" "$InstallDir\installer"
  }

  Push-Location $InstallDir
  & npm install --omit=dev 2>&1 | Out-Null
  Pop-Location

  Write-Host "Backend files installed."
}

function Create-StartupScript {
  $startScript = "$InstallDir\start.ps1"
  $content = @"
`$env:PORT = '$Port'
`$env:HOST = '$Host'
Start-Process -FilePath 'node' -ArgumentList "`"$InstallDir\src\backend.js`"" -NoNewWindow -WindowStyle Hidden
"@
  $content | Set-Content -Path $startScript -Force -Encoding UTF8
  return $startScript
}

function Register-Task {
  param([string]$StartScript)
  $taskName = 'RemoteADBServer'
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
  Write-Host "Scheduled task '$taskName' registered (runs at logon)."
}

function Start-Backend {
  param([string]$StartScript)
  Write-Host "Starting backend..."
  & powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File $StartScript
  Start-Sleep -Seconds 2
  Write-Host "Backend started on http://localhost:$Port"
}

Ensure-Elevated
Check-Node
Install-Backend
$script = Create-StartupScript
Register-Task -StartScript $script
Start-Backend -StartScript $script

Write-Host ""
Write-Host "Remote ADB Backend installation complete."
Write-Host "  Installed to : $InstallDir"
Write-Host "  Listening on : http://localhost:$Port"
Write-Host "  Auto-start   : enabled (runs at Windows logon)"
