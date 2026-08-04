// 文件管理 API
// 使用 R2 存储文件，D1 存储元数据

import { LIMITS, CORS_CONFIG } from '../config.js';
import { okResponse, errorResponse, streamResponse, fileResponse } from '../utils/response.js';
import { cachedQuery, invalidateCache, KV_TTL } from '../utils/cache.js';
import { checkRateLimit, rateLimitResponse, getClientIp } from '../middleware/rateLimit.js';

/**
 * 检查存储空间（缓存 60 秒，减少全表 SUM 扫描）
 * 写入 file_meta 后必须调用 invalidateQuotaCache 失效
 */
async function checkStorageSpace(env, incomingSize) {
  const total = await cachedQuery(env, 'quota:storage', async () => {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(size), 0) as total FROM file_meta`
    ).first();
    return row.total;
  }, KV_TTL.FILE_QUOTA_TTL);

  if (total + incomingSize > LIMITS.MAX_TOTAL_STORAGE) {
    throw new Error('存储空间已满，请联系管理员清理');
  }
}

/**
 * 检查房间文件数量（缓存 60 秒）
 */
async function checkRoomFileCount(env, room) {
  const count = await cachedQuery(env, `quota:count:${room}`, async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM file_meta WHERE room = ?`
    ).bind(room).first();
    return row.count;
  }, KV_TTL.FILE_QUOTA_TTL);

  if (count >= LIMITS.MAX_FILES_PER_ROOM) {
    throw new Error('该房间文件数量已达上限');
  }
}

/**
 * 文件写入后失效配额缓存（storage 全局 + 房间计数）
 */
export async function invalidateQuotaCache(env, room) {
  invalidateCache(env, 'quota:storage');
  invalidateCache(env, `quota:count:${room}`);
}

/**
 * 上传文件分块
 */
export async function uploadChunk(env, room, fileId, index, chunk) {
  // 验证参数（chunk 必须是文件对象，防止文本字段绕过大小检查）
  if (!fileId || isNaN(index) || !(chunk instanceof File)) {
    throw new Error('参数无效');
  }

  // 检查分块大小
  const chunkSize = chunk.size;
  if (chunkSize > LIMITS.MAX_CHUNK_SIZE) {
    throw new Error('分块大小超限');
  }

  // 暂存到 R2 的临时 key
  const key = `tmp/${room}/${fileId}/chunk-${index}`;
  await env.FILES.put(key, chunk);

  return { ok: true, index };
}

/**
 * 完成上传
 */
export async function finishUpload(env, room, fileId, name, type, totalChunks, size) {
  // 验证参数
  if (!fileId || !name) {
    throw new Error('参数无效');
  }

  // 服务端核验：列出实际临时分块（防止客户端声明 totalChunks/size 与实际不符绕过配额）
  const tmpPrefix = `tmp/${room}/${fileId}/`;
  const listed = await env.FILES.list({ prefix: tmpPrefix });
  const chunks = listed.objects
    .filter(o => /chunk-\d+$/.test(o.key))
    .sort((a, b) => parseInt(a.key.split('chunk-')[1]) - parseInt(b.key.split('chunk-')[1]));

  if (chunks.length !== totalChunks) {
    throw new Error(`分块数量不一致（实际 ${chunks.length}，声明 ${totalChunks}）`);
  }

  // 实际大小以服务端核验为准（防止客户端少报 size 绕过存储配额）
  const actualSize = chunks.reduce((s, o) => s + o.size, 0);

  // 验证文件大小
  if (actualSize > LIMITS.MAX_FILE_SIZE) {
    throw new Error(`文件大小超限（最大 ${LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB）`);
  }

  // 检查存储空间 / 房间文件数量
  await checkStorageSpace(env, actualSize);
  await checkRoomFileCount(env, room);

  // 合并分块为最终文件（无论成败，finally 中清理全部临时分块）
  try {
    if (totalChunks === 1) {
      // 单块文件：直接读取并存储
      const chunk = await env.FILES.get(chunks[0].key);
      if (!chunk) throw new Error('分块数据不存在');

      await env.FILES.put(`files/${room}/${fileId}`, chunk.body, {
        httpMetadata: { contentType: type || 'application/octet-stream' },
      });
    } else {
      // 多块文件：使用 R2 multipart upload
      const multipart = await env.FILES.createMultipartUpload(`files/${room}/${fileId}`, {
        httpMetadata: { contentType: type || 'application/octet-stream' },
      });

      const parts = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = await env.FILES.get(chunks[i].key);
        if (!chunk) throw new Error(`分块 ${i} 数据不存在`);

        const part = await multipart.uploadPart(i + 1, chunk.body);
        parts.push(part);
      }

      await multipart.complete(parts);
    }
  } finally {
    // 清理全部临时分块（含 index >= totalChunks 的残留）
    await cleanupTempFiles(env, room, fileId);
  }

  // 保存元数据到 D1（使用服务端核验的大小）
  const timestamp = Date.now();
  await env.DB.prepare(
    `INSERT INTO file_meta (file_id, room, name, type, size, total_chunks, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(fileId, room, name, type || 'application/octet-stream', actualSize, totalChunks, timestamp).run();

  // 把 placeholder-file 消息替换为 file-ref / image-ref 消息
  const msgType = (type && type.startsWith('image')) ? 'image-ref' : 'file-ref';
  await env.DB.prepare(
    `UPDATE messages SET type = ?, file_id = ?, file_name = ?, file_size = ?, file_type = ?, total_chunks = ?
     WHERE room = ? AND id = ? AND type = 'placeholder-file'`
  ).bind(msgType, fileId, name, actualSize, type || 'application/octet-stream', totalChunks, room, fileId).run();

  // 文件元数据已写入，失效配额缓存
  await invalidateQuotaCache(env, room);

  return {
    id: fileId,
    room,
    type: msgType,
    fileId,
    file_id: fileId,
    name,
    file_name: name,
    size: actualSize,
    file_size: actualSize,
    file_type: type || 'application/octet-stream',
    totalChunks,
    timestamp,
  };
}

/**
 * 获取文件原始内容（流式返回）
 */
export async function getFileRaw(env, room, fileId) {
  // 查询文件元数据
  const meta = await env.DB.prepare(
    `SELECT * FROM file_meta WHERE file_id = ? AND room = ?`
  ).bind(fileId, room).first();

  if (!meta) return null;

  // 从 R2 获取文件
  const object = await env.FILES.get(`files/${room}/${fileId}`);
  if (!object) return null;

  return { meta, body: object.body };
}

/**
 * 下载文件
 */
export async function downloadFile(env, room, fileId) {
  return getFileRaw(env, room, fileId);
}

/**
 * 清理上传失败的临时文件
 */
export async function cleanupTempFiles(env, room, fileId) {
  try {
    // 列出所有临时分块
    const listed = await env.FILES.list({ prefix: `tmp/${room}/${fileId}/` });
    for (const object of listed.objects) {
      await env.FILES.delete(object.key);
    }
  } catch (e) {
    console.error('Cleanup temp files failed:', e);
  }
}

/**
 * 处理文件相关 API 请求
 */
export async function handleFilesAPI(request, env, path, url) {
  // POST /api/upload-direct（≤5MB 小文件直传）
  if (path === '/api/upload-direct' && request.method === 'POST') {
    // 频率限制（IP 维度，防止耗尽 R2 存储配额）
    const ip = getClientIp(request);
    if (!(await checkRateLimit(env, `upload:direct:${ip}`, 20))) return rateLimitResponse();

    const form = await request.formData();
    const room = String(form.get('room') || 'default');
    const fileId = String(form.get('fileId') || '');
    const name = String(form.get('fileName') || 'file');
    const type = String(form.get('fileType') || 'application/octet-stream');
    const file = form.get('file');
    if (!fileId || !(file instanceof File)) return errorResponse('参数无效');
    try {
      const size = file.size;
      if (size > LIMITS.MAX_CHUNK_SIZE) return errorResponse(`直传仅支持 ≤${LIMITS.MAX_CHUNK_SIZE / 1024 / 1024}MB 文件`);
      // 存储配额检查（与分块上传一致，防止直传绕过）
      await checkStorageSpace(env, size);
      await checkRoomFileCount(env, room);
      // 直接写入 R2
      await env.FILES.put(`files/${room}/${fileId}`, file, {
        httpMetadata: { contentType: type },
      });
      // 保存元数据
      const timestamp = Date.now();
      await env.DB.prepare(
        `INSERT INTO file_meta (file_id, room, name, type, size, total_chunks, timestamp)
         VALUES (?, ?, ?, ?, ?, 1, ?)`
      ).bind(fileId, room, name, type, size, timestamp).run();
      // 更新消息类型
      const msgType = type.startsWith('image') ? 'image-ref' : 'file-ref';
      await env.DB.prepare(
        `UPDATE messages SET type = ?, file_id = ?, file_name = ?, file_size = ?, file_type = ?, total_chunks = 1
         WHERE room = ? AND id = ? AND type = 'placeholder-file'`
      ).bind(msgType, fileId, name, size, type, room, fileId).run();
      // 文件元数据已写入，失效配额缓存
      await invalidateQuotaCache(env, room);
      // 广播文件消息（实时通知其他客户端）
      const fileMsg = { id: fileId, room, type: msgType, file_id: fileId, file_name: name, file_size: size, file_type: type, total_chunks: 1, timestamp };
      try {
        const doId = env.CHAT_ROOM.idFromName(room);
        const stub = env.CHAT_ROOM.get(doId);
        await stub.notifyNewMessage(room, fileMsg);
      } catch (e) { console.error('Broadcast upload direct failed:', e); }
      return okResponse(fileMsg);
    } catch (e) {
      return errorResponse(e.message);
    }
  }

  // POST /api/upload-cleanup
  if (path === '/api/upload-cleanup' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || 'default');
    const fileId = String(body.fileId || '');
    if (fileId) await cleanupTempFiles(env, room, fileId);
    return okResponse({ ok: true });
  }

  // POST /api/upload-chunk
  if (path === '/api/upload-chunk' && request.method === 'POST') {
    // 频率限制（IP 维度，防止分块攻击打满 R2 写入配额）
    const ip = getClientIp(request);
    if (!(await checkRateLimit(env, `upload:chunk:${ip}`, 60))) return rateLimitResponse();

    const form = await request.formData();
    const room = String(form.get('room') || 'default');
    const fileId = String(form.get('fileId') || '');
    const index = Number(form.get('index'));
    const chunk = form.get('chunk');

    try {
      const result = await uploadChunk(env, room, fileId, index, chunk);
      return okResponse(result);
    } catch (e) {
      return errorResponse(e.message);
    }
  }

  // POST /api/upload-finish
  if (path === '/api/upload-finish' && request.method === 'POST') {
    // 频率限制（IP 维度）
    const ip = getClientIp(request);
    if (!(await checkRateLimit(env, `upload:finish:${ip}`, 30))) return rateLimitResponse();

    const body = await request.json();
    const room = String(body.room || 'default');
    const fileId = String(body.fileId || '');
    const name = String(body.name || 'file');
    const type = String(body.type || 'application/octet-stream');
    const totalChunks = Number(body.totalChunks || 1);
    const size = Number(body.size || 0);

    try {
      const result = await finishUpload(env, room, fileId, name, type, totalChunks, size);
      // 广播文件消息（占位符 → 正式文件，实时通知其他客户端）
      try {
        const doId = env.CHAT_ROOM.idFromName(room);
        const stub = env.CHAT_ROOM.get(doId);
        await stub.notifyNewMessage(room, result);
      } catch (e) { console.error('Broadcast upload finish failed:', e); }
      return okResponse(result);
    } catch (e) {
      // 上传失败时清理临时文件
      await cleanupTempFiles(env, room, fileId);
      return errorResponse(e.message);
    }
  }

  // GET /api/file-raw
  if (path === '/api/file-raw' && request.method === 'GET') {
    const room = url.searchParams.get('room') || 'default';
    const fileId = url.searchParams.get('fileId');

    if (!fileId) return errorResponse('缺少 fileId');

    const result = await getFileRaw(env, room, fileId);
    if (!result) return errorResponse('文件不存在', 404);

    // 文件直链允许任意来源（媒体标签跨域加载需要），由 CORS_CONFIG 统一控制
    const headers = {
      'Content-Type': result.meta.type || 'application/octet-stream',
      'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
    };
    if (CORS_CONFIG.allowFileAccessAnyOrigin) {
      headers['Access-Control-Allow-Origin'] = '*';
    }
    return streamResponse(result.body, headers);
  }

  // POST /api/download
  if (path === '/api/download' && request.method === 'POST') {
    const body = await request.json();
    const room = String(body.room || 'default');
    const fileId = String(body.fileId || '');

    if (!fileId) return errorResponse('缺少 fileId');

    const result = await downloadFile(env, room, fileId);
    if (!result) return errorResponse('文件不存在', 404);

    return fileResponse(result.body, result.meta.name, result.meta.type);
  }

  // GET /api/file-meta
  if (path === '/api/file-meta' && request.method === 'GET') {
    const room = url.searchParams.get('room') || 'default';
    const fileId = url.searchParams.get('fileId');

    if (!fileId) return errorResponse('缺少 fileId');

    const meta = await env.DB.prepare(
      `SELECT * FROM file_meta WHERE file_id = ? AND room = ?`
    ).bind(fileId, room).first();

    if (!meta) return errorResponse('文件不存在', 404);
    return okResponse(meta);
  }

  return null; // 不匹配
}
