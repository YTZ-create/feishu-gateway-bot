@echo off
chcp 65001 >nul
title 飞书网关助手 - 计划任务配置
echo ========================================
echo   飞书网关助手 - 计划任务配置
echo ========================================
echo.

echo [1/3] 创建 FeishuGatewayBot...
schtasks /Create /TN "FeishuGatewayBot" /TR "node.exe \"C:\Users\zhiyutong\Desktop\OpenClaw\feishu-gateway-bot\index.js\"" /SC ONLOGON /RL HIGHEST /F
if %errorlevel% equ 0 (
    echo   [OK] FeishuGatewayBot 已创建
) else (
    echo   [FAIL] 错误代码: %errorlevel%
)

echo.
echo [2/3] 创建 FeishuGatewayBot-Wake...
schtasks /Create /TN "FeishuGatewayBot-Wake" /TR "node.exe \"C:\Users\zhiyutong\Desktop\OpenClaw\feishu-gateway-bot\index.js\"" /SC ONLOGON /RL HIGHEST /F
if %errorlevel% equ 0 (
    echo   [OK] FeishuGatewayBot-Wake 已创建
) else (
    echo   [FAIL] 错误代码: %errorlevel%
)

echo.
echo [3/3] 设置 OpenClaw Gateway WakeToRun...
schtasks /Query /TN "OpenClaw Gateway" >nul 2>&1
if %errorlevel% equ 0 (
    schtasks /Change /TN "OpenClaw Gateway" /RI 5
    echo   [OK] OpenClaw Gateway 已刷新
) else (
    echo   [WARN] OpenClaw Gateway 未找到
)

echo.
echo ========================================
echo   执行完成
echo ========================================
echo.
schtasks /Query /TN "FeishuGatewayBot" >nul 2>&1 && echo   FeishuGatewayBot: 已创建 || echo   FeishuGatewayBot: 未创建
schtasks /Query /TN "FeishuGatewayBot-Wake" >nul 2>&1 && echo   FeishuGatewayBot-Wake: 已创建 || echo   FeishuGatewayBot-Wake: 未创建

echo.
pause
