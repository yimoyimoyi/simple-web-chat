// 逸陌聊天室 - 样式文件
export const CSS_PAGE = `
/* ============ 基础变量 ============ */
:root {
  --bg: #f0f2f5;
  --panel: #ffffff;
  --text: #1a1a2e;
  --muted: #667085;
  --accent: #4361ee;
  --accent-light: #e8edff;
  --accent-strong: #2c55d6;
  --danger: #d43b5f;
  --danger-light: #fde8ed;
  --bubble: #ffffff;
  --bubble-text: #1a1a2e;
  --bubble-shadow: 0 1px 2px rgba(0,0,0,0.06);
  --input: #f5f6f8;
  --input-text: #333;
  --input-border: #e0e3e8;
  --btn-bg: #4361ee;
  --btn-bg-hover: #3451de;
  --btn-text: #fff;
  --upload-bg: #6c7a89;
  --upload-bg-hover: #5a6775;
  --room-active-bg: var(--accent);
  --room-active-text: #fff;
  --progress-bg: #e8edff;
  --progress-fill: var(--accent);
  --progress-text: var(--accent);
  --success: #10b981;
  --warning: #f59e0b;
}

.dark {
  --bg: #0f1117;
  --panel: #1a1d28;
  --text: #e4e6eb;
  --muted: #6d768b;
  --accent: #5b7bf9;
  --accent-light: #1e2440;
  --accent-strong: #4a68e8;
  --danger: #ff6b8a;
  --danger-light: #2a1520;
  --bubble: #232733;
  --bubble-text: #e4e6eb;
  --bubble-shadow: 0 1px 3px rgba(0,0,0,0.2);
  --input: #1a1d28;
  --input-text: #c8cad0;
  --input-border: #2d3140;
  --btn-bg: #5b7bf9;
  --btn-bg-hover: #4a68e8;
  --btn-text: #fff;
  --upload-bg: #3d4255;
  --upload-bg-hover: #4d5268;
  --room-active-bg: var(--accent);
  --room-active-text: #fff;
  --progress-bg: #1e2440;
  --progress-fill: var(--accent);
  --progress-text: var(--accent);
  --success: #34d399;
  --warning: #fbbf24;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }

/* 键盘焦点可见性（纯键盘用户） */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* 减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .message, .roomItem, .toast, .contextMenu, .modalBox { animation: none !important; transition: none !important; }
}

/* 确认弹窗消息文本 */
.confirmMsg {
  color: var(--muted);
  margin-bottom: 16px;
  font-size: 14px;
  line-height: 1.6;
}

/* 图片查看器加载占位 */
.imgViewerLoading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 14px;
  opacity: 0.8;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  touch-action: manipulation;
  overflow: hidden;
}

/* ============ 布局 ============ */
#app {
  display: flex;
  height: 100dvh;
  height: 100vh;
  overflow: hidden;
}

/* ============ 侧边栏 ============ */
#rooms {
  flex: 0 0 220px;
  background: var(--panel);
  border-right: 1px solid var(--input-border);
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  gap: 12px;
}

#newRoomInput {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1.5px solid var(--input-border);
  background: var(--input);
  color: var(--input-text);
  outline: none;
  font-size: 13px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
#newRoomInput:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(67,97,238,0.1);
}

#roomList { overflow-y: auto; flex: 1; }
#roomList::-webkit-scrollbar { width: 4px; }
#roomList::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 2px; }

.roomItem {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--text);
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s, color 0.15s;
  font-size: 14px;
  text-align: left;
  font-family: inherit;
}
.roomItem:hover { background: var(--input); }
.roomItem.active {
  background: var(--room-active-bg);
  color: var(--room-active-text);
}
.roomItem span.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
/* ============ 主区域 ============ */
#main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

#topBar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--input-border);
  background: var(--panel);
  align-items: center;
  flex-shrink: 0;
}
#searchInput {
  flex: 1;
  padding: 9px 14px;
  border-radius: 10px;
  border: 1.5px solid var(--input-border);
  background: var(--input);
  color: var(--input-text);
  outline: none;
  font-size: 13px;
  min-width: 0;
  transition: border-color 0.2s, box-shadow 0.2s;
}
#searchInput:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(67,97,238,0.1);
}

#topBar button {
  background-color: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  flex-shrink: 0;
  white-space: nowrap;
}
#topBar button:hover { background-color: var(--btn-bg-hover); }
#topBar button:active { transform: scale(0.97); }

/* ============ 消息区域 ============ */
#messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
#messages::-webkit-scrollbar { width: 5px; }
#messages::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }

/* 历史加载提示 */
.historyLoading {
  text-align: center;
  padding: 12px;
  color: var(--muted);
  font-size: 13px;
}
.historyDone {
  text-align: center;
  padding: 12px;
  color: var(--muted);
  font-size: 12px;
  opacity: 0.6;
}

/* ============ 消息气泡 ============ */
.message {
  align-self: flex-end;
  max-width: min(85%, 600px);
  background: var(--bubble);
  color: var(--bubble-text);
  padding: 10px 14px 22px;
  border-radius: 16px 16px 4px 16px;
  position: relative;
  word-break: break-word;
  box-shadow: var(--bubble-shadow);
  font-size: 14px;
  line-height: 1.6;
  animation: msgIn 0.2s ease-out;
  /* 离屏消息跳过渲染与布局（大房间滚动性能），不干扰上拉加载 */
  content-visibility: auto;
  contain-intrinsic-size: auto 60px;
}
@keyframes msgIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.message > div { text-align: left; }
.message .time {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-top: 6px;
  text-align: right;
}
.message .edited {
  font-size: 10px;
  color: var(--muted);
  margin-left: 6px;
  font-style: italic;
}
/* 编辑模式 */
.editArea {
  margin-top: 8px;
}
.editArea textarea {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1.5px solid var(--accent);
  background: var(--input);
  color: var(--input-text);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
  min-height: 60px;
  max-height: 160px;
  outline: none;
}
.editActions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  justify-content: flex-end;
}
.editActions button {
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.editActions .editSave {
  background: var(--accent);
  color: #fff;
}
.editActions .editSave:hover { background: var(--accent-strong); }
.editActions .editCancel {
  background: var(--input);
  color: var(--text);
  border: 1px solid var(--input-border);
}
.editActions .editCancel:hover { background: var(--input-border); }

/* ============ 文件行 ============ */
.fileRow {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: var(--input);
  border-radius: 10px;
  margin-top: 4px;
}
.fileIcon { font-size: 20px; flex-shrink: 0; }
.fileInfo { flex: 1; min-width: 0; }
.fileName {
  color: var(--accent);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  font-size: 13px;
  font-weight: 500;
}
.fileName:hover { text-decoration: underline; }
.fileSize { color: var(--muted); font-size: 11px; margin-top: 2px; }
.fileActions { display: flex; gap: 6px; flex-shrink: 0; }
.fileActions button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.15s;
  opacity: 0.6;
}
.fileActions button:hover { opacity: 1; background: rgba(0,0,0,0.06); }

/* ============ 文本预览 ============ */
.textPreviewWrap {
  margin-top: 8px;
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: var(--input);
  border: 1px solid var(--input-border);
}
.textPreviewContent {
  padding: 10px 12px;
  margin: 0;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text);
  max-height: 180px;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-all;
  transition: max-height 0.3s ease;
}
.textPreviewContent.expanded {
  max-height: none;
}
.textExpandBtn {
  text-align: center;
  padding: 6px;
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
  background: var(--input);
  border-top: 1px solid var(--input-border);
  transition: background 0.15s;
}
.textExpandBtn:hover { background: var(--accent-light); }

/* ============ 视频/音频 ============ */
.mediaWrap {
  margin-top: 8px;
  border-radius: 10px;
  overflow: hidden;
}
.mediaWrap video {
  width: 100%;
  max-height: 350px;
  border-radius: 10px;
  background: #000;
}
.mediaWrap audio {
  width: 100%;
  height: 40px;
}

/* ============ PDF 链接 ============ */
.pdfLink {
  display: block;
  margin-top: 8px;
  padding: 10px 14px;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 8px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}
.pdfLink:hover { background: var(--accent); color: #fff; }

/* ============ 图片缩略图 ============ */
.imgThumbWrap {
  margin-top: 8px;
  border-radius: 10px;
  overflow: hidden;
  display: inline-block;
  max-width: 100%;
  cursor: pointer;
  position: relative;
}
.imgThumb {
  display: block;
  max-width: 240px;
  max-height: 180px;
  object-fit: cover;
  border-radius: 10px;
  transition: opacity 0.15s, transform 0.2s;
}
.imgThumb:hover { opacity: 0.85; transform: scale(1.02); }

/* ============ 图片查看器 ============ */
.imgViewerOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  cursor: zoom-out;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.imgViewerImg {
  max-width: 92vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
  cursor: default;
  user-select: none;
}
.imgViewerClose {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  background: rgba(255,255,255,0.15);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  transition: background 0.15s;
  z-index: 10001;
}
.imgViewerClose:hover { background: rgba(255,255,255,0.3); }

/* ============ 进度条 ============ */
.progressWrap {
  margin-top: 8px;
  background: var(--progress-bg);
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}
.progressBar {
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  border-radius: 3px;
  transition: width 0.2s ease-out;
  position: relative;
}
.progressBar::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  animation: progressShine 1.5s infinite;
}
@keyframes progressShine {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}
.progressText {
  font-size: 11px;
  color: var(--progress-text);
  margin-top: 4px;
  text-align: center;
  font-weight: 500;
}
.progressWrap.done .progressBar { background: var(--success); }
.progressWrap.done .progressText { color: var(--success); }
.progressWrap.error .progressBar { background: var(--danger); }
.progressWrap.error .progressText { color: var(--danger); }

/* ============ 输入区域 ============ */
#inputArea {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--input-border);
  background: var(--panel);
  align-items: flex-end;
  flex-shrink: 0;
}
#textInput {
  flex: 1;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1.5px solid var(--input-border);
  resize: none;
  background: var(--input);
  color: var(--input-text);
  min-height: 44px;
  max-height: 160px;
  outline: none;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  transition: border-color 0.2s, box-shadow 0.2s;
}
#textInput:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(67,97,238,0.1);
}

.controls { display: flex; gap: 6px; flex-shrink: 0; align-items: flex-end; }
button.primary {
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  padding: 10px 18px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s, transform 0.1s;
}
button.primary:hover:not(:disabled) { background: var(--btn-bg-hover); }
button.primary:active:not(:disabled) { transform: scale(0.97); }
button.primary:disabled { opacity: 0.5; cursor: not-allowed; }

#uploadBtn {
  background: var(--upload-bg);
  color: #fff;
  border: none;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s, transform 0.1s;
}
#uploadBtn:hover { background: var(--upload-bg-hover); }
#uploadBtn:active { transform: scale(0.97); }

/* ============ 密码弹窗 ============ */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 9998;
  backdrop-filter: blur(2px);
}
@media (min-width: 769px) {
  .modalOverlay { align-items: center; }
}
.modalBox {
  background: var(--panel);
  border-radius: 16px;
  padding: 24px;
  width: min(90vw, 360px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.modalBox h3 {
  margin-bottom: 16px;
  font-size: 16px;
}
.modalBox input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1.5px solid var(--input-border);
  background: var(--input);
  color: var(--input-text);
  font-size: 14px;
  outline: none;
  margin-bottom: 12px;
}
.modalBox input:focus {
  border-color: var(--accent);
}
.modalActions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.modalActions button {
  padding: 8px 18px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  cursor: pointer;
}
.modalActions .modalConfirm {
  background: var(--accent);
  color: #fff;
}
.modalActions .modalCancel {
  background: var(--input);
  color: var(--text);
}
.modalError {
  color: var(--danger);
  font-size: 12px;
  margin-bottom: 8px;
  min-height: 18px;
}

/* ============ 拖拽覆盖 ============ */
#dropOverlay {
  display: none;
  position: fixed;
  inset: 0;
  align-items: center;
  justify-content: center;
  background: rgba(67,97,238,0.85);
  color: #fff;
  font-size: 20px;
  font-weight: 600;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

/* ============ 连接状态 ============ */
#connectionBar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 1000;
  transition: background 0.4s, opacity 0.4s;
  opacity: 0;
  pointer-events: none;
}
#connectionBar.connected { background: var(--success); opacity: 1; }
#connectionBar.connecting { background: var(--warning); opacity: 1; animation: barPulse 1s infinite; }
#connectionBar.disconnected { background: var(--danger); opacity: 1; }
@keyframes barPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

#toast {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%) translateY(-60px);
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  z-index: 1001;
  transition: transform 0.3s ease, opacity 0.3s ease;
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  color: #fff;
}
#toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
#toast.success { background: var(--success); }
#toast.warning { background: var(--warning); }
#toast.error { background: var(--danger); }

/* ============ 移动端侧边栏切换 ============ */
#sidebarToggle {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  background: var(--panel);
  border: none;
  border-right: 1px solid var(--input-border);
  border-bottom: 1px solid var(--input-border);
  border-radius: 0;
  width: 44px;
  height: 44px;
  font-size: 20px;
  cursor: pointer;
  justify-content: center;
  align-items: center;
  color: var(--text);
}
#sidebarOverlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 49;
  -webkit-tap-highlight-color: transparent;
}

/* ============ 响应式 ============ */
@media (max-width: 768px) {
  /* 弹窗底部圆角 */
  .modalBox { border-radius: 16px 16px 0 0; width: 100%; }
  /* 侧边栏：默认隐藏，点击展开 */
  #sidebarToggle { display: flex; }
  #rooms {
    position: fixed;
    top: 0;
    left: -280px;
    bottom: 0;
    width: 280px;
    z-index: 50;
    transition: left 0.25s ease;
    padding: 52px 12px 16px;
    box-shadow: 4px 0 16px rgba(0,0,0,0.15);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  #rooms.open { left: 0; }
  #sidebarOverlay.show { display: block; }
  .roomItem { padding: 12px; justify-content: space-between; }
  .roomItem span.name { font-size: 14px; }

  /* 顶栏：左侧留出侧边栏按钮空间 */
  #topBar { padding: 10px 12px 10px 52px; }
  #topBar button { padding: 8px 10px; font-size: 13px; }
  #topBar button span { display: none; }
  #searchInput { font-size: 14px; }

  /* 消息区域 */
  .message { max-width: 92%; }
  #messages { padding: 12px; gap: 6px; }

  /* 输入区域：适配虚拟键盘 */
  #inputArea {
    padding: 8px 12px;
    gap: 8px;
    /* 使用 env(safe-area-inset-bottom) 适配刘海屏 */
    padding-bottom: max(8px, env(safe-area-inset-bottom, 8px));
  }
  #textInput {
    min-height: 40px;
    max-height: 120px;
    padding: 8px 12px;
    font-size: 16px; /* 防止 iOS 缩放 */
  }
  .controls { gap: 4px; }
  #uploadBtn span { display: none; }
  #uploadBtn, button.primary {
    min-width: 44px;
    height: 44px;
    padding: 0 10px;
    font-size: 16px;
  }

  /* 弹窗 */
  .modalBox { padding: 20px; width: min(92vw, 340px); }
  .modalBox input { font-size: 16px; } /* 防止 iOS 缩放 */

  /* 编辑区域 */
  .editArea textarea { font-size: 16px; min-height: 50px; }

  /* 连接状态和 Toast */
  #toast { font-size: 12px; padding: 6px 14px; top: 52px; }

  /* 文件行 */
  .fileRow { padding: 6px 8px; }
  .fileActions button { font-size: 18px; padding: 6px; }

}

@media (max-width: 380px) {
  #inputArea { padding: 6px 8px; gap: 4px; }
  #textInput { min-height: 36px; padding: 8px 10px; }
  #uploadBtn, button.primary { min-width: 40px; height: 40px; }
  .message { max-width: 95%; font-size: 13px; }
  #topBar { padding-left: 48px; }
}

/* ============ iOS 安全区域 ============ */
@supports (padding: max(0px)) {
  #inputArea {
    padding-bottom: max(8px, env(safe-area-inset-bottom, 8px));
  }
  #rooms {
    padding-top: max(52px, env(safe-area-inset-top, 52px));
  }
}

::placeholder { color: var(--muted); }

/* ============ 自定义视频播放器 ============ */
.customVideoPlayer {
  margin-top: 8px;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
  position: relative;
}
.customVideoPlayer .videoEl {
  display: block;
  width: 100%;
  max-height: 350px;
  cursor: pointer;
}
/* 播放遮罩（点击后按需加载） */
.videoPlayOverlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.5);
  cursor: pointer;
  z-index: 2;
  transition: opacity 0.2s;
}
.videoPlayOverlay span {
  font-size: 48px;
  color: rgba(255,255,255,0.9);
  text-shadow: 0 2px 8px rgba(0,0,0,0.4);
  transition: transform 0.15s;
}
.videoPlayOverlay:hover span { transform: scale(1.1); }
.videoControls {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(4px);
}
.videoPlayBtn {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, transform 0.1s;
  flex-shrink: 0;
}
.videoPlayBtn:active { transform: scale(0.92); }
.videoTime {
  font-size: 11px;
  color: rgba(255,255,255,0.8);
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: center;
  flex-shrink: 0;
}
.videoProgress {
  flex: 1;
  min-width: 40px;
  cursor: pointer;
  padding: 14px 0;
  margin: -14px 0;
  position: relative;
}
.videoProgressTrack {
  height: 4px;
  background: rgba(255,255,255,0.25);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}
.videoProgressBar {
  height: 100%;
  width: 0;
  background: rgba(255,255,255,0.9);
  border-radius: 2px;
  transition: width 0.1s linear;
  pointer-events: none;
}
.videoProgressTrack::after {
  content: '';
  position: absolute;
  inset: -8px 0;
}
.videoVolumeWrap {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.videoVolumeBtn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border: none;
  background: none;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: background 0.1s;
}
.videoVolumeBtn:hover { background: rgba(255,255,255,0.15); }
.videoVolumeSlider {
  width: 0;
  opacity: 0;
  overflow: hidden;
  transition: width 0.2s, opacity 0.15s, margin 0.2s;
  cursor: pointer;
  accent-color: #fff;
  height: 20px;
  margin: 0;
}
.videoVolumeSlider.expanded,
.videoVolumeWrap:hover .videoVolumeSlider {
  width: 60px;
  opacity: 1;
  margin-left: 2px;
}
.videoFsBtn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border: none;
  background: none;
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: background 0.1s;
  flex-shrink: 0;
}
.videoFsBtn:hover { background: rgba(255,255,255,0.15); }

/* 视频播放器滑块自定义样式 */
.videoVolumeSlider::-webkit-slider-runnable-track {
  height: 4px;
  background: rgba(255,255,255,0.25);
  border-radius: 2px;
}
.videoVolumeSlider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  margin-top: -5px;
  cursor: pointer;
}
.videoVolumeSlider::-moz-range-track {
  height: 4px;
  background: rgba(255,255,255,0.25);
  border-radius: 2px;
}
.videoVolumeSlider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  border: none;
  cursor: pointer;
}

/* ============ 消息上下文菜单 ============ */
.contextMenuOverlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: transparent;
  -webkit-tap-highlight-color: transparent;
}
.contextMenu {
  position: fixed;
  z-index: 9999;
  background: var(--panel);
  border: 1px solid var(--input-border);
  border-radius: 12px;
  padding: 6px;
  min-width: 150px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  animation: ctxMenuIn 0.12s ease;
}
@keyframes ctxMenuIn {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}
.contextMenuItem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: none;
  color: var(--text);
  font-size: 14px;
  border-radius: 8px;
  cursor: pointer;
  min-height: 44px;
  font-family: inherit;
  transition: background 0.1s;
}
.contextMenuItem:hover { background: var(--input); }
.contextMenuItem:active { background: var(--accent-light); }
.contextMenuItem.danger { color: var(--danger); }
.contextMenuItem span { font-size: 16px; flex-shrink: 0; }

/* ============ 自定义音频播放器 ============ */
.customAudioPlayer {
  margin-top: 8px;
  background: var(--input);
  border-radius: 10px;
  padding: 6px 10px;
  border: 1px solid var(--input-border);
}
.audioControls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.audioPlayBtn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s, background 0.15s;
  flex-shrink: 0;
}
.audioPlayBtn:active { transform: scale(0.92); }
.audioTime {
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: center;
  flex-shrink: 0;
}
.audioProgress {
  flex: 1;
  min-width: 40px;
  cursor: pointer;
  padding: 16px 0; /* 44px touch area */
  margin: -16px 0;
  position: relative;
}
.audioProgressTrack {
  height: 4px;
  background: var(--input-border);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}
.audioProgressBar {
  height: 100%;
  width: 0;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.1s linear;
  pointer-events: none;
}
.audioProgressTrack::after {
  content: '';
  position: absolute;
  inset: -8px 0;
}
.audioVolumeWrap {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.audioVolumeBtn {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border: none;
  background: none;
  font-size: 14px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  transition: background 0.1s;
}
.audioVolumeBtn:hover { background: var(--accent-light); }
.audioVolumeSlider {
  width: 0;
  opacity: 0;
  overflow: hidden;
  transition: width 0.2s, opacity 0.15s, margin 0.2s;
  cursor: pointer;
  accent-color: var(--accent);
  height: 20px;
  margin: 0;
}
.audioVolumeSlider.expanded,
.audioVolumeWrap:hover .audioVolumeSlider {
  width: 60px;
  opacity: 1;
  margin-left: 2px;
}
/* 自定义滑块样式 */
.audioVolumeSlider::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--input-border);
  border-radius: 2px;
}
.audioVolumeSlider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  margin-top: -5px;
  cursor: pointer;
}
.audioVolumeSlider::-moz-range-track {
  height: 4px;
  background: var(--input-border);
  border-radius: 2px;
}
.audioVolumeSlider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  cursor: pointer;
}

/* 移动端上下文菜单微调 */
@media (max-width: 768px) {
  .contextMenu {
    min-width: 160px;
    padding: 8px;
  }
  .contextMenuItem {
    padding: 12px 18px;
    font-size: 15px;
    gap: 12px;
  }
  .contextMenuItem span { font-size: 18px; }
  .audioPlayBtn { width: 36px; height: 36px; min-width: 36px; font-size: 14px; }
  .audioVolumeBtn { width: 34px; height: 34px; min-width: 34px; font-size: 16px; }
  .videoPlayBtn { width: 34px; height: 34px; min-width: 34px; font-size: 14px; }
  .videoVolumeBtn { width: 32px; height: 32px; min-width: 32px; font-size: 15px; }
  .videoFsBtn { width: 32px; height: 32px; min-width: 32px; font-size: 16px; }
}

/* ============ 打印隐藏 ============ */
@media print {
  #rooms, #topBar, #inputArea, #sidebarToggle, #connectionBar, #toast, #dropOverlay { display: none !important; }
  #messages { overflow: visible; }
  .message { break-inside: avoid; }
}
`;
