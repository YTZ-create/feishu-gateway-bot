@echo off
chcp 65001 >nul
schtasks /Create /TN "FeishuGatewayBot" /TR "node.exe C:\Users\zhiyutong\Desktop\OpenClaw\feishu-gateway-bot\index.js" /SC ONLOGON /RL HIGHEST /F
if %errorlevel% equ 0 (
    echo Task created successfully!
) else (
    echo Failed. Please run as Administrator.
)
pause
