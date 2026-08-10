require('dotenv').config();
const lark = require('@larksuiteoapi/node-sdk');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_FILE = path.join(__dirname, '.env');

// 事件去重：记录已处理的 message_id
const processedEvents = new Set();
const EVENT_DEDUP_TTL = 60000; // 60秒内去重

// 记录机器人启动时间，忽略启动前的旧消息（防止重连时处理历史消息）
const botStartTime = Date.now();

// 创建飞书客户端
const client = new lark.Client({
    appId: process.env.APP_ID,
    appSecret: process.env.APP_SECRET,
    loggerLevel: lark.LoggerLevel.info,
});

// 获取授权用户 ID
function getAuthorizedUserId() {
    return process.env.AUTHORIZED_USER_ID || '';
}

// 更新授权用户 ID 到 .env 文件
function updateAuthorizedUserId(userId) {
    const envContent = `# 飞书应用凭证
APP_ID=${process.env.APP_ID}
APP_SECRET=${process.env.APP_SECRET}

# 授权用户 Open ID（首次运行后会自动记录）
AUTHORIZED_USER_ID=${userId}

# 网关重启脚本路径（可选）
RESTART_SCRIPT=${process.env.RESTART_SCRIPT || ''}
`;
    fs.writeFileSync(CONFIG_FILE, envContent);
    process.env.AUTHORIZED_USER_ID = userId;
    console.log(`✅ 已授权用户: ${userId}`);
}

// 执行重启脚本
function executeRestartScript() {
    return new Promise((resolve) => {
        console.log('🔄 执行重启网关...');
        
        // 如果配置了外部脚本，使用外部脚本
        if (process.env.RESTART_SCRIPT && fs.existsSync(process.env.RESTART_SCRIPT)) {
            const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${process.env.RESTART_SCRIPT}"`;
            exec(command, { timeout: 90000, windowsHide: true }, (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ 执行失败:', error.message);
                    resolve({ success: false, message: `执行失败: ${stderr || error.message}` });
                    return;
                }
                console.log('✅ 执行成功');
                resolve({ success: true, message: '网关重启成功！' });
            });
            return;
        }
        
        // 否则使用内置重启逻辑
        const myPid = process.pid;
        const taskName = process.env.SCHEDULED_TASK_NAME || 'OpenClaw Gateway';
        const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';
        
        const psScript = `
$myPid = ${myPid}
$t = '${taskName}'
Write-Host 'Restarting gateway...'

Write-Host '[1/3] Stopping gateway processes...'
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $myPid } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2

Write-Host '[2/3] Restarting scheduled task...'
Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
Start-Sleep 2
Start-ScheduledTask -TaskName $t

Write-Host '[3/3] Waiting for gateway...'
$ok = $false

# 先立即检查一次
try {
    $r = Invoke-WebRequest '${gatewayUrl}' -TimeoutSec 3 -UseBasicParsing
    if ($r.StatusCode -eq 200) {
        $ok = $true
        Write-Host 'Gateway restarted successfully!'
    }
} catch {}

# 循环等待（最多30秒）
if (-not $ok) {
    for ($i = 1; $i -le 30; $i++) {
        Start-Sleep 1
        try {
            $r = Invoke-WebRequest '${gatewayUrl}' -TimeoutSec 3 -UseBasicParsing
            if ($r.StatusCode -eq 200) {
                $ok = $true
                Write-Host 'Gateway restarted successfully!'
                break
            }
        } catch {}
    }
}

if (-not $ok) {
    Write-Host 'Timeout - please check Task Scheduler'
    exit 1
}
`;
        
        const tmpScript = path.join(__dirname, '_restart_tmp.ps1');
        fs.writeFileSync(tmpScript, psScript, 'utf8');
        
        const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpScript}"`;
        
        exec(command, { timeout: 90000, windowsHide: true }, (error, stdout, stderr) => {
            try { fs.unlinkSync(tmpScript); } catch(e) {}
            
            if (error) {
                console.error('❌ 执行失败:', error.message);
                resolve({ success: false, message: `执行失败: ${stderr || error.message}` });
                return;
            }
            
            console.log('✅ 执行成功');
            resolve({ success: true, message: '网关重启成功！' });
        });
    });
}

// 发送消息回复
async function replyMessage(messageId, text) {
    try {
        await client.im.message.reply({
            path: { message_id: messageId },
            data: {
                content: JSON.stringify({ text }),
                msg_type: 'text',
            },
        });
        console.log(`📤 回复消息: ${text}`);
    } catch (err) {
        console.error('❌ 回复失败:', err.message);
    }
}

// 处理消息事件
async function handleMessage(data) {
    const event = data.event || data;
    const message = event.message;
    const sender = event.sender;
    
    if (message.message_type !== 'text') return;
    
    const senderId = sender.sender_id.open_id;
    const messageId = message.message_id;
    
    let content;
    try {
        content = JSON.parse(message.content);
    } catch (e) {
        console.error('❌ 解析消息内容失败:', e.message);
        return;
    }
    
    const text = content.text?.trim();
    console.log(`📩 收到消息: "${text}" from ${senderId}`);
    
    // 首次运行，记录授权用户
    if (!getAuthorizedUserId()) {
        updateAuthorizedUserId(senderId);
        await replyMessage(messageId, `✅ 已授权你为管理员！\n\n现在你可以发送"重启网关"来控制网关重启。`);
        return;
    }
    
    // 验证发送者身份
    if (senderId !== getAuthorizedUserId()) {
        console.log(`⚠️ 未授权用户: ${senderId}`);
        await replyMessage(messageId, '❌ 你没有权限执行此操作。');
        return;
    }
    
    // 处理命令
    if (text === '重启网关') {
        await replyMessage(messageId, '🔄 正在重启网关，请稍候...');
        const result = await executeRestartScript();
        if (result.success) {
            await replyMessage(messageId, `✅ ${result.message}`);
        } else {
            await replyMessage(messageId, `❌ ${result.message}`);
        }
    } else if (text === '帮助' || text === 'help') {
        await replyMessage(messageId, `📖 可用命令：\n\n• 重启网关 - 重启网关服务\n• 帮助 - 显示此帮助信息`);
    } else {
        await replyMessage(messageId, '❓ 未知命令，发送"帮助"查看可用命令。');
    }
}

// 启动 WebSocket 长连接
async function startBot() {
    console.log('🚀 飞书网关助手启动中...');
    console.log(`📋 授权用户: ${getAuthorizedUserId() || '未设置（首次发消息将自动授权）'}`);
    
    const wsClient = new lark.WSClient({
        appId: process.env.APP_ID,
        appSecret: process.env.APP_SECRET,
        loggerLevel: lark.LoggerLevel.info,
    });
    
    wsClient.start({
        eventDispatcher: new lark.EventDispatcher({}).register({
            'im.message.receive_v1': async (data) => {
                // 忽略机器人启动前发送的旧消息
                const createTime = parseInt(data.message?.create_time || '0', 10);
                if (createTime && createTime * 1000 < botStartTime) {
                    console.log(`⏭️ 跳过启动前的旧消息: ${data.message?.message_id}`);
                    return;
                }

                // 事件去重
                const messageId = data.message?.message_id;
                if (messageId) {
                    if (processedEvents.has(messageId)) {
                        console.log(`⏭️ 跳过重复消息: ${messageId}`);
                        return;
                    }
                    processedEvents.add(messageId);
                    setTimeout(() => processedEvents.delete(messageId), EVENT_DEDUP_TTL);
                }

                try {
                    await handleMessage(data);
                } catch (err) {
                    console.error('❌ 处理消息出错:', err.message);
                }
            },
        }),
    });
    
    console.log('✅ 飞书机器人已连接，等待消息...');
}

// 启动机器人
startBot().catch(err => {
    console.error('❌ 启动失败:', err.message);
    process.exit(1);
});
