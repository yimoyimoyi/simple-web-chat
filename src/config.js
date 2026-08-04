// 逸陌聊天室 - 硬性限制配置
// 基于 Cloudflare 免费额度设置的所有限制

export const LIMITS = {
  // ============ 文件限制 (R2 免费额度: 10GB 存储, 100万A类操作, 1000万B类操作) ============
  MAX_FILE_SIZE: 500 * 1024 * 1024,       // 单文件最大 500MB
  MAX_CHUNK_SIZE: 5 * 1024 * 1024,        // 分块大小 5MB
  MAX_TOTAL_STORAGE: 8 * 1024 * 1024 * 1024, // 全局存储上限 8GB（预留 2GB 缓冲）
  MAX_FILES_PER_ROOM: 500,                 // 单房间最大文件数

  // ============ 消息限制 (D1 免费额度: 每天 5M 读取行, 100K 写入行) ============
  MAX_MESSAGE_LENGTH: 5000,                // 文本消息最大 5000 字符
  MAX_MESSAGES_PER_ROOM: 2000,             // 单房间最大消息数（超出自动清理旧消息）
  MESSAGES_PAGE_SIZE: 50,                  // 分页查询每页条数
  MAX_SEND_PER_MINUTE: 30,                 // 单用户每分钟最大发送条数（频率限制）

  // ============ 房间限制 ============
  MAX_ROOMS: 50,                           // 最大房间数
  MAX_ROOM_NAME_LENGTH: 30,                // 房间名最大长度
  ROOM_NAME_PATTERN: /^[a-zA-Z0-9一-龥_-]+$/, // 房间名只允许字母/中文/数字/下划线/横线

  // ============ Worker 限制 (免费额度: 每天 100K 请求) ============
  MAX_REQUEST_SIZE: 1024 * 1024,           // 请求体最大 1MB

  // ============ Durable Objects 限制 (免费额度: 每天 100K 请求) ============
  MAX_WS_CONNECTIONS_PER_ROOM: 100,        // 单房间最大 WebSocket 连接数
};

// CORS 配置
export const CORS_CONFIG = {
  // 允许的来源域名（生产环境 + 本地开发）
  allowedOrigins: [
    'https://chat.yimo.qzz.io',
    'http://localhost:8787',
    'http://127.0.0.1:8787',
  ],
  // 允许的 HTTP 方法
  allowedMethods: ['GET', 'POST', 'OPTIONS'],
  // 允许的请求头
  allowedHeaders: ['Content-Type', 'Authorization'],
  // 预检请求缓存时间（秒）
  maxAge: 86400,
  // 文件直链是否允许任意来源（<img>/<video> 等媒体标签跨域加载需要；文件读取无凭据，风险低）
  allowFileAccessAnyOrigin: true,
};

// 验证房间名
export function isValidRoomName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length < 1 || name.length > LIMITS.MAX_ROOM_NAME_LENGTH) return false;
  return LIMITS.ROOM_NAME_PATTERN.test(name);
}

// 验证消息内容
export function isValidMessage(content) {
  if (!content || typeof content !== 'string') return false;
  if (content.length < 1 || content.length > LIMITS.MAX_MESSAGE_LENGTH) return false;
  return true;
}
