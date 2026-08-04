// 房间管理 API
// 使用 D1 数据库存储房间列表，KV 缓存热数据

import { LIMITS, isValidRoomName } from '../config.js';
import { okResponse, errorResponse } from '../utils/response.js';
import { cachedQuery, invalidateCache, KV_TTL } from '../utils/cache.js';
import { verifyRoomPassword } from '../middleware/auth.js';
import { invalidateQuotaCache } from './files.js';

/**
 * 获取所有房间列表（带缓存）
 * KV 缓存 5 分钟，创建/删除房间时主动失效
 */
export async function getRooms(env) {
  return cachedQuery(env, 'rooms:list', async () => {
    const { results } = await env.DB.prepare(
      `SELECT name, created_at FROM rooms ORDER BY created_at ASC`
    ).all();
    return results.map(r => r.name);
  }, KV_TTL.ROOM_LIST_TTL);
}

/**
 * 创建房间
 * @returns {Object} - { ok: true } 或抛出错误
 */
export async function createRoom(env, name, passwordHash = null) {
  // 验证房间名
  if (!isValidRoomName(name)) {
    throw new Error('房间名无效：只允许字母、中文、数字、下划线和横线，长度 1-30');
  }

  // 检查房间数量上限
  const countRow = await env.DB.prepare(`SELECT COUNT(*) as count FROM rooms`).first();
  if (countRow.count >= LIMITS.MAX_ROOMS) {
    throw new Error(`房间数量已达上限（${LIMITS.MAX_ROOMS} 个）`);
  }

  // 创建房间（如果不存在）
  await env.DB.prepare(
    `INSERT OR IGNORE INTO rooms (name, password_hash) VALUES (?, ?)`
  ).bind(name, passwordHash).run();

  // 失效房间列表缓存
  await invalidateCache(env, 'rooms:list');

  return { ok: true };
}

/**
 * 获取房间信息（是否需要密码，带缓存）
 */
export async function getRoomInfo(env, name) {
  return cachedQuery(env, `rooms:info:${name}`, async () => {
    const room = await env.DB.prepare(
      `SELECT name, password_hash, created_at FROM rooms WHERE name = ?`
    ).bind(name).first();

    if (!room) throw new Error('房间不存在');

    return {
      name: room.name,
      hasPassword: !!room.password_hash,
      createdAt: room.created_at,
    };
  }, KV_TTL.ROOM_INFO_TTL);
}

/**
 * 删除房间（不能删除默认房间）
 * @param {Object} env
 * @param {string} name - 房间名
 * @param {string} passwordHash - 房间密码哈希（如果房间有密码）
 */
export async function deleteRoom(env, name, passwordHash = null) {
  if (name === 'default') {
    throw new Error('不能删除默认房间');
  }

  // 验证房间密码（统一使用 middleware/auth.js 版本）
  await verifyRoomPassword(env, name, passwordHash);

  // 删除房间
  await env.DB.prepare(`DELETE FROM rooms WHERE name = ?`).bind(name).run();

  // 删除该房间的所有消息
  await env.DB.prepare(`DELETE FROM messages WHERE room = ?`).bind(name).run();

  // 删除该房间的所有文件元数据
  const { results } = await env.DB.prepare(
    `SELECT file_id FROM file_meta WHERE room = ?`
  ).bind(name).all();

  // 删除 R2 中的文件
  for (const f of results) {
    try {
      await env.FILES.delete(`files/${name}/${f.file_id}`);
    } catch (e) {
      console.error(`Failed to delete R2 file: ${f.file_id}`, e);
    }
  }

  // 删除文件元数据
  await env.DB.prepare(`DELETE FROM file_meta WHERE room = ?`).bind(name).run();

  // 失效缓存：房间列表、房间信息、配额（否则已删房间最长 300 秒仍可见）
  await invalidateCache(env, 'rooms:list');
  await invalidateCache(env, `rooms:info:${name}`);
  await invalidateQuotaCache(env, name);

  return { ok: true };
}

/**
 * 处理房间相关 API 请求
 */
export async function handleRoomsAPI(request, env, path, url) {
  // GET /api/rooms
  if (path === '/api/rooms' && request.method === 'GET') {
    const rooms = await getRooms(env);
    return okResponse(rooms);
  }

  // POST /api/room/create
  if (path === '/api/room/create' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || '').trim();
    const passwordHash = body.passwordHash || null;
    try {
      await createRoom(env, room, passwordHash);
      return okResponse();
    } catch (e) {
      return errorResponse(e.message);
    }
  }

  // GET /api/room/info?room=
  if (path === '/api/room/info' && request.method === 'GET') {
    const room = url.searchParams.get('room') || 'default';
    try {
      const info = await getRoomInfo(env, room);
      return okResponse(info);
    } catch (e) {
      return errorResponse(e.message);
    }
  }

  // POST /api/room/verify
  if (path === '/api/room/verify' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || '').trim();
    const passwordHash = String(body.password || '');
    try {
      const result = await verifyRoomPassword(env, room, passwordHash);
      return okResponse(result);
    } catch (e) {
      return errorResponse(e.message);
    }
  }

  // POST /api/room/delete
  if (path === '/api/room/delete' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || '').trim();
    const passwordHash = body.passwordHash || null;
    try {
      await deleteRoom(env, room, passwordHash);
      return okResponse();
    } catch (e) {
      return errorResponse(e.message);
    }
  }

  return null; // 不匹配
}
