const Service = require('node-windows').Service;

const svc = new Service({
    name: 'Feishu Gateway Bot',
    script: require('path').join(__dirname, 'index.js'),
});

svc.on('uninstall', () => {
    console.log('✅ 服务已卸载');
});

svc.on('alreadyuninstalled', () => {
    console.log('⚠️ 服务不存在');
});

svc.on('error', (err) => {
    console.error('❌ 卸载失败:', err);
});

svc.uninstall();
