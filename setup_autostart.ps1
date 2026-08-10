# 设置开机自启动（Windows 计划任务）
# 用法: .\setup_autostart.ps1

param(
    [string]$TaskName = "Feishu Gateway Bot",
    [string]$WorkingDirectory = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

# 检查 node.exe 是否在 PATH 中
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    Write-Host "❌ 错误: 未找到 node.exe，请确保 Node.js 已安装并添加到 PATH" -ForegroundColor Red
    exit 1
}

Write-Host "📋 配置信息:" -ForegroundColor Cyan
Write-Host "  任务名称: $TaskName"
Write-Host "  工作目录: $WorkingDirectory"
Write-Host "  Node 路径: $nodePath"

# 创建计划任务
$action = New-ScheduledTaskAction -Execute $nodePath -Argument 'index.js' -WorkingDirectory $WorkingDirectory
$trigger1 = New-ScheduledTaskTrigger -AtLogon
$trigger2 = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($trigger1, $trigger2) -Settings $settings -Description '飞书网关助手 - 开机自启动' -Force
    Write-Host "✅ 计划任务创建成功！" -ForegroundColor Green
    Write-Host "💡 提示: 任务将在登录时和系统启动时自动运行" -ForegroundColor Yellow
} catch {
    Write-Host "❌ 创建计划任务失败: $_" -ForegroundColor Red
    exit 1
}
