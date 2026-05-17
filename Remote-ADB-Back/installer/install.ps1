param(
  [string]$InstallDir = "$env:ProgramData\RemoteADBBack",
  [string]$AdbBinary = "$PSScriptRoot\bin\adb.exe",
  [string]$StartupScript = "$env:ProgramData\RemoteADBBack\startup.ps1"
)

function Ensure-Elevated {
  if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    $argList = @()
    if ($PSBoundParameters.ContainsKey('InstallDir')) { $argList += "-InstallDir `"$InstallDir`"" }
    if ($PSBoundParameters.ContainsKey('AdbBinary')) { $argList += "-AdbBinary `"$AdbBinary`"" }
    if ($PSBoundParameters.ContainsKey('StartupScript')) { $argList += "-StartupScript `"$StartupScript`"" }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $($argList -join ' ')"
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

function Copy-Adb {
  if (-not (Test-Path $AdbBinary)) {
    throw "adb.exe not found at $AdbBinary. Copy adb.exe to installer/bin before running."
  }

  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Copy-Item -Path $AdbBinary -Destination $InstallDir -Force
}

function Configure-Persistence {
  $taskName = 'RemoteADBServer'
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartupScript`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest

  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
}

function Configure-ReverseConnection {
  $adbExe = Join-Path $InstallDir 'adb.exe'
  & $adbExe start-server | Out-Null
  & $adbExe reverse tcp:5200 tcp:5200 | Out-Null
}

function Create-StartupScript {
  $script = @"
Start-Process -FilePath `"$InstallDir\adb.exe`" -ArgumentList 'start-server' -NoNewWindow -WindowStyle Hidden
Start-Sleep -Seconds 2
Start-Process -FilePath `"$InstallDir\adb.exe`" -ArgumentList 'reverse tcp:5200 tcp:5200' -NoNewWindow -WindowStyle Hidden
"@
  $script | Set-Content -Path $StartupScript -Force -Encoding UTF8
}

Ensure-Elevated
Copy-Adb
Create-StartupScript
Configure-Persistence
Configure-ReverseConnection
Write-Host "Remote ADB backend installer completed successfully."
Write-Host "ADB installed to $InstallDir and reverse port forwarding configured to tcp:5200." 
