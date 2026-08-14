// 逸陌聊天室 - HTML 骨架
// CSS 和 JS 由 style.css.js 和 app.js.js 提供
export const HTML_HEAD = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="逸陌聊天室 - 基于 Cloudflare Worker 的实时聊天应用">
<title>逸陌聊天室</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>✨</text></svg>">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1d28" media="(prefers-color-scheme: dark)">
</head>`;

export const HTML_BODY = `<body>
<button id="sidebarToggle" aria-label="打开房间列表">☰</button>
<div id="sidebarOverlay"></div>
<div id="app">
  <div id="rooms">
    <div id="roomsHeader"><span class="logo">✨</span><span class="title">逸陌聊天室</span></div>
    <input id="newRoomInput" placeholder="＋ 创建新房间" aria-label="创建房间" />
    <div id="roomList"></div>
  </div>
  <div id="main">
    <div id="topBar">
      <div id="topBarTitle">
        <span id="roomName">加载中...</span>
        <span id="roomSubtitle"></span>
      </div>
      <input id="searchInput" placeholder="搜索消息..." aria-label="搜索消息" />
      <button id="toggleTheme" aria-label="切换主题" title="切换主题">🌙</button>
      <button id="refreshBtn" aria-label="刷新" title="刷新">↻</button>
    </div>
    <div id="searchInfo" hidden></div>
    <div id="msgWrap">
      <div id="messages" aria-live="polite"></div>
      <button id="scrollBottomBtn" aria-label="回到最新消息" title="回到最新消息">↓</button>
    </div>
    <div id="inputArea">
      <div class="inputWrap">
        <textarea id="textInput" placeholder="输入消息...（支持粘贴图片）" aria-label="输入消息"></textarea>
        <div class="inputHint">Enter 发送 · Shift+Enter 换行 · 支持粘贴图片</div>
      </div>
      <div class="controls">
        <button id="uploadBtn" aria-label="发送文件" title="发送文件">📎</button>
        <input id="fileInput" type="file" multiple style="display:none" />
        <button id="sendBtn" class="primary" disabled aria-label="发送消息"><span class="label">发送</span><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
      </div>
    </div>
  </div>
</div>
<div id="dropOverlay">📂 释放文件以上传</div>
<div id="connectionBar"></div>
<div id="toast"></div>
`;
