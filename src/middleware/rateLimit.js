// 频率限制中间件
// 存储设计：D1 原子计数为主（免费 100K 写/天），KV 仅作超限负缓存（低频写）
// 原因：KV 免费写额度仅 1K/天，每次发送写 KV 会在 ~1000 条消息后静默超限

// 内存超限负缓存 TTL（毫秒）：同一 isolate 内快速拒绝，避免重复查 D1/KV
const DENY_MEM_TTL = 1000;
// KV 超限负缓存 TTL（秒）：超限状态在窗口内保持拒绝
const KV_DENY_TTL = 120;

// 模块级内存超限缓存（isolate 生命周期内有效，仅缓存"已超限"结果）
const memDenyCache = new Map();
function memDenyGet(key) {
  const entry = memDenyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > DENY_MEM_TTL) {
    memDenyCache.delete(key);
    return null;
  }
  return entry;
}
function memDenySet(key) {
  memDenyCache.set(key, { at: Date.now() });
}

/**
 * 检查频率限制（D1 原子递增 + 超限负缓存）
 * @param {Object} env - Cloudflare Worker 环境
 * @param {string} key - 限制键（如 "send:ip:room"）
 * @param {number} maxPerMinute - 每分钟最大请求数
 * @returns {Promise<boolean>} - true 表示允许，false 表示超限
 */
export async function checkRateLimit(env, key, maxPerMinute, windowMs = 60000) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  // 主键含窗口，窗口过期自然失效；window_start 列用于一致性校验
  const dbKey = `rate:${key}:${windowStart}`;
  const memKey = `rl:${dbKey}`;

  // L1: 内存超限负缓存（快速短路，避免重复查 KV/D1）
  if (memDenyGet(memKey)) return false;

  // L2: KV 超限负缓存（跨 isolate 生效；读高频、写仅发生在首次超限时）
  if (env.RATE_LIMIT) {
    try {
      const denied = await env.RATE_LIMIT.get(`deny:${dbKey}`, { type: 'json', cacheTtl: 60 });
      if (denied && denied.count >= maxPerMinute) {
        memDenySet(memKey);
        return false;
      }
    } catch (e) {
      console.error('KV rate limit check failed:', e.message);
    }
  }

  // L3: D1 原子计数
  const allowed = await checkRateLimitD1(env, dbKey, windowStart, maxPerMinute);

  if (!allowed) {
    // 首次超限时写入 KV 负缓存（低频写，远低于 1K/天上限）
    if (env.RATE_LIMIT) {
      env.RATE_LIMIT.put(`deny:${dbKey}`, JSON.stringify({ count: maxPerMinute }), { expirationTtl: KV_DENY_TTL }).catch(() => {});
    }
    memDenySet(memKey);
  }

  return allowed;
}

/**
 * D1 原子递增限流
 * SELECT 判断窗口/行状态 → UPDATE ... RETURNING 原子自增
 */
async function checkRateLimitD1(env, dbKey, windowStart, maxPerMinute) {
  try {
    // 1. 读取当前计数
    const row = await env.DB.prepare(
      `SELECT count, window_start FROM rate_limit WHERE key = ?`
    ).bind(dbKey).first();

    // 2. 无记录或窗口过期 → 新窗口开始
    if (!row || row.window_start !== windowStart) {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO rate_limit (key, count, window_start) VALUES (?, ?, ?)`
      ).bind(dbKey, 1, windowStart).run();
      return true;
    }

    // 3. 已超限
    if (row.count >= maxPerMinute) return false;

    // 4. 原子自增（消除读-改-写竞态；并发窗口内可能略超上限，软限流可接受）
    const result = await env.DB.prepare(
      `UPDATE rate_limit SET count = count + 1 WHERE key = ? RETURNING count`
    ).bind(dbKey).first();

    return result.count <= maxPerMinute;
  } catch (e) {
    console.error('Rate limit check failed:', e);
    return true; // 降级为放行（避免误伤正常使用）
  }
}

/**
 * 获取客户端 IP（用于限流键的用户维度）
 * @param {Request} request - HTTP 请求
 * @returns {string}
 */
export function getClientIp(request) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) return ip;
  // 降级：X-Forwarded-For 首个 IP
  const xff = request.headers.get('X-Forwarded-For');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

/**
 * 创建频率限制响应
 * @param {number} retryAfter - 重试等待时间（秒）
 */
export function rateLimitResponse(retryAfter = 60) {
  return new Response(JSON.stringify({
    ok: false,
    error: '请求过于频繁，请稍后再试',
    retryAfter,
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(retryAfter),
    },
  });
}
