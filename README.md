# 逸陌聊天室 v2.0

基于 Cloudflare Worker + D1 + R2 + Durable Objects 的实时聊天应用。

## ✨ 特性

- 🚀 **实时通信**：基于 WebSocket 的实时消息推送
- 💾 **可靠存储**：D1 数据库存储消息，R2 对象存储存储文件
- 📁 **文件传输**：支持文件和图片上传，单文件最大 500MB（分块上传）
- 🔍 **消息搜索**：支持按关键词搜索消息
- 🌙 **暗黑模式**：支持亮色/暗色主题切换
- 📱 **响应式设计**：适配桌面和移动端
- 🔒 **安全限制**：内置频率限制、文件大小限制、存储空间限制

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                     │
├─────────────────────────────────────────────────────────┤
│  src/index.js          # 路由入口                        │
│  src/api/rooms.js      # 房间管理 API                    │
│  src/api/messages.js   # 消息 API (D1 存储)              │
│  src/api/files.js      # 文件 API (R2 存储)              │
│  src/do/ChatRoom.js    # Durable Object (WebSocket)      │
│  src/config.js         # 限制配置                        │
│  src/middleware/        # 中间件                          │
│  src/static/           # 前端资源                        │
├─────────────────────────────────────────────────────────┤
│  D1 Database           # 消息、房间、文件元数据           │
│  R2 Bucket             # 文件二进制存储                   │
│  Durable Objects       # WebSocket 实时通信               │
└─────────────────────────────────────────────────────────┘
```

## 📦 免费额度限制

| 服务 | 免费额度 | 本项目限制 |
|------|---------|-----------|
| **Workers** | 100K 请求/天 | 无额外限制 |
| **D1** | 5M 读取行/天, 100K 写入行/天 | 频率限制 30条/分钟/IP+房间 |
| **KV** | 100K 读取/天, 1K 写入/天 | 仅用于房间列表/配额缓存与限流负缓存（限流计数在 D1） |
| **R2** | 10GB 存储, 100万A类操作, 1000万B类操作 | 8GB 存储上限, 500MB/文件 |
| **Durable Objects** | 100K 请求/天, 10GB-s 计算时间 | 100连接/房间 |

## 🚀 快速开始

### 前置要求

1. Node.js 18+
2. Cloudflare 账号
3. Wrangler CLI

### 安装

```bash
# 克隆项目
git clone <your-repo-url>
cd chat

# 安装依赖
npm install

# 登录 Cloudflare
wrangler login
```

### 配置

1. 创建 D1 数据库：
```bash
npm run db:create
```

2. 创建 R2 存储桶：
```bash
npm run r2:create
```

3. 创建 KV 命名空间（用于房间/配额缓存与限流负缓存）：
```bash
npm run kv:create
```
将返回的 namespace id 填入 `wrangler.toml` 的 `[[kv_namespaces]]`（替换占位符 `"your-kv-namespace-id"`）。

4. 将返回的 `database_id` 填入 `wrangler.toml`：
```toml
[[d1_databases]]
binding = "DB"
database_name = "yimo-chat-db"
database_id = "<你的数据库ID>"
```

### 本地开发

```bash
# 初始化本地数据库
npm run db:init:local

# 启动本地开发服务器
npm run dev
```

访问 `http://localhost:8787` 查看应用。

### 部署

```bash
# 初始化远程数据库
npm run db:init

# 部署到 Cloudflare
npm run deploy
```

## 📁 项目结构

```
chat/
├── wrangler.toml              # Cloudflare Worker 配置
├── package.json               # 依赖管理
├── schema.sql                 # D1 数据库表结构
├── src/
│   ├── index.js               # Worker 入口 + 路由
│   ├── config.js              # 硬性限制配置
│   ├── api/
│   │   ├── rooms.js           # 房间管理 API
│   │   ├── messages.js        # 消息 API
│   │   └── files.js           # 文件 API
│   ├── middleware/
│   │   ├── auth.js            # 房间密码验证
│   │   └── rateLimit.js       # 频率限制（D1 原子计数 + KV 负缓存）
│   ├── do/
│   │   └── ChatRoom.js        # Durable Object (WebSocket + 心跳自动应答)
│   ├── utils/
│   │   ├── cache.js           # 三级缓存（内存/KV/D1）
│   │   ├── response.js        # 响应工具
│   │   └── id.js              # ID 生成工具
│   └── static/
│       ├── index.html.js      # HTML 骨架
│       ├── style.css.js       # 样式（内联打包）
│       └── app.js.js          # 前端逻辑（内联打包）
└── README.md
```

## 🔧 API 接口

### 房间管理

- `GET /api/rooms` - 获取房间列表
- `POST /api/room/create` - 创建房间 `{ room, password? }`
- `GET /api/room/info?room=` - 获取房间信息（是否需要密码）
- `POST /api/room/verify` - 验证房间密码 `{ room, password }`
- `POST /api/room/delete` - 删除房间 `{ room, passwordHash? }`

### 消息管理

- `GET /api/messages?room=&limit=&before=&keyword=` - 获取消息
- `POST /api/send` - 发送消息 `{ room, type, content, id? }`
- `POST /api/edit` - 编辑消息 `{ room, id, content, passwordHash? }`（仅 5 分钟内可编辑）
- `POST /api/delete` - 删除消息 `{ room, id, passwordHash? }`

### 文件管理

- `POST /api/upload-direct` - 小文件直传（≤5MB，FormData）
- `POST /api/upload-chunk` - 上传文件分块 (FormData)
- `POST /api/upload-finish` - 完成上传 `{ room, fileId, name, type, totalChunks, size }`（分块数/大小以服务端核验为准）
- `POST /api/upload-cleanup` - 清理临时分块 `{ room, fileId }`
- `GET /api/file-raw?room=&fileId=` - 获取文件原始内容
- `POST /api/download` - 下载文件 `{ room, fileId }`
- `GET /api/file-meta?room=&fileId=` - 获取文件元数据

### WebSocket

- `GET /api/ws?room=` - WebSocket 连接

## 🛡️ 安全特性

- **频率限制**：每 IP+房间 每分钟最多 30 条消息（D1 原子计数，KV 超限负缓存）
- **文件大小限制**：单文件最大 500MB
- **存储空间限制**：全局最大 8GB（直传与分块上传均校验，大小以服务端核验为准）
- **文件类型白名单**：只允许常见安全文件类型
- **输入验证**：房间名、消息内容长度限制
- **CORS 配置**：可配置跨域访问策略

## 🎨 自定义

### 修改限制

编辑 `src/config.js` 中的 `LIMITS` 对象：

```js
export const LIMITS = {
  MAX_FILE_SIZE: 500 * 1024 * 1024,       // 单文件最大 500MB
  MAX_MESSAGE_LENGTH: 5000,                // 消息最大 5000 字符
  MAX_ROOMS: 50,                           // 最大房间数
  // ... 更多配置
};
```

### 修改主题

编辑 `src/static/index.html.js` 中的 CSS 变量：

```css
:root {
  --bg: #f6f8fb;
  --panel: #ffffff;
  --accent: #4361ee;
  /* ... 更多变量 */
}
```

## 📝 更新日志

### v2.1.0 (2026-08-04)

- 🐛 修复实时推送缺失：发送消息/文件上传完成后 WebSocket 广播（此前其他客户端看不到新消息）
- 🐛 修复发送者本地不渲染：发送成功后立即显示自己的消息
- 🐛 修复限流设计缺陷：计数迁至 D1 原子递增（KV 免费写额度仅 1K/天），限流键加 IP 维度
- 🐛 修复消息清理节流失效：模块级计数替代请求级缓存，消除每次发送的全表 COUNT
- 🐛 修复直传绕过存储配额：upload-direct 补配额检查，分块数量/大小改为服务端核验
- 🐛 修复上传接口无限流：upload-chunk/direct/finish 按 IP 限流
- 🐛 修复删除房间后缓存残留：deleteRoom 补缓存失效
- ✨ WebSocket 心跳：客户端 30s ping + 服务端自动应答（不唤醒 DO）
- ✨ 请求体大小限制（MAX_REQUEST_SIZE 接线）
- 🧹 清理死代码：app.js/style.css 遗留文件、errorHandler.js、重复密码验证等

### v2.0.0 (2026-06-04)

- 🎉 全面重构，从单文件拆分为模块化架构
- ✨ 使用 D1 数据库替代 KV 存储消息
- ✨ 使用 R2 对象存储替代 KV 存储文件
- ✨ 使用 Durable Objects 实现实时 WebSocket 通信
- ✨ 添加频率限制和存储空间限制
- ✨ 添加文件类型白名单
- ✨ 支持消息搜索
- ✨ 支持上拉加载历史消息
- 🐛 修复并发竞态条件
- 🐛 修复消息丢失问题
- 🎨 优化前端性能和用户体验

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系方式

如有问题，请提交 Issue 或联系维护者。
