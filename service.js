const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
    name: 'Feishu Gateway Bot',
    description: '飞书网关助手 - 通过飞书机器人控制 OpenClaw 网关重启',
    script: path.join(__dirname, 'index.js'),
    workingDirectory: __dirname,
    nodeOptions: ['--harmony', '--max_old_space_size=256'],
    wait: 1,
    grow: 0.25
});

svc.on('install', () => {
    console.log('✅ 服务安装成功！');
    svc.start();
});

svc.on('alreadyinstalled', () => {
    console.log('⚠️ 服务已存在，跳过安装');
});

svc.on('invalidinstallation', () => {
    console.log('⚠️ 服务安装无效，重新安装');
    svc.uninstall();
    setTimeout(() => svc.install(), 2000);
});

svc.on('start', () => {
    console.log('🚀 服务已启动！');
});

svc.on('error', (err) => {
    console.error('❌ 服务错误:', err);
});

svc.install();
