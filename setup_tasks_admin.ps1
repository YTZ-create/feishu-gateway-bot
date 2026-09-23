# 飞书网关助手 - 计划任务创建脚本（右键 → 使用 PowerShell 运行）
$botPath = "C:\Users\zhiyutong\Desktop\OpenClaw\feishu-gateway-bot\index.js"

Write-Host "========================================" -Foreground Cyan
Write-Host "  飞书网关助手 - 计划任务配置" -Foreground Cyan
Write-Host "========================================" -Foreground Cyan
Write-Host ""

# 1. 创建登录时启动的计划任务
Write-Host "[1/3] 创建 FeishuGatewayBot..." -Foreground Yellow
try {
    $action = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$botPath`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName "FeishuGatewayBot" -Action $action -Trigger $trigger -Settings $settings -Description "飞书网关助手" -Force
    Write-Host "  [OK] FeishuGatewayBot 已创建" -Foreground Green
} catch {
    Write-Host "  [FAIL] $_" -Foreground Red
}

# 2. 创建启动/唤醒时触发的计划任务
Write-Host "[2/3] 创建 FeishuGatewayBot-Wake..." -Foreground Yellow
try {
    $action2 = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$botPath`""
    $trigger2 = New-ScheduledTaskTrigger -AtStartup
    $settings2 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName "FeishuGatewayBot-Wake" -Action $action2 -Trigger $trigger2 -Settings $settings2 -Description "飞书网关助手(唤醒)" -Force
    Write-Host "  [OK] FeishuGatewayBot-Wake 已创建" -Foreground Green
} catch {
    Write-Host "  [FAIL] $_" -Foreground Red
}

# 3. 修复 OpenClaw Gateway 的 WakeToRun
Write-Host "[3/3] 修复 OpenClaw Gateway WakeToRun..." -Foreground Yellow
try {
    $scheduler = New-Object -ComObject Schedule.Service
    $scheduler.Connect()
    $folder = $scheduler.GetFolder('\')
    $task = $folder.GetTask('OpenClaw Gateway')
    if ($task) {
        $def = $task.Definition
        $def.Settings.WakeToRun = $true
        $folder.RegisterTaskDefinition('OpenClaw Gateway', $def, 4, $null, $null, 0)
        Write-Host "  [OK] WakeToRun 已启用" -Foreground Green
    } else {
        Write-Host "  [WARN] OpenClaw Gateway 任务未找到" -Foreground Yellow
    }
} catch {
    Write-Host "  [FAIL] $_" -Foreground Red
}

# 结果汇总
Write-Host ""
Write-Host "========================================" -Foreground Cyan
Write-Host "  执行结果" -Foreground Cyan
Write-Host "========================================" -Foreground Cyan

# 检查服务
$svc = Get-Service -Name "feishugatewaybot.exe" -ErrorAction SilentlyContinue
if ($svc) {
    $color = if ($svc.Status -eq 'Running') { 'Green' } else { 'Red' }
    Write-Host "  Windows 服务: $($svc.Status)" -ForegroundColor $color
} else {
    Write-Host "  Windows 服务: 未安装" -ForegroundColor Red
}

# 检查计划任务
$t1 = Get-ScheduledTask -TaskName "FeishuGatewayBot" -ErrorAction SilentlyContinue
if ($t1) { Write-Host "  FeishuGatewayBot: $($t1.State)" -ForegroundColor Green }
else { Write-Host "  FeishuGatewayBot: 未创建" -ForegroundColor Red }

$t2 = Get-ScheduledTask -TaskName "FeishuGatewayBot-Wake" -ErrorAction SilentlyContinue
if ($t2) { Write-Host "  FeishuGatewayBot-Wake: $($t2.State)" -ForegroundColor Green }
else { Write-Host "  FeishuGatewayBot-Wake: 未创建" -ForegroundColor Red }

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
