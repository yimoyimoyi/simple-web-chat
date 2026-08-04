// 统一缓存工具
// 三级缓存：L1 内存（请求级）+ L2 KV（Edge级）+ L3 Cache API（CDN级）
// 设计目标：在 Cloudflare 免费额度内最大化缓存命中率，减少 D1 读取

// ============ L1: 内存缓存（单次 Worker 请求内有效）============

/**
 * 内存缓存类
 * 用于单次请求/DO生命周期内的快速缓存
 * 避免同一请求内重复查询 D1/KV
 */
export class MemCache {
  constructor(ttlMs = 30000) {
    this.store = new Map();
    this.ttlMs = ttlMs;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > entry.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    this.store.set(key, { value, at: Date.now(), ttlMs: ttlMs || this.ttlMs });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

// 全局请求级内存缓存（每次 fetch 调用创建）
export const reqCache = new MemCache(30000);

// ============ L2: KV 缓存（Edge 级，跨请求有效）============

/**
 * KV 缓存配置
 */
const KV_CONFIG = {
  ROOM_LIST_TTL: 300,           // 房间列表缓存 5 分钟
  ROOM_INFO_TTL: 300,           // 房间信息缓存 5 分钟
  FILE_QUOTA_TTL: 60,           // 文件配额缓存 1 分钟
  RATE_LIMIT_TTL: 120,          // 频率限制 2 分钟
  DEFAULT_TTL: 60,              // 默认 1 分钟
};

/**
 * 从 KV 读取缓存
 * @param {Object} env - Worker 环境
 * @param {string} key - 缓存键（自动加 cache: 前缀）
 * @returns {Promise<Object|null>}
 */
export async function kvGet(env, key) {
  if (!env.RATE_LIMIT) return null;
  try {
    // cacheTtl: 0 禁用 KV 读穿缓存，保证 invalidateCache 删除后立即生效（避免最长 60 秒旧值）
    const raw = await env.RATE_LIMIT.get(`cache:${key}`, { type: 'json', cacheTtl: 0 });
    if (raw && raw.expires > Date.now()) {
      return raw.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 写入 KV 缓存
 * @param {Object} env - Worker 环境
 * @param {string} key - 缓存键
 * @param {*} data - 缓存数据
 * @param {number} ttl - 过期时间（秒）
 */
export async function kvSet(env, key, data, ttl = KV_CONFIG.DEFAULT_TTL) {
  if (!env.RATE_LIMIT) return;
  try {
    await env.RATE_LIMIT.put(
      `cache:${key}`,
      JSON.stringify({ data, expires: Date.now() + ttl * 1000 }),
      { expirationTtl: Math.max(ttl, 60) }
    );
  } catch (e) {
    console.error('KV cache write failed:', e);
  }
}

// KV 缓存 TTL 常量（导出供其他模块使用）
export const KV_TTL = KV_CONFIG;

// ============ 通用缓存包装器 ============

/**
 * 带多级缓存的查询
 * L1（内存）→ L2（KV）→ L3（D1原始查询）
 *
 * @param {Object} env - Worker 环境
 * @param {string} key - 缓存键
 * @param {Function} fetchFn - 原始数据获取函数（通常查 D1）
 * @param {number} ttl - KV 缓存时间（秒）
 * @returns {Promise<*>}
 */
export async function cachedQuery(env, key, fetchFn, ttl = KV_CONFIG.DEFAULT_TTL) {
  // L1: 内存缓存
  const memVal = reqCache.get(key);
  if (memVal !== null) return memVal;

  // L2: KV 缓存
  const kvVal = await kvGet(env, key);
  if (kvVal !== null) {
    reqCache.set(key, kvVal);
    return kvVal;
  }

  // L3: 原始查询
  const data = await fetchFn();

  // 写回缓存
  reqCache.set(key, data);
  kvSet(env, key, data, ttl).catch(() => {});

  return data;
}

/**
 * 清除指定模式的缓存
 * @param {Object} env - Worker 环境
 * @param {string} prefix - 缓存键前缀
 */
export async function invalidateCache(env, prefix) {
  reqCache.clear();
  if (env.RATE_LIMIT) {
    try {
      await env.RATE_LIMIT.delete(`cache:${prefix}`);
    } catch {
      // ignore
    }
  }
}

