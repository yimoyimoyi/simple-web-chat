// HTTP 响应工具函数

import { CORS_CONFIG } from '../config.js';

/**
 * 获取 CORS 头
 * @param {string} origin - 请求来源
 * @returns {Object} - CORS 头对象
 */
function getCorsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': CORS_CONFIG.allowedMethods.join(', '),
    'Access-Control-Allow-Headers': CORS_CONFIG.allowedHeaders.join(', '),
    'Access-Control-Max-Age': String(CORS_CONFIG.maxAge),
  };

  // 验证来源
  if (origin && CORS_CONFIG.allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (!origin) {
    // 无来源头（如直接访问）允许
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return headers;
}

// 成功响应
export function jsonResponse(data, status = 200, origin = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...getCorsHeaders(origin),
  };

  return new Response(JSON.stringify(data), { status, headers });
}

// 错误响应
export function errorResponse(message, status = 400, origin = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...getCorsHeaders(origin),
  };

  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers,
  });
}

// 成功消息响应
export function okResponse(data = null, origin = null) {
  if (Array.isArray(data)) {
    return jsonResponse(data, 200, origin);
  }
  const response = { ok: true };
  if (data) Object.assign(response, data);
  return jsonResponse(response, 200, origin);
}

// 流式响应
export function streamResponse(body, headers = {}, origin = null) {
  return new Response(body, {
    headers: {
      ...getCorsHeaders(origin),
      ...headers,
    },
  });
}

// 文件下载响应
export function fileResponse(body, filename, contentType, origin = null) {
  const safeName = filename.replace(/[\r\n"]/g, '_');
  return new Response(body, {
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(safeName)}"`,
      ...getCorsHeaders(origin),
    },
  });
}

// CORS 预检响应
export function corsResponse(origin = null) {
  return new Response(null, {
    headers: getCorsHeaders(origin),
  });
}
