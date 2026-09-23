require('dotenv').config();
const lark = require('@larksuiteoapi/node-sdk');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_FILE = path.join(__dirname, '.env');

// 事件去重：记录已处理的 message_id（内存 + 磁盘，进程重启后仍生效）
const processedEvents = new Set();
const EVENT_DEDUP_TTL = 5 * 60 * 1000; // 5 分钟
const DEDUP_FILE = path.join(__dirname, 'processed-events.json');

function loadDedupFile() {
    try {
        if (fs.existsSync(DEDUP_FILE)) {
            const raw = JSON.parse(fs.readFileSync(DEDUP_FILE, 'utf8'));
            const now = Date.now();
            for (const [id, ts] of Object.entries(raw)) {
                if (now - ts < EVENT_DEDUP_TTL) {
                    processedEvents.add(id);
                }
            }
        }
    } catch (_) { /* 文件损坏则忽略 */ }
}

function persistDedup() {
    try {
        const obj = {};
        const now = Date.now();
        for (const id of processedEvents) {
            obj[id] = now;
        }
        fs.writeFileSync(DEDUP_FILE, JSON.stringify(obj));
    } catch (_) { /* 写失败不影响主流程 */ }
}

loadDedupFile();

// 记录机器人启动时间，忽略启动前的旧消息（防止重连时处理历史消息）
const botStartTime = Date.now();

// 重启冷却：防止飞书重投/网络抖动导致短时间连续重启
const RESTART_COOLDOWN_MS = 90 * 1000; // 90 秒
let lastRestartAt = 0;
let restartInProgress = false;

function ts() {
    return new Date().toLocaleString('zh-CN', { hour12: false });
}

function log(...args) {
    console.log(`[${ts()}]`, ...args);
}

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

# 重启脚本路径
RESTART_SCRIPT=${process.env.RESTART_SCRIPT}
`;
    fs.writeFileSync(CONFIG_FILE, envContent);
    process.env.AUTHORIZED_USER_ID = userId;
    log(`✅ 已授权用户: ${userId}`);
}

// 执行重启：杀网关进程 + detached 启动新实例
function executeRestartScript() {
    return new Promise((resolve) => {
        log('🔄 执行重启网关...');

        const projectRoot = path.resolve(__dirname, '..');
        const gatewayScript = path.join(projectRoot, 'node_modules', 'openclaw', 'dist', 'index.js');

        // Step 1: 用 PowerShell 按命令行找网关进程并杀掉
        // 避免 -Filter 内嵌双引号在 cmd 下被截断，改用 Where-Object 过滤 Name
        log('[1/3] Stopping gateway...');
        const killCmd = "Get-CimInstance Win32_Process | " +
            "Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'openclaw' -and $_.CommandLine -notmatch 'feishu-gateway-bot' } | " +
            "ForEach-Object { Write-Host ('  Killing PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }";
        exec(`powershell.exe -NoProfile -Command "${killCmd}"`, { windowsHide: true }, (err, stdout) => {
            if (err) {
                log('⚠️ 停止网关时出错:', err.message);
            }
            log(stdout || '(no gateway process found)');

            // Step 2: 启动网关（detached，独立于 bot 进程）
            log('[2/3] Starting gateway...');
            setTimeout(() => {
                const child = spawn('node', [gatewayScript, 'gateway', '--port', '18789'], {
                    cwd: projectRoot,
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true,
                });
                child.unref();
                log(`  Gateway started (PID: ${child.pid})`);

                // Step 3: 等待网关就绪（最多 ~90 秒；curl 单次 2s 超时，避免卡死）
                log('[3/3] Waiting for gateway...');
                let attempts = 0;
                const maxAttempts = 60;

                const check = () => {
                    exec('curl.exe -s -o NUL -w "%{http_code}" --max-time 2 http://127.0.0.1:18789', { windowsHide: true }, (e, stdout) => {
                        attempts++;
                        if (!e && stdout.trim() === '200') {
                            log(`Gateway restarted successfully! (${attempts} attempts)`);
                            resolve({ success: true, message: '网关重启成功！' });
                            return;
                        }
                        if (attempts < maxAttempts) {
                            setTimeout(check, 1000);
                        } else {
                            log('Timeout waiting for gateway');
                            // 最后再确认一次，可能刚好在边界就绪
                            exec('curl.exe -s -o NUL -w "%{http_code}" --max-time 3 http://127.0.0.1:18789', { windowsHide: true }, (e2, stdout2) => {
                                if (!e2 && stdout2.trim() === '200') {
                                    log('Gateway is actually up (late ready)');
                                    resolve({ success: true, message: '网关重启成功（启动较慢）！' });
                                } else {
                                    resolve({ success: false, message: '网关重启超时，请手动检查' });
                                }
                            });
                        }
                    });
                };
                setTimeout(check, 2000);
            }, 2000);
        });
    });
}

// 发送消息回复
async function replyMessage(messageId, text) {
    try {
        await client.im.message.reply({
            path: {
                message_id: messageId,
            },
            data: {
                content: JSON.stringify({ text }),
                msg_type: 'text',
            },
        });
        log(`📤 回复消息: ${text}`);
    } catch (err) {
        console.error(`[${ts()}] ❌ 回复失败:`, err.message);
    }
}

// 处理消息事件
async function handleMessage(data) {
    const event = data.event || data;
    const message = event.message;
    const sender = event.sender;

    if (!message || message.message_type !== 'text') {
        return;
    }

    const senderId = sender?.sender_id?.open_id;
    const messageId = message.message_id;

    let content;
    try {
        content = JSON.parse(message.content);
    } catch (e) {
        console.error(`[${ts()}] ❌ 解析消息内容失败:`, e.message);
        return;
    }

    const text = content.text?.trim();
    log(`📩 收到消息: "${text}" from ${senderId} (id=${messageId})`);

    // 首次运行，记录授权用户
    if (!getAuthorizedUserId()) {
        updateAuthorizedUserId(senderId);
        await replyMessage(messageId, `✅ 已授权你为管理员！\n\n现在你可以发送"重启网关"来控制网关重启。`);
        return;
    }

    // 验证发送者身份
    if (senderId !== getAuthorizedUserId()) {
        log(`⚠️ 未授权用户: ${senderId}`);
        await replyMessage(messageId, '❌ 你没有权限执行此操作。');
        return;
    }

    // 处理重启命令
    if (text === '重启网关') {
        // 冷却 + 并发锁：飞书重投或网络抖动时只执行一次
        if (restartInProgress) {
            log('⏭️ 已有重启在进行中，跳过');
            await replyMessage(messageId, '⏳ 已有重启在进行中，请稍候…');
            return;
        }
        const now = Date.now();
        if (now - lastRestartAt < RESTART_COOLDOWN_MS) {
            const waitSec = Math.ceil((RESTART_COOLDOWN_MS - (now - lastRestartAt)) / 1000);
            log(`⏭️ 重启冷却中（${waitSec}s），跳过重复触发`);
            await replyMessage(messageId, `⏳ 刚刚已重启过网关，${waitSec} 秒后才能再次重启。`);
            return;
        }

        restartInProgress = true;
        lastRestartAt = now;
        try {
            await replyMessage(messageId, '🔄 正在重启网关，请稍候...');
            const result = await executeRestartScript();
            if (result.success) {
                await replyMessage(messageId, `✅ ${result.message}`);
            } else {
                await replyMessage(messageId, `❌ ${result.message}`);
            }
        } finally {
            restartInProgress = false;
        }
    } else if (text === '帮助' || text === 'help') {
        await replyMessage(messageId, `📖 可用命令：\n\n• 重启网关 - 重启 OpenClaw 网关\n• 帮助 - 显示此帮助信息`);
    } else {
        await replyMessage(messageId, '❓ 未知命令，发送"帮助"查看可用命令。');
    }
}

// 启动 WebSocket 长连接
async function startBot() {
    log('🚀 飞书网关助手启动中...');
    log(`📋 授权用户: ${getAuthorizedUserId() || '未设置（首次发消息将自动授权）'}`);

    const wsClient = new lark.WSClient({
        appId: process.env.APP_ID,
        appSecret: process.env.APP_SECRET,
        loggerLevel: lark.LoggerLevel.info,
    });

    wsClient.start({
        eventDispatcher: new lark.EventDispatcher({}).register({
            'im.message.receive_v1': async (data) => {
                const msg = data.message;

                // 忽略机器人启动前发送的旧消息
                // 飞书 create_time 为毫秒级字符串；兼容秒级以防版本差异
                let createTime = parseInt(msg?.create_time || '0', 10);
                if (createTime) {
                    // 若数值看起来像秒（10 位），转成毫秒
                    if (createTime < 1e12) createTime *= 1000;
                    if (createTime < botStartTime) {
                        log(`⏭️ 跳过启动前的旧消息: ${msg?.message_id} (发送于 ${new Date(createTime).toLocaleString()})`);
                        return;
                    }
                }

                // 事件去重：飞书 WebSocket 可能会重复推送同一事件
                const messageId = msg?.message_id;
                if (messageId) {
                    if (processedEvents.has(messageId)) {
                        log(`⏭️ 跳过重复消息: ${messageId}`);
                        return;
                    }
                    processedEvents.add(messageId);
                    persistDedup();
                    setTimeout(() => {
                        processedEvents.delete(messageId);
                        persistDedup();
                    }, EVENT_DEDUP_TTL);
                }

                try {
                    await handleMessage(data);
                } catch (err) {
                    console.error(`[${ts()}] ❌ 处理消息出错:`, err.message);
                }
            },
        }),
    });

    // 心跳：每 60 秒把连接状态写入 heartbeat.txt
    const HEARTBEAT_FILE = path.join(__dirname, 'heartbeat.txt');
    const writeHeartbeat = () => {
        try {
            const state = wsClient.getConnectionStatus().state;
            fs.writeFileSync(HEARTBEAT_FILE, state);
        } catch (e) {
            try { fs.writeFileSync(HEARTBEAT_FILE, 'unknown'); } catch (_) {}
        }
    };
    writeHeartbeat();
    setInterval(writeHeartbeat, 60000);

    log('✅ 飞书机器人已连接，等待消息...');
}

// 启动机器人
startBot().catch(err => {
    console.error(`[${ts()}] ❌ 启动失败:`, err.message);
    process.exit(1);
});
