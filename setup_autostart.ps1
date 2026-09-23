$taskName = 'Feishu Gateway Bot'
$action = New-ScheduledTaskAction -Execute 'node.exe' -Argument 'index.js' -WorkingDirectory 'C:\Users\zhiyutong\Desktop\OpenClaw\feishu-gateway-bot'
$trigger1 = New-ScheduledTaskTrigger -AtLogon
$trigger2 = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger1, $trigger2) -Settings $settings -Description '飞书网关助手 - 开机自启动' -Force
