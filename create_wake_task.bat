@echo off
chcp 65001 >nul
echo Creating wake-from-hibernate task...
schtasks /Create /TN "FeishuGatewayBot-Wake" /TR "node.exe C:\Users\zhiyutong\Desktop\OpenClaw\feishu-gateway-bot\index.js" /SC ONLOGON /RL HIGHEST /F /RU "%USERNAME%" /RP
if %errorlevel% equ 0 (
    echo Task created successfully!
) else (
    echo Failed.
)
pause
