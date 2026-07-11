# NFD-D1-V1

SPDX-License-Identifier: GPL-3.0-or-later
Copyright (C) 2024 mireve

基于 Cloudflare Workers + D1 的 Telegram 消息转发机器人。

本仓库是 [NFD](https://github.com/LloydAsp/nfd) 的改版，使用 **D1 (SQLite)** 替代 Workers KV 作为存储后端。

## 搭建方法

### 准备工作

1. 从 [@BotFather](https://t.me/BotFather) 获取 token
2. 从 [uuidgenerator](https://www.uuidgenerator.net/) 获取一个 uuid 作为 secret
3. 从 [@username_to_id_bot](https://t.me/username_to_id_bot) 获取你的用户 ID

### 方法一：图形界面部署（推荐）

**第 1 步：创建 D1 数据库**
- 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)
- 左侧菜单 → **存储和数据库** → **D1 SQL 数据库**
- 点击 **创建数据库**，名称填 `nfd-d1-v1`，区域默认，点击 **创建**

**第 2 步：创建 Worker**
- 左侧菜单 → **Workers 和 Pages**
- 点击 **创建** → **Worker** → 名称填 `nfd-d1-v1` → 点击 **部署**
- 部署完成后点击 **编辑代码**

**第 3 步：粘贴代码**
- 全选编辑器里的默认代码，全部删掉
- 打开本项目里的 `worker.js`，全选复制
- 粘贴到编辑器中，覆盖所有代码
- 点击 **保存并部署**

**第 4 步：添加环境变量**
- 回到 Worker 详情页 → **设置** → **变量和机密**
- 在 **环境变量** 一栏，点击 **添加变量**，逐个添加：

| 变量名 | 值 |
|--------|-----|
| `ENV_BOT_TOKEN` | 你从 @BotFather 获取的 token |
| `ENV_BOT_SECRET` | 你生成的 uuid |
| `ENV_ADMIN_UID` | 你的用户 ID |
| `ENABLE_NOTIFICATION` | `true` |

添加完后点击 **保存并部署**。

**第 5 步：绑定 D1 数据库**
- 回到 Worker 详情页 → **设置** → **绑定**
- 点击 **添加绑定** → 类型选 **D1 数据库**
- 变量名称填 `DB`（必须大写）
- D1 数据库选刚才创建的 `nfd-d1-v1`
- 点击 **保存并部署**

**第 6 步：初始化数据库**
- 在浏览器打开 `https://你的worker域名/init?secret=你的webhook密钥`
- 页面显示 `Database initialized` 即成功

**第 7 步：注册 webhook**
- 在浏览器打开 `https://你的worker域名/registerWebhook`
- 页面显示 `Ok` 即成功

**第 8 步：同步诈骗数据库**
- 在和 bot 的聊天中发送 `/syncFraudDb`
- 或者浏览器访问 `https://你的worker域名/syncFraudDb`
- bot 回复"诈骗数据库同步完成"即成功

**第 9 步：使用**
- 现在其他用户给你的 bot 发消息，就会转发到你的 Telegram 了

> 💡 你的 Worker 域名可以在 Worker 详情页顶部看到，格式是 `xxx.xxx.workers.dev`

### 方法二：命令行部署

适合熟悉命令行的用户：

```bash
# 安装 wrangler
npm install -g wrangler
wrangler login

# 创建 D1 数据库
wrangler d1 create nfd-d1-v1
```
将输出的 `database_id` 填入 `wrangler.toml`。

```bash
# 初始化数据库表
wrangler d1 execute nfd-d1-v1 --file=schema.sql

# 部署
wrangler deploy
```

部署完成后注册 webhook：访问 `https://你的worker域名/registerWebhook`

## 环境变量

在 Cloudflare Dashboard 或 `wrangler.toml` 的 `[vars]` 中配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ENV_BOT_TOKEN` | Telegram Bot Token | 必填 |
| `ENV_BOT_SECRET` | Webhook 密钥，用于请求鉴权 | 必填 |
| `ENV_ADMIN_UID` | 管理员用户 ID | 必填 |
| `ENABLE_NOTIFICATION` | 是否发送定时安全提示 | `"true"`（设为 `"false"` 关闭） |

## 使用方法

- 其他用户给 bot 发消息，会被转发到管理员
- 管理员回复转发的消息，会回复到原发送者
- 检测到诈骗用户时，管理员会收到 ⚠️ 警告，消息照常转发
- `/block` — 屏蔽用户（需回复转发的消息）
- `/unblock` — 解除屏蔽（需回复转发的消息）
- `/checkblock` — 查看用户是否被屏蔽（需回复转发的消息）
- `/syncFraudDb` — 手动同步远程诈骗数据库到 D1

## 接口端点

| 端点 | 说明 |
|------|------|
| `POST /endpoint` | Telegram Webhook |
| `GET /registerWebhook` | 注册 Webhook |
| `GET /unRegisterWebhook` | 注销 Webhook |
| `GET /init?secret=xxx` | 初始化数据库表 |
| `GET /syncFraudDb` | 手动同步诈骗数据库 |

## 许可证

GNU GPL v3
