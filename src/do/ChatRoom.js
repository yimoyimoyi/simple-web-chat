// ChatRoom Durable Object
// 使用 WebSocket Hibernation API 实现实时通信

import { DurableObject } from "cloudflare:workers";
import { LIMITS } from "../config.js";

export class ChatRoomDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  /**
   * 处理 HTTP 请求（WebSocket 升级）
   */
  async fetch(request) {
    const url = new URL(request.url);
    const room = url.searchParams.get("room") || "default";

    // 检查连接数限制
    const currentConnections = this.ctx.getWebSockets().length;
    if (currentConnections >= LIMITS.MAX_WS_CONNECTIONS_PER_ROOM) {
      return new Response("连接数已满", { status: 503 });
    }

    // 创建 WebSocket 对
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // 配置心跳自动应答：客户端发 {"type":"ping"} 时由运行时直接回 {"type":"pong"}
    // 不唤醒休眠中的 DO、不计费时长（Hibernation 官方推荐方案）
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        JSON.stringify({ type: "ping" }),
        JSON.stringify({ type: "pong" })
      )
    );

    // 接受 WebSocket 连接（使用 Hibernation API）
    this.ctx.acceptWebSocket(server, [room]);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * 接收 WebSocket 消息
   * 心跳 ping/pong 已由 setWebSocketAutoResponse 在运行时自动应答（不唤醒 DO）
   */
  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      // 预留业务消息处理入口（当前心跳走自动应答）
      void data;
    } catch (e) {
      // 非 JSON 消息，忽略
    }
  }

  /**
   * WebSocket 关闭
   */
  async webSocketClose(ws, code, reason, wasClean) {
    // Hibernation API 会自动处理关闭
  }

  /**
   * WebSocket 错误
   */
  async webSocketError(ws, error) {
    console.error("WebSocket error:", error);
  }

  /**
   * 通知所有连接的客户端有新消息
   */
  async notifyNewMessage(room, message) {
    const sockets = this.ctx.getWebSockets(room);
    const payload = JSON.stringify({
      type: "new-message",
      room,
      message,
    });

    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch (e) {
        // 忽略发送失败的连接
      }
    }
  }

  /**
   * 通知所有连接的客户端消息被删除
   */
  async notifyDeleteMessage(room, messageId) {
    const sockets = this.ctx.getWebSockets(room);
    const payload = JSON.stringify({
      type: "delete-message",
      room,
      messageId,
    });

    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch (e) {
        // 忽略发送失败的连接
      }
    }
  }

  /**
   * 通知所有连接的客户端消息被编辑
   */
  async notifyEditMessage(room, message) {
    const sockets = this.ctx.getWebSockets(room);
    const payload = JSON.stringify({
      type: "edit-message",
      room,
      message,
    });

    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch (e) {
        // 忽略发送失败的连接
      }
    }
  }
}
