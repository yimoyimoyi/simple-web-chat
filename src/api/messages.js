// 消息管理 API
// 使用 D1 数据库存储消息，Cache API 加速读取

import { LIMITS, isValidMessage } from '../config.js';
import { generateId } from '../utils/id.js';
import { okResponse, errorResponse } from '../utils/response.js';
import { checkRateLimit, rateLimitResponse, getClientIp } from '../middleware/rateLimit.js';
import { verifyRoomPassword } from '../middleware/auth.js';
import { invalidateQuotaCache } from './files.js';

/**
 * 发送消息
 * @param {Object} env
 * @param {string} room
 * @param {string} type - 'text' | 'placeholder-file' | 'image-ref' | 'file-ref'
 * @param {string} content
 * @param {Object|null} fileMeta - { fileId, name, size, type, totalChunks }
 * @param {string|null} providedId - 前端提供的 ID（占位符消息用）
 */
export async function sendMessage(env, room, type, content, fileMeta = null, providedId = null, ip = 'unknown') {
  const id = providedId || generateId();
  const timestamp = Date.now();

  // 验证文本消息
  if (type === 'text' && !isValidMessage(content)) {
    throw new Error('消息内容无效：长度 1-' + LIMITS.MAX_MESSAGE_LENGTH + ' 字符');
  }

  // 频率限制检查（基于 IP+房间，防止单人刷屏）
  const rateKey = `send:${ip}:${room}`;
  const allowed = await checkRateLimit(env, rateKey, LIMITS.MAX_SEND_PER_MINUTE);
  if (!allowed) {
    throw new Error('RATE_LIMIT');
  }

  // 插入消息
  await env.DB.prepare(
    `INSERT INTO messages (id, room, type, content, file_id, file_name, file_size, file_type, total_chunks, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, room, type, content,
    fileMeta?.fileId || null,
    fileMeta?.name || null,
    fileMeta?.size || null,
    fileMeta?.type || null,
    fileMeta?.totalChunks || null,
    timestamp
  ).run();

  // 清理旧消息（如果超过上限）
  await cleanupOldMessages(env, room);

  // 返回完整消息对象
  return {
    id,
    room,
    type,
    content,
    file_id: fileMeta?.fileId || null,
    file_name: fileMeta?.name || null,
    file_size: fileMeta?.size || null,
    file_type: fileMeta?.type || null,
    total_chunks: fileMeta?.totalChunks || null,
    timestamp,
  };
}

/**
 * 获取消息列表（分页）
 */
export async function getMessages(env, room, limit = LIMITS.MESSAGES_PAGE_SIZE, before = null, keyword = null) {
  // 如果有关键词，使用全文搜索
  if (keyword) {
    return searchMessages(env, room, keyword, limit, before);
  }

  let query = `SELECT * FROM messages WHERE room = ?`;
  const params = [room];

  // 时间戳分页
  if (before) {
    query += ` AND timestamp < ?`;
    params.push(before);
  }

  query += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(limit);

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return results.reverse(); // 返回正序
}

/**
 * 全文搜索消息
 * @param {Object} env
 * @param {string} room - 房间名
 * @param {string} keyword - 搜索关键词
 * @param {number} limit - 返回数量限制
 * @param {number} before - 时间戳分页
 */
export async function searchMessages(env, room, keyword, limit = 50, before = null) {
  try {
    // 构建搜索查询
    let query = `
      SELECT m.* FROM messages m
      JOIN messages_fts fts ON m.rowid = fts.rowid
      WHERE fts MATCH ? AND m.room = ?
    `;
    const params = [keyword, room];

    // 时间戳分页
    if (before) {
      query += ` AND m.timestamp < ?`;
      params.push(before);
    }

    query += ` ORDER BY m.timestamp DESC LIMIT ?`;
    params.push(limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return results.reverse();
  } catch (e) {
    // FTS 查询失败时降级到 LIKE 查询
    console.error('FTS search failed, falling back to LIKE:', e);
    let query = `SELECT * FROM messages WHERE room = ? AND (content LIKE ? OR file_name LIKE ?)`;
    const likeKeyword = `%${keyword}%`;
    const params = [room, likeKeyword, likeKeyword];

    if (before) {
      query += ` AND timestamp < ?`;
      params.push(before);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return results.reverse();
  }
}

/**
 * 删除消息
 * @param {Object} env
 * @param {string} room - 房间名
 * @param {string} id - 消息 ID
 * @param {string} passwordHash - 房间密码哈希（如果房间有密码）
 */
export async function deleteMessage(env, room, id, passwordHash = null, skipAuth = false) {
  // 验证房间密码（admin 后台可跳过）
  if (!skipAuth) await verifyRoomPassword(env, room, passwordHash);

  // 查找消息
  const message = await env.DB.prepare(
    `SELECT * FROM messages WHERE room = ? AND (id = ? OR file_id = ?)`
  ).bind(room, id, id).first();

  if (!message) {
    throw new Error('消息不存在');
  }

  // 如果是文件消息，删除关联的文件
  if (message.file_id && (message.type === 'image-ref' || message.type === 'file-ref')) {
    // 删除文件元数据
    await env.DB.prepare(`DELETE FROM file_meta WHERE file_id = ?`).bind(message.file_id).run();

    // 删除 R2 中的文件
    try {
      await env.FILES.delete(`files/${room}/${message.file_id}`);
    } catch (e) {
      console.error(`Failed to delete R2 file: ${message.file_id}`, e);
    }

    // 文件元数据已删除，失效配额缓存
    await invalidateQuotaCache(env, room);
  }

  // 删除消息
  await env.DB.prepare(
    `DELETE FROM messages WHERE room = ? AND id = ?`
  ).bind(room, message.id).run();

  return { ok: true, deletedFile: !!message.file_id };
}

/**
 * 编辑消息
 * @param {Object} env
 * @param {string} room - 房间名
 * @param {string} id - 消息 ID
 * @param {string} newContent - 新内容
 * @param {string} passwordHash - 房间密码哈希（如果房间有密码）
 */
export async function editMessage(env, room, id, newContent, passwordHash = null) {
  if (!newContent || newContent.length > LIMITS.MAX_MESSAGE_LENGTH) {
    throw new Error('消息内容无效：长度 1-' + LIMITS.MAX_MESSAGE_LENGTH + ' 字符');
  }

  // 验证房间密码
  await verifyRoomPassword(env, room, passwordHash);

  const message = await env.DB.prepare(
    `SELECT * FROM messages WHERE id = ? AND room = ? AND type = 'text'`
  ).bind(id, room).first();

  if (!message) throw new Error('消息不存在或不是文本消息');

  // 限制 5 分钟内可编辑
  const EDIT_TIME_LIMIT = 5 * 60 * 1000;
  if (Date.now() - message.timestamp > EDIT_TIME_LIMIT) {
    throw new Error('只能编辑 5 分钟内的消息');
  }

  const editedAt = Date.now();
  await env.DB.prepare(
    `UPDATE messages SET content = ?, edited_at = ? WHERE id = ? AND room = ?`
  ).bind(newContent, editedAt, id, room).run();

  return {
    id,
    room,
    type: 'text',
    content: newContent,
    file_id: null,
    file_name: null,
    file_size: null,
    file_type: null,
    total_chunks: null,
    timestamp: message.timestamp,
    edited_at: editedAt,
  };
}

// 模块级清理计数器（isolate 生命周期内跨请求有效）
// 注意：不能放 reqCache（请求级缓存，每次 fetch 被清除，会导致每次发送都 COUNT）
const cleanupCounter = new Map();

/**
 * 清理旧消息（保留最新的 MAX_MESSAGES_PER_ROOM 条）
 * 每 10 次消息发送才做一次 COUNT 检查，减少 D1 读配额消耗
 */
async function cleanupOldMessages(env, room) {
  // 模块级计数：首次或每满 10 条执行检查
  const count = (cleanupCounter.get(room) || 0) + 1;
  cleanupCounter.set(room, count);
  if (count % 10 !== 1) return;

  const row = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM messages WHERE room = ?`
  ).bind(room).first();

  if (row.count > LIMITS.MAX_MESSAGES_PER_ROOM) {
    const excess = row.count - LIMITS.MAX_MESSAGES_PER_ROOM + 10; // 多删 10 条留出缓冲
    await env.DB.prepare(
      `DELETE FROM messages WHERE id IN (
        SELECT id FROM messages WHERE room = ? ORDER BY timestamp ASC LIMIT ?
      )`
    ).bind(room, excess).run();
  }
}

/**
 * 处理消息相关 API 请求
 */
export async function handleMessagesAPI(request, env, path, url) {
  // GET /api/messages（带 2 秒 CDN 缓存，应对短时间内重复请求）
  if (path === '/api/messages' && request.method === 'GET') {
    const room = url.searchParams.get('room') || 'default';
    const limit = parseInt(url.searchParams.get('limit') || LIMITS.MESSAGES_PAGE_SIZE);
    const before = url.searchParams.get('before') ? parseInt(url.searchParams.get('before')) : null;
    const keyword = url.searchParams.get('keyword') || null;

    // 有搜索关键词时不缓存（低频请求，直接查数据库）
    if (keyword) {
      const messages = await getMessages(env, room, limit, before, keyword);
      return okResponse(messages);
    }

    // 无关键词时使用 Cache API 缓存 2 秒
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

    try {
      const cache = caches.default;
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const messages = await getMessages(env, room, limit, before, null);
      const response = okResponse(messages);

      // 克隆响应写入缓存（异步，不阻塞返回）
      const toCache = new Response(response.clone().body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=2',
        },
      });
      // 异步写入，失败不影响请求
      cache.put(cacheKey, toCache).catch(() => {});

      return response;
    } catch {
      // 缓存失败时降级为直接查询
      const messages = await getMessages(env, room, limit, before, null);
      return okResponse(messages);
    }
  }

  // POST /api/send
  if (path === '/api/send' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || 'default');
    const type = String(body.type || 'text');
    const content = String(body.content || '');
    const providedId = body.id || null;

    // 占位符消息携带文件元数据
    let fileMeta = null;
    if (type === 'placeholder-file') {
      fileMeta = {
        fileId: providedId,
        name: String(body.name || 'file'),
        size: Number(body.size || 0),
        type: '',
        totalChunks: 0,
      };
    }

    try {
      const message = await sendMessage(env, room, type, content, fileMeta, providedId, getClientIp(request));
      // 广播新消息（WebSocket 实时推送，与其他客户端同步）
      try {
        const doId = env.CHAT_ROOM.idFromName(room);
        const stub = env.CHAT_ROOM.get(doId);
        await stub.notifyNewMessage(room, message);
      } catch (e) { console.error('Broadcast new message failed:', e); }
      return okResponse({ message });
    } catch (e) {
      if (e.message === 'RATE_LIMIT') {
        return rateLimitResponse();
      }
      return errorResponse(e.message);
    }
  }

  // POST /api/edit
  if (path === '/api/edit' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || 'default');
    const id = String(body.id || '');
    const content = String(body.content || '');
    const passwordHash = body.passwordHash || null;

    if (!id) return errorResponse('缺少消息 ID');

    try {
      const message = await editMessage(env, room, id, content, passwordHash);
      // 广播编辑消息
      try {
        const doId = env.CHAT_ROOM.idFromName(room);
        const stub = env.CHAT_ROOM.get(doId);
        await stub.notifyEditMessage(room, message);
      } catch (e) { console.error('Broadcast edit failed:', e); }
      return okResponse({ ok: true, message, edited_at: message.edited_at });
    } catch (e) {
      return errorResponse(e.message);
    }
  }

  // POST /api/delete
  if (path === '/api/delete' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || 'default');
    const id = String(body.id || '');
    const passwordHash = body.passwordHash || null;

    if (!id) return errorResponse('缺少消息 ID');

    try {
      const result = await deleteMessage(env, room, id, passwordHash);
      // 广播删除消息
      try {
        const doId = env.CHAT_ROOM.idFromName(room);
        const stub = env.CHAT_ROOM.get(doId);
        await stub.notifyDeleteMessage(room, id);
      } catch (e) { console.error('Broadcast delete failed:', e); }
      return okResponse(result);
    } catch (e) {
      return errorResponse(e.message);
    }
  }

  return null; // 不匹配
}
