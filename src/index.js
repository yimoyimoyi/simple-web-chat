// 逸陌聊天室 - Worker 入口

import { LIMITS } from './config.js';
import { handleRoomsAPI } from './api/rooms.js';
import { handleMessagesAPI } from './api/messages.js';
import { handleFilesAPI } from './api/files.js';
import { errorResponse, corsResponse } from './utils/response.js';
import { verifyRoomPassword } from './middleware/auth.js';
import { reqCache } from './utils/cache.js';
import { HTML_HEAD, HTML_BODY } from './static/index.html.js';
import { CSS_PAGE } from './static/style.css.js';
import { JS_PAGE } from './static/app.js.js';

// 拼接完整 HTML 页面（只在首次请求时拼接）
let cachedHTML = null;
function getHTML() {
  if (!cachedHTML) {
    cachedHTML = HTML_HEAD + '\n<style>' + CSS_PAGE + '</style>\n' + HTML_BODY + '\n' + JS_PAGE;
  }
  return cachedHTML;
}

export default {
  async fetch(request, env, ctx) {
    // 清空请求级内存缓存（reqCache 为请求级缓存，禁止存放跨请求状态）
    reqCache.clear();

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === 'OPTIONS') return corsResponse();

      // 请求体大小检查（防止超大 body 全量读入内存）
      // 上传路径允许更大：5MB 分块 + form 编码开销
      const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
      if (contentLength > 0) {
        const isUploadPath = path === '/api/upload-direct' || path === '/api/upload-chunk';
        const maxBody = isUploadPath ? LIMITS.MAX_CHUNK_SIZE + 1024 * 1024 : LIMITS.MAX_REQUEST_SIZE;
        if (contentLength > maxBody) {
          return errorResponse(`请求体过大（最大 ${Math.floor(maxBody / 1024 / 1024 * 10) / 10}MB）`, 413);
        }
      }

      // 静态页面（短 TTL + stale-while-revalidate：避免每次刷新重传 30KB 内联资源，部署后 5 分钟内生效）
      if (path === '/' || path === '/index.html') {
        return new Response(getHTML(), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
          },
        });
      }

      // WebSocket
      if (path === '/api/ws') {
        const room = url.searchParams.get('room') || 'default';
        const passwordHash = url.searchParams.get('password') || null;

        // 验证房间密码
        try {
          await verifyRoomPassword(env, room, passwordHash);
        } catch (e) {
          return errorResponse(e.message, 401);
        }

        const id = env.CHAT_ROOM.idFromName(room);
        return env.CHAT_ROOM.get(id).fetch(request);
      }

      // API 路由
      if (path.startsWith('/api/')) {
        const roomsRes = await handleRoomsAPI(request, env, path, url);
        if (roomsRes) return roomsRes;
        const msgsRes = await handleMessagesAPI(request, env, path, url);
        if (msgsRes) return msgsRes;
        const filesRes = await handleFilesAPI(request, env, path, url);
        if (filesRes) return filesRes;
        return errorResponse('Not Found', 404);
      }

      return errorResponse('Not Found', 404);
    } catch (err) {
      console.error('Worker error:', err);
      return errorResponse('Internal Server Error: ' + err.message, 500);
    }
  },
};

export { ChatRoomDO } from './do/ChatRoom.js';
