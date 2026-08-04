// 管理后台鉴权中间件
// 密码来源：Cloudflare 控制台 / wrangler secret 配置的 PASSWORD 变量（永不写入代码库）
// 请求携带 X-Admin-Password: sha256(密码) 头，服务端恒定时间比较

import { errorResponse } from '../utils/response.js';
import { checkRateLimit, rateLimitResponse, getClientIp } from './rateLimit.js';

// 失败限流：同一 IP 每 5 分钟最多 10 次失败尝试
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 5 * 60 * 1000;

/**
 * 恒定时间比较两个字符串（长度差也计入结果，防时序侧信道）
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeEqual(a, b) {
  const la = a.length, lb = b.length;
  let diff = la ^ lb; // 长度不同 → diff 非 0
  const max = Math.max(la, lb);
  for (let i = 0; i < max; i++) {
    diff |= (i < la ? a.charCodeAt(i) : 0) ^ (i < lb ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

// 期望哈希缓存（env.PASSWORD 的 sha256，模块级）
let expectedHashCache = null;
async function getExpectedHash(password) {
  if (expectedHashCache !== null) return expectedHashCache;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  expectedHashCache = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expectedHashCache;
}

/**
 * 验证管理密码
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response|null>} - null 表示通过；否则返回错误响应（调用方直接 return）
 */
export async function verifyAdminPassword(request, env) {
  // 未配置管理密码 → 503（区分"未配置"与"凭据错误"）
  if (!env.PASSWORD) {
    return errorResponse('管理密码未配置（请在 Cloudflare 控制台设置 PASSWORD 变量）', 503);
  }

  const provided = request.headers.get('X-Admin-Password');
  // 缺失或格式不符（sha256 十六进制 64 字符）→ 直接拒绝
  if (!provided || !/^[0-9a-f]{64}$/.test(provided)) {
    return authFail(request, env);
  }

  const expected = await getExpectedHash(env.PASSWORD);
  if (!constantTimeEqual(provided, expected)) {
    return authFail(request, env);
  }

  return null; // 通过
}

/**
 * 鉴权失败：记录限流计数，超限返回 429
 */
async function authFail(request, env) {
  const ip = getClientIp(request);
  const allowed = await checkRateLimit(env, `admin:fail:${ip}`, FAIL_LIMIT, FAIL_WINDOW_MS);
  if (!allowed) return rateLimitResponse(300); // 5 分钟窗口
  return errorResponse('管理密码错误', 401);
}
