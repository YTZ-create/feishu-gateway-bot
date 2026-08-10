# 飞书网关助手

通过飞书机器人远程控制网关重启的轻量级工具。

## ✨ 功能特性

- 📩 **远程控制** - 在飞书中发送"重启网关"即可重启服务
- 🔒 **自动授权** - 首次发消息的用户自动成为管理员
- 🔄 **事件去重** - 防止 WebSocket 重连时重复处理消息
- ⏰ **启动过滤** - 自动忽略机器人启动前的旧消息
- 📤 **实时反馈** - 执行结果即时推送到飞书
- 🛠️ **Windows 服务** - 支持安装为系统服务，开机自启动

## 📦 安装

```bash
npm install
```

## 🔧 配置

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 飞书应用凭证（从飞书开放平台获取）
APP_ID=your_app_id_here
APP_SECRET=your_app_secret_here

# 授权用户 Open ID（首次运行后会自动记录）
AUTHORIZED_USER_ID=

# 网关重启脚本路径（可选，默认使用内置脚本）
RESTART_SCRIPT=

# 计划任务名称（可选，默认: OpenClaw Gateway）
SCHEDULED_TASK_NAME=OpenClaw Gateway

# 网关健康检查 URL（可选，默认: http://127.0.0.1:18789）
GATEWAY_URL=http://127.0.0.1:18789
```

### 获取飞书应用凭证

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 在「凭证与基础信息」中获取 **App ID** 和 **App Secret**
4. 在「权限管理」中添加权限：
   - `im:message` - 收发消息
   - `im:message.p2p_msg:readonly` - 读取私聊
5. 在「事件订阅」中开启 **WebSocket 连接**
6. 发布应用

## 🚀 使用方法

### 方式一：直接运行

```bash
npm start
```

### 方式二：安装为 Windows 服务

```bash
# 安装服务
npm run service

# 卸载服务
npm run uninstall
```

### 方式三：设置开机自启动

```powershell
.\setup_autostart.ps1
```

### 首次使用

1. 启动机器人服务
2. 在飞书中找到你的机器人，发送任意消息（首次会自动授权你为管理员）
3. 发送"重启网关"即可重启网关
4. 发送"帮助"查看可用命令

## ⚙️ 工作原理

### 内置重启逻辑

默认情况下，机器人会执行以下操作：

1. 停止所有其他 node 进程（排除自身）
2. 重启指定的 Windows 计划任务
3. 轮询检查网关健康状态（最多 30 秒）

### 自定义重启脚本

如果内置逻辑不满足需求，可以配置 `RESTART_SCRIPT` 指向自定义 PowerShell 脚本：

```env
RESTART_SCRIPT=C:\path\to\your\restart.ps1
```

## 📝 命令列表

| 命令 | 说明 |
|------|------|
| `重启网关` | 重启网关服务 |
| `帮助` / `help` | 显示可用命令 |

## 🔐 安全说明

- **首次授权机制**：第一个发送消息的用户自动成为管理员，之后只有管理员可以执行命令
- **身份验证**：每次执行命令前都会验证发送者身份
- **权限隔离**：未授权用户无法执行任何操作

## 🛠️ 开发

### 项目结构

```
.
├── index.js              # 主程序入口
├── service.js            # Windows 服务安装脚本
├── service-uninstall.js  # Windows 服务卸载脚本
├── setup_autostart.ps1   # 计划任务设置脚本
├── package.json          # 项目配置
└── .env.example          # 环境变量模板
```

### 依赖说明

- `@larksuiteoapi/node-sdk` - 飞书 SDK
- `dotenv` - 环境变量管理
- `node-windows` - Windows 服务支持

## 📄 License

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
