// 管理后台 API
// 所有端点先经 verifyAdminPassword 鉴权（绕过房间密码，需 PASSWORD 环境变量）
// 响应禁用缓存（no-store）：管理数据不应被 CDN 缓存

import { okResponse, errorResponse } from '../utils/response.js';
import { verifyAdminPassword } from '../middleware/adminAuth.js';
import { getMessages, deleteMessage } from './messages.js';
import { deleteRoom } from './rooms.js';

// 管理响应统一禁用缓存（管理数据不应被 CDN 缓存）
function adminOk(data) {
  const res = okResponse(data);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/**
 * 获取房间列表 + 统计（消息数/文件数/文件大小/是否有密码）
 * 用 3 条分组查询合并，避免三表 JOIN 的笛卡尔扇出
 */
async function getAdminRooms(env) {
  // ① 房间列表
  const { results: rooms } = await env.DB.prepare(
    `SELECT name, password_hash, created_at FROM rooms ORDER BY created_at ASC`
  ).all();

  // ② 消息统计（含文件消息数）
  const { results: msgStats } = await env.DB.prepare(
    `SELECT room,
            COUNT(*) AS msg_count,
            SUM(CASE WHEN type IN ('image-ref','file-ref') THEN 1 ELSE 0 END) AS file_msg_count
     FROM messages GROUP BY room`
  ).all();

  // ③ 文件统计（file_meta 是 R2 实际存量的事实源）
  const { results: fileStats } = await env.DB.prepare(
    `SELECT room, COUNT(*) AS file_count, COALESCE(SUM(size), 0) AS file_bytes
     FROM file_meta GROUP BY room`
  ).all();

  // 合并统计
  const msgMap = new Map(msgStats.map(r => [r.room, r]));
  const fileMap = new Map(fileStats.map(r => [r.room, r]));

  return rooms.map(r => ({
    name: r.name,
    hasPassword: !!r.password_hash,
    createdAt: r.created_at,
    msgCount: msgMap.get(r.name)?.msg_count || 0,
    fileMsgCount: msgMap.get(r.name)?.file_msg_count || 0,
    fileCount: fileMap.get(r.name)?.file_count || 0,
    fileBytes: fileMap.get(r.name)?.file_bytes || 0,
  }));
}

/**
 * 处理管理后台 API 请求（路径形如 /api/admin/*）
 */
export async function handleAdminAPI(request, env, path, url) {
  // 统一鉴权（先于任何操作）
  const auth = await verifyAdminPassword(request, env);
  if (auth) return auth;

  // GET /api/admin/rooms - 房间列表 + 统计
  if (path === '/api/admin/rooms' && request.method === 'GET') {
    const rooms = await getAdminRooms(env);
    return adminOk(rooms);
  }

  // GET /api/admin/messages?room=&limit=&keyword= - 查看任意房间消息（绕过房间密码）
  if (path === '/api/admin/messages' && request.method === 'GET') {
    const room = url.searchParams.get('room') || 'default';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const keyword = url.searchParams.get('keyword') || null;
    const messages = await getMessages(env, room, limit, null, keyword);
    return adminOk(messages);
  }

  // POST /api/admin/room/delete - 删除房间（绕过房间密码）
  if (path === '/api/admin/room/delete' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || '').trim();
    if (!room) return errorResponse('缺少房间名', 400);
    try {
      await deleteRoom(env, room, null, true);
      return adminOk({ ok: true });
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  // POST /api/admin/message/delete - 删除消息（绕过房间密码）
  if (path === '/api/admin/message/delete' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || 'default');
    const id = String(body.id || '');
    if (!id) return errorResponse('缺少消息 ID', 400);
    try {
      const result = await deleteMessage(env, room, id, null, true);
      return adminOk(result);
    } catch (e) {
      return errorResponse(e.message, 400);
    }
  }

  return errorResponse('Not Found', 404);
}
