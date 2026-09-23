$ErrorActionPreference = 'Continue'
$hbFile = 'C:\Users\zhiyutong\Desktop\OpenClaw\feishu-gateway-bot\heartbeat.txt'
$botTask = 'FeishuGatewayBot'
$logFile = 'C:\Users\zhiyutong\Desktop\OpenClaw\feishu-gateway-bot\healthcheck.log'
$staleMinutes = 5

function LogMsg($m) {
    $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $m
    $line | Out-File -FilePath $logFile -Append -Encoding utf8
}

$needRestart = $false
$reason = ''

if (-not (Test-Path $hbFile)) {
    $needRestart = $true
    $reason = 'heartbeat file missing'
} else {
    $age = (Get-Date) - (Get-Item $hbFile).LastWriteTime
    if ($age.TotalMinutes -gt $staleMinutes) {
        $needRestart = $true
        $reason = 'heartbeat stale ' + [int]$age.TotalMinutes + ' min'
    } else {
        $state = (Get-Content $hbFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($state -ne $null) { $state = $state.Trim() }
        # restart only on terminal/bad states; tolerate transient connecting/reconnecting
        if (($state -eq 'failed') -or ($state -eq 'idle') -or ($state -eq 'unknown')) {
            $needRestart = $true
            $reason = 'state=' + $state
        }
    }
}

if (-not $needRestart) {
    exit 0
}

LogMsg ('restart bot, reason: ' + $reason)

# kill bot node process only (exclude openclaw gateway)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -match 'index\.js' -and $_.CommandLine -notmatch 'openclaw'
} | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep 2

Stop-ScheduledTask -TaskName $botTask -ErrorAction SilentlyContinue
Start-Sleep 2
Start-ScheduledTask -TaskName $botTask

LogMsg 'restart done'
