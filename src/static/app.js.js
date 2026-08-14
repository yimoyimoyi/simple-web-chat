// 逸陌聊天室 - 前端 JavaScript
// 功能：实时通信、消息管理、文件上传、消息编辑、图片粘贴、历史加载、房间密码
export const JS_PAGE = `
<script>
const API_ROOT = '/api';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// DOM
const $ = s => document.querySelector(s);
const roomListEl = $('#roomList');
const newRoomInput = $('#newRoomInput');
const searchInput = $('#searchInput');
const toggleThemeBtn = $('#toggleTheme');
const refreshBtn = $('#refreshBtn');
const messagesEl = $('#messages');
const textInput = $('#textInput');
const sendBtn = $('#sendBtn');
const uploadBtn = $('#uploadBtn');
const fileInput = $('#fileInput');
const dropOverlay = $('#dropOverlay');
const connectionBar = $('#connectionBar');
const toastEl = $('#toast');
const sidebarToggle = $('#sidebarToggle');
const sidebarOverlay = $('#sidebarOverlay');
const roomsPanel = $('#rooms');
const searchClearBtn = $('#searchClear');
const connectionStatus = $('#connectionStatus');

// 状态
let currentRoom = 'default';
let rooms = [];
let isInitialLoad = true;
let ws = null;
let reconnectTimer = null;
let isLoadingHistory = false;
let noMoreHistory = false;
let roomPasswords = {}; // 缓存已验证的房间密码
let roomLastActive = {}; // 房间最后活跃时间

// 检查是否在底部附近
function isNearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
}

// 日期分组标签：今天 / 昨天 / 星期X / 月日 / 年月日
function dateLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const dayStart = t => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const diff = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7) return '星期' + '日一二三四五六'[d.getDay()];
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
function makeDivider(label) {
  const el = document.createElement('div');
  el.className = 'dateDivider';
  el.setAttribute('role', 'separator');
  el.textContent = label;
  return el;
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('room')) currentRoom = urlParams.get('room');

// ============ 工具函数 ============
function uid() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(e) {}
  return Date.now() + '_' + Math.random().toString(36).slice(2,9);
}
function nowFmt(ts) {
  try {
    const d = new Date(ts);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return isToday ? time : d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' ' + time;
  } catch(e) { return ''; }
}
async function safeJson(res) { try { return await res.json(); } catch(e) { return null; } }
function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '0 B';
  const u = ['B','KB','MB','GB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}
// 判断是否为文本文件
function isTextFile(fileName, fileType) {
  if (fileType.startsWith('text/')) return true;
  const textExts = ['.txt','.md','.json','.js','.ts','.css','.html','.xml','.csv','.yml','.yaml',
    '.toml','.ini','.conf','.log','.sh','.bash','.bat','.ps1','.py','.rb','.java','.c','.cpp',
    '.h','.go','.rs','.php','.sql','.env','.gitignore','.dockerfile','.makefile','.r','.lua',
    '.vue','.jsx','.tsx','.svelte','.astro'];
  return textExts.some(ext => fileName.endsWith(ext));
}

// 解码文本缓冲区（自动检测编码：UTF-8 / GBK / GB2312）
function decodeTextBuffer(buf) {
  const bytes = new Uint8Array(buf);
  // 检测 BOM
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(buf);
  }
  // 尝试 UTF-8，检测是否有乱码特征
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('�')) return utf8;
  // UTF-8 有乱码，尝试 GBK
  try {
    return new TextDecoder('gbk').decode(buf);
  } catch(e) {
    return utf8; // GBK 也失败，回退 UTF-8
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}
function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  var m = Math.floor(seconds / 60);
  var s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ============ 主题 ============
// 首次访问跟随系统偏好；用户手动切换后存 localStorage 固化
let theme = 'light';
try {
  theme = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch(e) {}
function updateTheme(t) {
  theme = t;
  try { localStorage.setItem('theme', theme); } catch(e) {}
  document.documentElement.classList.toggle('dark', theme === 'dark');
  toggleThemeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
updateTheme(theme);
toggleThemeBtn.onclick = () => updateTheme(theme === 'light' ? 'dark' : 'light');

// ============ 侧边栏滑动手势 ============
let touchStartX = 0;
let touchStartY = 0;
document.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
  if (dy > 80) return; // 垂直滑动忽略
  if (dx > 60 && touchStartX < 30) openSidebar(); // 右边缘右滑打开
  if (dx < -60 && roomsPanel && roomsPanel.classList.contains('open')) closeSidebar(); // 左滑关闭
}, { passive: true });

// ============ 虚拟键盘适配 ============
if (window.visualViewport) {
  const appEl = document.getElementById('app');
  window.visualViewport.addEventListener('resize', () => {
    const vh = window.visualViewport.height;
    if (appEl) appEl.style.height = vh + 'px';
  });
}

// ============ 移动端侧边栏 ============
function openSidebar() {
  if (roomsPanel) roomsPanel.classList.add('open');
  if (sidebarOverlay) sidebarOverlay.classList.add('show');
}
function closeSidebar() {
  if (roomsPanel) roomsPanel.classList.remove('open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('show');
}
if (sidebarToggle) sidebarToggle.onclick = () => {
  roomsPanel.classList.contains('open') ? closeSidebar() : openSidebar();
};
if (sidebarOverlay) sidebarOverlay.onclick = closeSidebar;
// Esc 关闭侧边栏（桌面端快捷键）
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && roomsPanel && roomsPanel.classList.contains('open')) closeSidebar();
});

// ============ Toast ============
let toastTimer = null;
function showToast(msg, type) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = type + ' show';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// ============ 弹窗工具 ============
let modalCounter = 0;
function showModal(title, fields, onSubmit, onCancel) {
  const mid = ++modalCounter;
  const overlay = document.createElement('div');
  overlay.className = 'modalOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'modalTitle_' + mid);
  overlay.innerHTML = '<div class="modalBox">' +
    '<h3 id="modalTitle_' + mid + '">' + escapeHtml(title) + '</h3>' +
    fields.map(f => '<input type="' + (f.type || 'text') + '" placeholder="' + escapeHtml(f.placeholder || '') + '" id="modal_' + mid + '_' + f.name + '" />').join('') +
    '<div class="modalError" id="modalError_' + mid + '" role="alert"></div>' +
    '<div class="modalActions"><button class="modalCancel">取消</button><button class="modalConfirm">确定</button></div>' +
    '</div>';
  document.body.appendChild(overlay);

  // 记录焦点来源，关闭时恢复（键盘可达性）
  const prevFocus = document.activeElement;
  // 统一 Esc 处理（无论焦点在输入框还是按钮上）+ Tab 焦点陷阱（aria-modal 承诺模态，焦点不得逃逸）
  const escHandler = (e) => {
    if (e.key === 'Escape') close(true);
    else if (e.key === 'Tab') {
      const focusables = overlay.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', escHandler);
  // 关闭时回调 onCancel（防止 await 永久挂起）
  const close = (cancelled) => {
    document.removeEventListener('keydown', escHandler);
    overlay.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (cancelled && onCancel) onCancel();
  };
  overlay.querySelector('.modalCancel').onclick = () => close(true);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(true); });

  overlay.querySelector('.modalConfirm').onclick = async () => {
    const values = {};
    fields.forEach(f => { values[f.name] = (document.getElementById('modal_' + mid + '_' + f.name).value || '').trim(); });
    const errEl = document.getElementById('modalError_' + mid);
    try {
      await onSubmit(values);
      close(false);
    } catch(e) {
      if (errEl) errEl.textContent = e.message;
    }
  };
  const inputs = overlay.querySelectorAll('input');
  if (inputs.length > 0) {
    setTimeout(() => inputs[0].focus(), 100);
    inputs.forEach((input, i) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (i < inputs.length - 1) { inputs[i + 1].focus(); }
          else { overlay.querySelector('.modalConfirm').click(); }
        }
      });
    });
  }
}

/**
 * 确认弹窗（替代原生 confirm，Promise<boolean>）
 */
function showConfirm(title, message, confirmText = '确定') {
  return new Promise(resolve => {
    const mid = 'confirm' + (++modalCounter);
    const overlay = document.createElement('div');
    overlay.className = 'modalOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', mid);
    overlay.innerHTML = '<div class="modalBox">' +
      '<h3 id="' + mid + '">' + escapeHtml(title) + '</h3>' +
      '<div class="confirmMsg">' + escapeHtml(message) + '</div>' +
      '<div class="modalActions"><button class="modalCancel">取消</button><button class="modalConfirm danger">' + escapeHtml(confirmText) + '</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    const done = v => { overlay.remove(); document.removeEventListener('keydown', esc); resolve(v); };
    const esc = e => { if (e.key === 'Escape') done(false); };
    overlay.querySelector('.modalCancel').onclick = () => done(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
    overlay.querySelector('.modalConfirm').onclick = () => done(true);
    document.addEventListener('keydown', esc);
    // 打开时聚焦确定按钮（危险操作默认落在确认上；键盘用户可达）
    overlay.querySelector('.modalConfirm').focus();
  });
}

// ============ WebSocket ============
let wsConnected = false;
let wsConnectedRoom = null;  // 当前连接的房间
let wsRetryCount = 0;
let wsDisconnectTimer = null;
let wsIntentional = false;   // 是否为主动关闭
let wsBackfillPending = false; // 重连成功后是否补拉断线期间的消息

// ============ 心跳 ============
// 每 30 秒发送 JSON ping（服务端 setWebSocketAutoResponse 自动应答 pong，不唤醒 DO）
// 35 秒未收到 pong 判定连接失效，主动关闭触发重连（检测断网/休眠的僵尸连接）
let heartbeatTimer = null;
let lastPong = 0;

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat() {
  stopHeartbeat();
  lastPong = Date.now();
  heartbeatTimer = setInterval(() => {
    if (Date.now() - lastPong > 35000) {
      // 超时：连接已失效，主动关闭让 close 处理器触发重连
      try { ws && ws.close(); } catch(e) {}
      return;
    }
    try { ws && ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() })); } catch(e) {}
  }, 30000);
}

function closeWebSocket() {
  wsIntentional = true;
  stopHeartbeat();
  if (ws) {
    try { ws.close(1000); } catch(e) {}
    ws = null;
  }
  wsConnected = false;
  wsConnectedRoom = null;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  wsRetryCount = 0;
}

function connectWebSocket(backfillOnOpen = false) {
  closeWebSocket();
  wsIntentional = false;
  wsBackfillPending = backfillOnOpen;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    ws = new WebSocket(proto + '//' + location.host + '/api/ws?room=' + encodeURIComponent(currentRoom));
    ws.addEventListener('open', () => {
      wsRetryCount = 0;
      wsConnected = true;
      wsConnectedRoom = currentRoom;
      if (wsDisconnectTimer) { clearTimeout(wsDisconnectTimer); wsDisconnectTimer = null; }
      if (connectionBar) connectionBar.className = '';
      if (connectionStatus) connectionStatus.textContent = '已连接';
      startHeartbeat(); // 连接建立后启动心跳
      // 重连成功：补拉断线期间的消息（保留滚动位置）
      if (wsBackfillPending) {
        wsBackfillPending = false;
        fetchMessages(false, { preserveScroll: true });
      }
    });
    ws.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        // 房间校验：丢弃不属于当前房间的消息
        var msgRoom = data.room || data.message?.room;
        if (msgRoom && msgRoom !== currentRoom) return;
        if (data.type === 'new-message') { renderSingleMessage(data.message); if (isNearBottom()) messagesEl.scrollTop = messagesEl.scrollHeight; }
        else if (data.type === 'delete-message') { const el = messagesEl.querySelector('[data-id="'+data.messageId+'"]'); if (el) removeMessageEl(el); }
        else if (data.type === 'edit-message') {
          const el = messagesEl.querySelector('[data-id="'+data.message.id+'"]');
          if (el) { el.innerHTML = ''; renderSingleMessage(data.message); }
        }
        else if (data.type === 'room-change') { loadRooms(); }
        else if (data.type === 'pong') { lastPong = Date.now(); } // 心跳应答
        else if (data.type === 'ping') ws.send(JSON.stringify({type:'pong',timestamp:Date.now()})); // 兼容旧服务端
      } catch(err) {}
    });
    ws.addEventListener('close', () => {
      stopHeartbeat();
      wsConnected = false;
      if (wsIntentional) return; // 主动关闭，不重连
      wsRetryCount++;
      if (!wsDisconnectTimer) {
        wsDisconnectTimer = setTimeout(() => {
          if (!wsConnected) {
            showToast('网络连接不稳定', 'error');
            if (connectionBar) connectionBar.className = 'disconnected';
            if (connectionStatus) connectionStatus.textContent = '网络连接断开，正在重连';
          }
        }, 5000);
      }
      reconnectTimer = setTimeout(() => connectWebSocket(true), Math.min((wsRetryCount + 1) * 2000, 15000)); // 重连成功后补拉消息
    });
    ws.addEventListener('error', () => {
      // 仅当非主动关闭时才触发关闭
      if (!wsIntentional) ws.close();
    });
  } catch(e) {
    wsConnected = false;
    if (!wsDisconnectTimer) {
      wsDisconnectTimer = setTimeout(() => {
        if (!wsConnected) showToast('网络连接不稳定', 'error');
      }, 5000);
    }
    reconnectTimer = setTimeout(() => connectWebSocket(true), 5000);
  }
}

// ============ 房间管理 ============
async function createRoom() {
  const room = newRoomInput.value.trim();
  if (!room) { newRoomInput.value = ''; return; }
  if (rooms.includes(room)) { newRoomInput.value = ''; showToast('房间已存在', 'warning'); return; }
  // 弹窗确认，可选密码
  showModal('创建房间 "' + room + '"', [
    { name: 'password', placeholder: '房间密码（留空则无密码）', type: 'password' }
  ], async (values) => {
    let passwordHash = null;
    if (values.password) {
      passwordHash = await sha256(values.password);
    }
    const res = await fetch(API_ROOT + '/room/create', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ room, passwordHash })
    });
    if (!res.ok) { const d = await safeJson(res); throw new Error(d ? d.error : '创建失败'); }
    if (passwordHash) roomPasswords[room] = passwordHash;
    newRoomInput.value = '';
    window.location.search = '?room=' + encodeURIComponent(room);
  });
  newRoomInput.value = '';
}
newRoomInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); newRoomInput.blur(); } };
newRoomInput.onblur = () => { if (newRoomInput.value.trim()) setTimeout(createRoom, 100); };

async function loadRooms() {
  let res = await fetch(API_ROOT + '/rooms');
  rooms = await safeJson(res) || [];
  if (!rooms.includes('default')) {
    await fetch(API_ROOT + '/room/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room:'default'}) });
    rooms.push('default');
  }
  // 加载活跃时间
  try { roomLastActive = JSON.parse(localStorage.getItem('roomLastActive') || '{}'); } catch(e) {}
  // 按活跃时间排序（default 始终第一）
  const others = rooms.filter(r => r !== 'default');
  others.sort((a, b) => (roomLastActive[b] || 0) - (roomLastActive[a] || 0));
  rooms = ['default', ...others];
  renderRooms();
  if (!currentRoom || !rooms.includes(currentRoom)) currentRoom = 'default';
}

function renderRooms() {
  roomListEl.innerHTML = '';
  rooms.forEach(r => {
    // button 语义：键盘 Tab/Enter/Space 可达
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'roomItem' + (r === currentRoom ? ' active' : '');
    if (r === currentRoom) div.setAttribute('aria-current', 'true');
    div.innerHTML = '<span class="name">' + escapeHtml(r) + '</span>';
    div.addEventListener('click', async () => {
      if (roomSuppressClick) { roomSuppressClick = false; return; } // 长按菜单触发，拦截误切房
      if (currentRoom === r) return;
      // 密码检查
      const needPassword = await checkRoomNeedsPassword(r);
      if (needPassword && !roomPasswords[r]) {
        await promptRoomPassword(r);
        if (!roomPasswords[r]) return; // 用户取消
      }
      currentRoom = r;
      roomLastActive[r] = Date.now();
      try { localStorage.setItem('roomLastActive', JSON.stringify(roomLastActive)); } catch(e) {}
      // 按活跃时间重新排序（default 恒第一），刚访问的房间立即置顶
      const sortedOthers = rooms.filter(x => x !== 'default');
      sortedOthers.sort((a, b) => (roomLastActive[b] || 0) - (roomLastActive[a] || 0));
      rooms = ['default', ...sortedOthers];
      window.history.replaceState({}, '', '?room=' + encodeURIComponent(r));
      renderRooms();
      closeSidebar();
      isInitialLoad = true;
      noMoreHistory = false;
      await fetchMessages(true);
      connectWebSocket();
    });
    roomListEl.appendChild(div);
    // 绑定房间上下文菜单（长按/右键删除）
    attachRoomContextMenu(div, r);
  });
}

// ============ 房间密码 ============
async function checkRoomNeedsPassword(room) {
  try {
    const res = await fetch(API_ROOT + '/room/info?room=' + encodeURIComponent(room));
    const data = await safeJson(res);
    return data && data.hasPassword;
  } catch(e) { return false; }
}

async function promptRoomPassword(room) {
  return new Promise(resolve => {
    showModal('进入房间 "' + room + '"', [
      { name: 'password', placeholder: '请输入房间密码', type: 'password' }
    ], async (values) => {
      if (!values.password) throw new Error('请输入密码');
      const hash = await sha256(values.password);
      const res = await fetch(API_ROOT + '/room/verify', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ room, password: hash })
      });
      const data = await safeJson(res);
      if (!res.ok || !data || !data.ok) throw new Error(data ? data.error : '密码错误');
      roomPasswords[room] = hash;
      showToast('密码验证成功', 'success');
      resolve();
    }, () => resolve()); // 取消也 resolve（roomPasswords 未设置，调用方据此处理）
  });
}

// ============ 消息管理 ============
async function fetchMessages(force, opts = {}) {
  const room = currentRoom;
  try {
    const kw = searchInput.value.trim().toLowerCase();
    const url = API_ROOT + '/messages?room=' + encodeURIComponent(room) + (kw ? '&keyword=' + encodeURIComponent(kw) : '');
    const res = await fetch(url);
    let msgs = await safeJson(res) || [];
    if (force || room === currentRoom) {
      const scrollTop = messagesEl.scrollTop;
      const nearBottom = isNearBottom();
      // 批量渲染期间暂停朗读（避免屏幕阅读器一次读 50 条）
      messagesEl.setAttribute('aria-live', 'off');
      messagesEl.innerHTML = '';
      noMoreHistory = false;
      renderMessages(msgs, () => {
        // 全部渲染完成后再定位滚动，避免分批渲染期间误判"离底"
        if (force || isInitialLoad) { messagesEl.scrollTop = messagesEl.scrollHeight; isInitialLoad = false; }
        else if (opts.preserveScroll) messagesEl.scrollTop = nearBottom ? messagesEl.scrollHeight : scrollTop;
      });
      messagesEl.setAttribute('aria-live', 'polite');
    }
  } catch(e) { if (room === currentRoom) messagesEl.innerHTML = ''; }
}

function renderSingleMessage(m, opts = {}) {
  const { append = true } = opts;
  const dataId = String(m.id || m.file_id || '');
  if (!dataId) return null;
  let wrapper = messagesEl.querySelector('[data-id="' + dataId + '"]');
  const isNew = !wrapper;
  if (wrapper) {
    if (wrapper.classList.contains('upload-progress') || m.type !== 'placeholder-file') {
      wrapper.innerHTML = '';
      wrapper.classList.remove('upload-progress');
    } else { return wrapper; }
  } else {
    wrapper = document.createElement('div');
    wrapper.setAttribute('data-id', dataId);
  }
  // 记录消息时间戳，用于历史加载
  if (m.timestamp) wrapper.setAttribute('data-ts', m.timestamp);
  wrapper.className = 'message';

  // 文本消息
  if (m.type === 'text') {
    const div = document.createElement('div');
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = m.content || '';
    wrapper.appendChild(div);
    // 编辑标记
    if (m.edited_at) {
      const span = document.createElement('span');
      span.className = 'edited';
      span.textContent = '(已编辑)';
      div.appendChild(span);
    }
  }

  // 文件/图片消息
  if (m.type === 'image-ref' || m.type === 'file-ref' || m.type === 'placeholder-file') {
    wrapper.classList.add('fileMsg');
    const isPlaceholder = m.type === 'placeholder-file';
    if (isPlaceholder) wrapper.classList.add('upload-progress');
    const fileId = m.file_id || m.id;
    const isImage = m.type === 'image-ref';
    const rawUrl = API_ROOT + '/file-raw?room=' + encodeURIComponent(currentRoom) + '&fileId=' + fileId;
    const fileName = (m.file_name || 'file').toLowerCase();
    const fileType = (m.file_type || '').toLowerCase();

    // 文件类型判断
    const isText = isTextFile(fileName, fileType);
    const isVideo = fileType.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/.test(fileName);
    const isAudio = fileType.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac)$/.test(fileName);
    const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');

    // 图标选择
    let icon = '📄';
    if (isImage) icon = '🖼️';
    else if (isVideo) icon = '🎬';
    else if (isAudio) icon = '🎵';
    else if (isPdf) icon = '📕';
    else if (isText) icon = '📝';

    const fileRow = document.createElement('div');
    fileRow.className = 'fileRow';
    const iconEl = document.createElement('span');
    iconEl.className = 'fileIcon';
    iconEl.textContent = icon;
    fileRow.appendChild(iconEl);
    const fileInfo = document.createElement('div');
    fileInfo.className = 'fileInfo';
    const nameEl = document.createElement('span');
    nameEl.className = 'fileName';
    nameEl.textContent = m.file_name || '文件';
    fileInfo.appendChild(nameEl);
    const sizeEl = document.createElement('div');
    sizeEl.className = 'fileSize';
    sizeEl.textContent = isPlaceholder ? '准备上传...' : humanSize(m.file_size);
    fileInfo.appendChild(sizeEl);
    fileRow.appendChild(fileInfo);
    if (!isPlaceholder) {
      const actions = document.createElement('div');
      actions.className = 'fileActions';
      const dlBtn = document.createElement('button');
      dlBtn.textContent = '⬇️'; dlBtn.title = '下载';
      dlBtn.onclick = () => downloadWithProgress(fileId, m.file_name, m.file_size, wrapper);
      actions.appendChild(dlBtn);
      const copyBtn = document.createElement('button');
      copyBtn.textContent = '🔗'; copyBtn.title = '复制直链';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(location.origin + rawUrl)
          .then(() => { copyBtn.textContent = '✅'; setTimeout(() => copyBtn.textContent = '🔗', 1500); });
      };
      actions.appendChild(copyBtn);
      fileRow.appendChild(actions);
    }
    wrapper.appendChild(fileRow);

    // 进度条
    const progressWrap = document.createElement('div');
    progressWrap.className = 'progressWrap';
    const progressBar = document.createElement('div');
    progressBar.className = 'progressBar';
    progressWrap.appendChild(progressBar);
    const progressText = document.createElement('div');
    progressText.className = 'progressText';
    progressWrap.appendChild(progressText);
    if (isPlaceholder) { progressText.textContent = '0%'; }
    else { progressWrap.style.display = 'none'; }
    wrapper.appendChild(progressWrap);

    // 图片缩略图 + 点击放大
    if (isImage && !isPlaceholder) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'imgThumbWrap';
      const img = document.createElement('img');
      img.className = 'imgThumb';
      img.src = rawUrl;
      img.loading = 'lazy';
      img.alt = m.file_name || '图片';
      img.onclick = (e) => { e.stopPropagation(); showImageViewer(rawUrl, m.file_name); };
      imgWrap.appendChild(img);
      wrapper.appendChild(imgWrap);
    }

    // 文本文件预览
    if (isText && !isPlaceholder) {
      const previewWrap = document.createElement('div');
      previewWrap.className = 'textPreviewWrap';
      const previewContent = document.createElement('pre');
      previewContent.className = 'textPreviewContent';
      previewContent.textContent = '加载中...';
      previewWrap.appendChild(previewContent);
      // 展开/收起按钮（展开时懒加载全文，不将全文存入 DOM——避免大文件常驻内存）
      const expandBtn = document.createElement('div');
      expandBtn.className = 'textExpandBtn';
      expandBtn.textContent = '展开全文 ▼';
      let expanded = false;
      expandBtn.onclick = async (e) => {
        e.stopPropagation();
        if (expanded) {
          // 收起：恢复预览片段
          expanded = false;
          previewContent.classList.remove('expanded');
          expandBtn.textContent = '展开全文 ▼';
          return;
        }
        // 展开：重新 fetch 全文（懒加载）
        expandBtn.textContent = '加载中...';
        try {
          const res = await fetch(rawUrl);
          const fullBuf = await res.arrayBuffer();
          if (!wrapper.isConnected) return; // 期间已切房间
          const fullText = decodeTextBuffer(fullBuf);
          previewContent.classList.add('expanded');
          previewContent.textContent = fullText;
          expandBtn.textContent = '收起 ▲';
          expanded = true;
        } catch(err) {
          expandBtn.textContent = '展开全文 ▼';
          showToast('全文加载失败', 'error');
        }
      };
      // 加载预览片段（自动检测编码：UTF-8 / GBK / GB2312）
      fetch(rawUrl).then(r => r.arrayBuffer()).then(buf => {
        // 校验 wrapper 仍在 DOM 中（防止切房间后写入已销毁元素）
        if (!wrapper.isConnected) return;
        const text = decodeTextBuffer(buf);
        const lines = text.split('\\n');
        const preview = lines.slice(0, 20).join('\\n');
        previewContent.textContent = preview;
        if (lines.length > 20) {
          previewWrap.appendChild(expandBtn);
        }
      }).catch(() => { previewContent.textContent = '预览加载失败'; });
      wrapper.appendChild(previewWrap);
    }

    // 视频内联播放（自定义播放器）
    if (isVideo && !isPlaceholder) {
      wrapper.appendChild(createCustomVideoPlayer(rawUrl));
    }

    // 音频内联播放（自定义播放器）
    if (isAudio && !isPlaceholder) {
      wrapper.appendChild(createCustomAudioPlayer(rawUrl));
    }

    // PDF 链接
    if (isPdf && !isPlaceholder) {
      const pdfLink = document.createElement('a');
      pdfLink.className = 'pdfLink';
      pdfLink.href = rawUrl;
      pdfLink.target = '_blank';
      pdfLink.rel = 'noopener';
      pdfLink.textContent = '📕 点击在新标签页打开 PDF';
      wrapper.appendChild(pdfLink);
    }
  }

  // 时间
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = nowFmt(m.timestamp);
  wrapper.appendChild(time);

  // 消息数据入 WeakMap（事件委托取用；元素移除时自动 GC）
  msgMap.set(wrapper, m);

  if (isNew && append) {
    const emptyEl = messagesEl.querySelector('.emptyState');
    if (emptyEl) emptyEl.remove();
    // 与前一条消息跨天时插入日期分隔线
    const lastEl = messagesEl.lastElementChild;
    const lastMsg = lastEl && lastEl.classList.contains('message') ? lastEl : null;
    if (lastMsg) {
      const prevLabel = dateLabel(+(lastMsg.getAttribute('data-ts') || 0));
      const curLabel = dateLabel(m.timestamp);
      if (prevLabel && curLabel && prevLabel !== curLabel) messagesEl.appendChild(makeDivider(curLabel));
    }
    messagesEl.appendChild(wrapper);
  }
  return wrapper;
}

function renderMessages(msgs, onDone) {
  const batchSize = 20;
  let idx = 0;
  let lastLabel = null;
  function next() {
    const end = Math.min(idx + batchSize, msgs.length);
    for (; idx < end; idx++) {
      const m = msgs[idx];
      // 批内状态机：与前一批最后一条跨天时先插日期线（batch 边界用 rAF 断点，不能依赖 DOM 相邻性）
      const label = dateLabel(m.timestamp);
      if (label && label !== lastLabel) {
        lastLabel = label;
        messagesEl.appendChild(makeDivider(label));
      }
      renderSingleMessage(m);
    }
    if (idx < msgs.length) requestAnimationFrame(next);
    else { updateEmptyState(); if (onDone) onDone(); }
  }
  next();
}

// 空状态（无消息 / 搜索无结果）
function updateEmptyState() {
  let empty = messagesEl.querySelector('.emptyState');
  const hasMsgs = !!messagesEl.querySelector('.message[data-id]');
  if (hasMsgs) { if (empty) empty.remove(); return; }
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'emptyState';
    messagesEl.appendChild(empty);
  }
  if (searchInput.value.trim()) {
    empty.innerHTML = '<div class="emptyIcon">🔍</div><div class="emptyTitle">没有找到匹配的消息</div><div class="emptyHint">换个关键词试试吧</div>';
  } else {
    empty.innerHTML = '<div class="emptyIcon">💬</div><div class="emptyTitle">这里还没有消息</div><div class="emptyHint">发送第一条消息开始聊天吧<br>也可以直接粘贴图片或拖拽文件上传</div>';
  }
}

// 删除消息节点并修复日期分隔线、空状态
function removeMessageEl(el) {
  const prev = el.previousElementSibling;
  const next = el.nextElementSibling;
  el.remove();
  if (prev && prev.classList.contains('dateDivider')) {
    const above = prev.previousElementSibling;
    const aboveMsg = above && above.classList.contains('message') ? above : null;
    const nextMsg = next && next.classList.contains('message') ? next : null;
    if (!aboveMsg || !nextMsg) prev.remove();
    else {
      const a = aboveMsg.getAttribute('data-ts');
      const b = nextMsg.getAttribute('data-ts');
      if (!a || !b || dateLabel(+a) === dateLabel(+b)) prev.remove();
    }
  }
  updateEmptyState();
}

// ============ 消息编辑 ============
function startEditMessage(wrapper, m) {
  if (wrapper.classList.contains('editing')) return;
  wrapper.classList.add('editing');
  // 隐藏内容 div
  const contentDiv = wrapper.querySelector('div');
  if (contentDiv) contentDiv.style.display = 'none';
  // 创建编辑区域
  const editArea = document.createElement('div');
  editArea.className = 'editArea';
  const textarea = document.createElement('textarea');
  textarea.value = m.content || '';
  editArea.appendChild(textarea);
  const actions = document.createElement('div');
  actions.className = 'editActions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'editCancel';
  cancelBtn.textContent = '取消';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'editSave';
  saveBtn.textContent = '保存';
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  editArea.appendChild(actions);
  wrapper.appendChild(editArea);

  // 自动聚焦
  setTimeout(() => { textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); }, 50);

  const cancel = () => {
    wrapper.classList.remove('editing');
    editArea.remove();
    if (contentDiv) contentDiv.style.display = '';
  };
  cancelBtn.onclick = cancel;
  textarea.onkeydown = e => {
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveBtn.click(); }
  };
  saveBtn.onclick = async () => {
    const newContent = textarea.value.trim();
    if (!newContent) { showToast('内容不能为空', 'warning'); return; }
    if (newContent === m.content) { cancel(); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    try {
      const res = await fetch(API_ROOT + '/edit', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ room: currentRoom, id: m.id, content: newContent })
      });
      const data = await safeJson(res);
      if (!res.ok || !data || !data.ok) throw new Error(data ? data.error : '编辑失败');
      // 更新消息
      m.content = newContent;
      m.edited_at = data.edited_at || Date.now();
      wrapper.classList.remove('editing');
      editArea.remove();
      if (contentDiv) { contentDiv.style.display = ''; contentDiv.textContent = ''; contentDiv.textContent = m.content; }
      // 重新渲染以显示编辑标记
      wrapper.innerHTML = '';
      renderSingleMessage(m);
    } catch(e) {
      showToast('编辑失败: ' + e.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
  };
}

// ============ 消息上下文菜单（长按/右键） ============
let contextMenuEl = null;
let contextMenuOverlay = null;

function hideContextMenu() {
  if (contextMenuOverlay) { contextMenuOverlay.remove(); contextMenuOverlay = null; }
  if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; }
}

function showContextMenuAt(items, x, y) {
  hideContextMenu();
  // 遮罩层（点击关闭）
  contextMenuOverlay = document.createElement('div');
  contextMenuOverlay.className = 'contextMenuOverlay';
  contextMenuOverlay.onclick = hideContextMenu;
  contextMenuOverlay.ontouchstart = hideContextMenu;
  document.body.appendChild(contextMenuOverlay);
  // 菜单面板
  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'contextMenu';
  items.forEach(function(item) {
    var btn = document.createElement('button');
    btn.className = 'contextMenuItem' + (item.cls ? ' ' + item.cls : '');
    btn.innerHTML = '<span>' + item.icon + '</span>' + item.label;
    btn.onclick = item.action;
    contextMenuEl.appendChild(btn);
  });
  document.body.appendChild(contextMenuEl);
  // 位置自适应（防止溢出屏幕）
  var menuW = contextMenuEl.offsetWidth || 150;
  var menuH = contextMenuEl.offsetHeight || 150;
  contextMenuEl.style.left = Math.max(4, Math.min(x, window.innerWidth - menuW - 8)) + 'px';
  contextMenuEl.style.top = Math.max(4, Math.min(y, window.innerHeight - menuH - 8)) + 'px';
}

function showContextMenu(wrapper, m, x, y) {
  var items = [];
  // 复制：文本消息复制内容，文件消息复制直链
  items.push({ label: '复制', icon: '📋', action: function() {
    hideContextMenu();
    var text = m.type === 'text' ? (m.content || '') : location.origin + API_ROOT + '/file-raw?room=' + encodeURIComponent(currentRoom) + '&fileId=' + (m.file_id || m.id);
    navigator.clipboard.writeText(text).then(function() { showToast('已复制', 'success'); });
  }});
  // 编辑（仅文本消息）
  if (m.type === 'text') {
    items.push({ label: '编辑', icon: '✏️', action: function() {
      hideContextMenu();
      startEditMessage(wrapper, m);
    }});
  }
  // 删除（弹窗确认 + 校验响应 + 传房间密码，成功才移除本地节点）
  items.push({ label: '删除', icon: '🗑️', cls: 'danger', action: async function() {
    hideContextMenu();
    if (!await showConfirm('删除消息', '确定删除这条消息吗？此操作不可恢复。')) return;
    var dataId = String(m.id || m.file_id || '');
    try {
      const res = await fetch(API_ROOT + '/delete', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ room: currentRoom, id: dataId, passwordHash: roomPasswords[currentRoom] || null })
      });
      const data = await safeJson(res);
      if (!res.ok || !data || !data.ok) throw new Error(data ? data.error : '删除失败');
      removeMessageEl(wrapper);
    } catch(e) { showToast('删除失败: ' + e.message, 'error'); }
  }});
  showContextMenuAt(items, x, y);
}

// ============ 消息事件委托（长按/右键菜单） ============
// 替代逐消息注册 5 个监听器：messagesEl 统一委托，2000 条消息也不增长监听器数量
// 消息数据经 msgMap（WeakMap）按 data-id 元素取用
const msgMap = new WeakMap();
let msgLongPressTimer = null;

// 判断目标是否属于消息自身交互元素（下载/复制/图片/播放器/编辑框——不弹菜单）
function isMsgInteractive(target) {
  return !!target.closest('.fileActions, img.imgThumb, audio, video, textarea, input');
}

messagesEl.addEventListener('touchstart', function(e) {
  const wrapper = e.target.closest('.message[data-id]');
  if (!wrapper || !msgMap.has(wrapper) || isMsgInteractive(e.target)) return;
  msgLongPressTimer = setTimeout(function() {
    const touch = e.touches[0] || e.changedTouches[0];
    const m = msgMap.get(wrapper);
    if (m) showContextMenu(wrapper, m, touch.clientX, touch.clientY);
  }, 500);
}, { passive: true });
messagesEl.addEventListener('touchmove', function() {
  if (msgLongPressTimer) { clearTimeout(msgLongPressTimer); msgLongPressTimer = null; }
}, { passive: true });
messagesEl.addEventListener('touchend', function() {
  if (msgLongPressTimer) { clearTimeout(msgLongPressTimer); msgLongPressTimer = null; }
});
messagesEl.addEventListener('touchcancel', function() {
  if (msgLongPressTimer) { clearTimeout(msgLongPressTimer); msgLongPressTimer = null; }
});
messagesEl.addEventListener('contextmenu', function(e) {
  const wrapper = e.target.closest('.message[data-id]');
  if (!wrapper || !msgMap.has(wrapper) || isMsgInteractive(e.target)) return;
  e.preventDefault();
  if (contextMenuEl) return; // 防止与长按重复
  const m = msgMap.get(wrapper);
  if (m) showContextMenu(wrapper, m, e.clientX, e.clientY);
});

// ============ 房间上下文菜单（长按/右键删除） ============
// 长按后 touchend 会触发 click 切房，用模块级标志拦截
let roomSuppressClick = false;

function attachRoomContextMenu(roomItem, roomName) {
  var longPressTimer = null;
  roomItem.addEventListener('touchstart', function(e) {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(function() {
      roomSuppressClick = true; // 拦截长按后的 click 切房
      setTimeout(function() { roomSuppressClick = false; }, 800); // 兜底复位
      var touch = e.touches[0] || e.changedTouches[0];
      showRoomMenu(roomName, touch.clientX, touch.clientY);
    }, 500);
  }, { passive: true });
  roomItem.addEventListener('touchmove', function() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }, { passive: true });
  roomItem.addEventListener('touchend', function() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  });
  roomItem.addEventListener('touchcancel', function() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  });
  roomItem.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    if (contextMenuEl) return; // 防止与长按重复
    showRoomMenu(roomName, e.clientX, e.clientY);
  });
}

/**
 * 删除房间完整流程：密码处理 → 二次确认 → 执行 → 清理本地状态
 */
async function deleteRoomFlow(roomName) {
  // 1. 密码处理：缓存优先 → 预检 → 弹窗输入
  let passwordHash = roomPasswords[roomName] || null;
  if (!passwordHash) {
    try {
      const needPw = await checkRoomNeedsPassword(roomName);
      if (needPw) {
        await new Promise((resolve, reject) => {
          showModal('删除房间 "' + roomName + '"', [
            { name: 'password', placeholder: '请输入房间密码', type: 'password' }
          ], async (values) => {
            if (!values.password) throw new Error('请输入密码');
            const hash = await sha256(values.password);
            const res = await fetch(API_ROOT + '/room/verify', {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ room: roomName, password: hash })
            });
            const data = await safeJson(res);
            if (!res.ok || !data || !data.ok) throw new Error(data ? data.error : '密码错误');
            passwordHash = hash;
            roomPasswords[roomName] = hash;
            resolve();
          }, reject); // 用户取消 → reject → 中止删除
        });
      }
    } catch(e) { return; } // 取消或验证失败
  }
  // 2. 二次确认（复用弹窗组件，替代原生 confirm）
  const ok = await showConfirm('删除房间', '确定删除房间 "' + roomName + '" 吗？其中的所有消息和文件将被永久删除，无法恢复。');
  if (!ok) return;
  // 3. 执行删除
  try {
    const res = await fetch(API_ROOT + '/room/delete', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ room: roomName, passwordHash })
    });
    const data = await safeJson(res);
    if (!res.ok || !data || !data.ok) throw new Error(data ? data.error : '删除失败');
  } catch(e) { showToast('删除失败: ' + e.message, 'error'); return; }
  // 4. 清理本地状态
  delete roomPasswords[roomName];
  delete roomLastActive[roomName];
  try { localStorage.setItem('roomLastActive', JSON.stringify(roomLastActive)); } catch(e) {}
  // 5. 删除的是当前房间 → 切回 default 并重建 WS（旧连接仍挂在已删房间的 DO 上）
  if (currentRoom === roomName) {
    currentRoom = 'default';
    window.history.replaceState({}, '', '?room=default');
    isInitialLoad = true;
    noMoreHistory = false;
    await loadRooms();
    await fetchMessages(true);
    connectWebSocket();
    closeSidebar();
  } else {
    await loadRooms(); // 刷新列表
  }
  showToast('房间已删除', 'success');
}

function showRoomMenu(roomName, x, y) {
  // default 房间不可删除，不弹菜单
  if (roomName === 'default') return;
  var items = [];
  items.push({ label: '删除房间', icon: '🗑️', cls: 'danger', action: function() {
    hideContextMenu();
    deleteRoomFlow(roomName);
  }});
  showContextMenuAt(items, x, y);
}

// ============ 自定义音频播放器 ============
function createCustomAudioPlayer(url) {
  var container = document.createElement('div');
  container.className = 'customAudioPlayer';
  // 音频元素（preload='none'，点击播放后按需流式加载）
  var audio = document.createElement('audio');
  audio.preload = 'none';
  audio.style.display = 'none';
  container.appendChild(audio);
  var audioLoaded = false;
  // 控制栏
  var controls = document.createElement('div');
  controls.className = 'audioControls';
  // 播放/暂停（首次点击触发加载）
  var playBtn = document.createElement('button');
  playBtn.className = 'audioPlayBtn';
  playBtn.textContent = '▶';
  playBtn.onclick = function() {
    if (!audioLoaded) { audio.src = url; audio.load(); audioLoaded = true; }
    audio.paused ? audio.play() : audio.pause();
  };
  controls.appendChild(playBtn);
  // 当前时间
  var currentTime = document.createElement('span');
  currentTime.className = 'audioTime';
  currentTime.textContent = '0:00';
  controls.appendChild(currentTime);
  // 进度条
  var progressWrap = document.createElement('div');
  progressWrap.className = 'audioProgress';
  var progressTrack = document.createElement('div');
  progressTrack.className = 'audioProgressTrack';
  var progressBar = document.createElement('div');
  progressBar.className = 'audioProgressBar';
  progressTrack.appendChild(progressBar);
  progressWrap.appendChild(progressTrack);
  // 拖拽状态
  var isSeeking = false;
  function seekByClientX(clientX) {
    if (!audio.duration) return;
    var rect = progressTrack.getBoundingClientRect();
    var ratio = (clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(ratio, 1)) * audio.duration;
  }
  // Pointer Capture：拖拽事件绑定在元素上，随节点回收无泄漏（替代 document 级监听）
  progressWrap.addEventListener('click', function(e) { seekByClientX(e.clientX); });
  progressWrap.addEventListener('pointerdown', function(e) { isSeeking = true; seekByClientX(e.clientX); progressTrack.setPointerCapture(e.pointerId); });
  progressWrap.addEventListener('pointermove', function(e) { if (isSeeking && container.isConnected) seekByClientX(e.clientX); });
  progressWrap.addEventListener('pointerup', function() { isSeeking = false; });
  progressWrap.addEventListener('pointercancel', function() { isSeeking = false; });
  controls.appendChild(progressWrap);
  // 总时长
  var durationEl = document.createElement('span');
  durationEl.className = 'audioTime';
  durationEl.textContent = '0:00';
  controls.appendChild(durationEl);
  // 音量控制
  var volumeWrap = document.createElement('div');
  volumeWrap.className = 'audioVolumeWrap';
  var volumeBtn = document.createElement('button');
  volumeBtn.className = 'audioVolumeBtn';
  volumeBtn.textContent = '🔊';
  var volumeSlider = document.createElement('input');
  volumeSlider.type = 'range';
  volumeSlider.className = 'audioVolumeSlider';
  volumeSlider.min = '0';
  volumeSlider.max = '1';
  volumeSlider.step = '0.05';
  volumeSlider.value = '1';
  function updateVolumeIcon() {
    if (audio.muted || audio.volume === 0) volumeBtn.textContent = '🔇';
    else if (audio.volume < 0.5) volumeBtn.textContent = '🔉';
    else volumeBtn.textContent = '🔊';
  }
  volumeBtn.onclick = function() {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      audio.volume = parseFloat(volumeSlider.value) || 1;
      volumeSlider.value = audio.volume;
    } else if (volumeSlider.classList.contains('expanded')) {
      volumeSlider.classList.remove('expanded');
    } else {
      volumeSlider.classList.add('expanded');
    }
  };
  volumeSlider.oninput = function() {
    audio.volume = parseFloat(volumeSlider.value);
    audio.muted = false;
    updateVolumeIcon();
  };
  volumeWrap.appendChild(volumeBtn);
  volumeWrap.appendChild(volumeSlider);
  controls.appendChild(volumeWrap);
  container.appendChild(controls);
  // 音频事件
  audio.addEventListener('loadedmetadata', function() { durationEl.textContent = formatTime(audio.duration); });
  audio.addEventListener('timeupdate', function() {
    if (!isSeeking && audio.duration) progressBar.style.width = (audio.currentTime / audio.duration * 100) + '%';
    currentTime.textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener('play', function() { playBtn.textContent = '⏸'; });
  audio.addEventListener('pause', function() { playBtn.textContent = '▶'; });
  audio.addEventListener('ended', function() { playBtn.textContent = '▶'; progressBar.style.width = '0%'; currentTime.textContent = '0:00'; });
  audio.addEventListener('volumechange', updateVolumeIcon);
  return container;
}

// ============ 自定义视频播放器 ============
// 从线上部署版本恢复；修复：Pointer Capture 替代 document 监听（防泄漏）、playsInline（iOS 内联播放）
function createCustomVideoPlayer(url) {
  var container = document.createElement('div');
  container.className = 'customVideoPlayer';
  // 视频元素（preload='metadata' 加载首帧作为海报，点击后按需流式加载）
  var video = document.createElement('video');
  video.src = url;
  video.preload = 'metadata';
  video.className = 'videoEl';
  video.muted = true;
  video.playsInline = true; // iOS 内联播放
  video.addEventListener('loadedmetadata', function() {
    if (video.readyState >= 1) { video.currentTime = 0; }
  });
  container.appendChild(video);
  // 播放按钮遮罩（首帧画面作为背景透过遮罩显示）
  var playOverlay = document.createElement('div');
  playOverlay.className = 'videoPlayOverlay';
  playOverlay.innerHTML = '<span>▶</span>';
  playOverlay.onclick = function(e) {
    e.stopPropagation();
    video.play();
  };
  container.appendChild(playOverlay);
  // 自定义控制栏
  var controls = document.createElement('div');
  controls.className = 'videoControls';
  // 播放/暂停
  var playBtn = document.createElement('button');
  playBtn.className = 'videoPlayBtn';
  playBtn.textContent = '▶';
  playBtn.onclick = function() { video.paused ? video.play() : video.pause(); };
  controls.appendChild(playBtn);
  // 当前时间
  var currentTime = document.createElement('span');
  currentTime.className = 'videoTime';
  currentTime.textContent = '0:00';
  controls.appendChild(currentTime);
  // 进度条（Pointer Capture：拖拽事件绑定在元素上，随节点回收无泄漏）
  var progressWrap = document.createElement('div');
  progressWrap.className = 'videoProgress';
  var progressTrack = document.createElement('div');
  progressTrack.className = 'videoProgressTrack';
  var progressBar = document.createElement('div');
  progressBar.className = 'videoProgressBar';
  progressTrack.appendChild(progressBar);
  progressWrap.appendChild(progressTrack);
  var isSeeking = false;
  function seekByClientX(clientX) {
    if (!video.duration) return;
    var rect = progressTrack.getBoundingClientRect();
    var ratio = (clientX - rect.left) / rect.width;
    video.currentTime = Math.max(0, Math.min(ratio, 1)) * video.duration;
  }
  progressWrap.addEventListener('click', function(e) { seekByClientX(e.clientX); });
  progressWrap.addEventListener('pointerdown', function(e) {
    isSeeking = true;
    seekByClientX(e.clientX);
    progressTrack.setPointerCapture(e.pointerId); // 指针移出元素仍持续捕获
  });
  progressWrap.addEventListener('pointermove', function(e) {
    if (isSeeking && container.isConnected) seekByClientX(e.clientX);
  });
  progressWrap.addEventListener('pointerup', function() { isSeeking = false; });
  progressWrap.addEventListener('pointercancel', function() { isSeeking = false; });
  controls.appendChild(progressWrap);
  // 总时长
  var durationEl = document.createElement('span');
  durationEl.className = 'videoTime';
  durationEl.textContent = '0:00';
  controls.appendChild(durationEl);
  // 音量控制
  var volumeWrap = document.createElement('div');
  volumeWrap.className = 'videoVolumeWrap';
  var volumeBtn = document.createElement('button');
  volumeBtn.className = 'videoVolumeBtn';
  volumeBtn.textContent = '🔊';
  var volumeSlider = document.createElement('input');
  volumeSlider.type = 'range';
  volumeSlider.className = 'videoVolumeSlider';
  volumeSlider.min = '0';
  volumeSlider.max = '1';
  volumeSlider.step = '0.05';
  volumeSlider.value = '1';
  function updateVolumeIcon() {
    if (video.muted || video.volume === 0) volumeBtn.textContent = '🔇';
    else if (video.volume < 0.5) volumeBtn.textContent = '🔉';
    else volumeBtn.textContent = '🔊';
  }
  volumeBtn.onclick = function() {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = parseFloat(volumeSlider.value) || 1;
      volumeSlider.value = video.volume;
    } else if (volumeSlider.classList.contains('expanded')) {
      volumeSlider.classList.remove('expanded');
    } else {
      volumeSlider.classList.add('expanded');
    }
  };
  volumeSlider.oninput = function() {
    video.volume = parseFloat(volumeSlider.value);
    video.muted = false;
    updateVolumeIcon();
  };
  volumeWrap.appendChild(volumeBtn);
  volumeWrap.appendChild(volumeSlider);
  controls.appendChild(volumeWrap);
  // 全屏按钮
  var fsBtn = document.createElement('button');
  fsBtn.className = 'videoFsBtn';
  fsBtn.textContent = '⛶';
  fsBtn.title = '全屏';
  fsBtn.onclick = function() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  };
  controls.appendChild(fsBtn);
  container.appendChild(controls);
  // 视频事件
  video.addEventListener('loadedmetadata', function() { durationEl.textContent = formatTime(video.duration); });
  video.addEventListener('timeupdate', function() {
    if (!isSeeking && video.duration) progressBar.style.width = (video.currentTime / video.duration * 100) + '%';
    currentTime.textContent = formatTime(video.currentTime);
  });
  video.addEventListener('play', function() { playBtn.textContent = '⏸'; playOverlay.style.display = 'none'; });
  video.addEventListener('pause', function() { playBtn.textContent = '▶'; });
  video.addEventListener('ended', function() { playBtn.textContent = '▶'; progressBar.style.width = '0%'; currentTime.textContent = '0:00'; playOverlay.style.display = ''; });
  video.addEventListener('volumechange', updateVolumeIcon);
  video.addEventListener('error', function() { playBtn.textContent = '⚠️'; playBtn.title = '视频加载失败'; });
  return container;
}

// ============ 发送消息 ============
let isSending = false; // 防重入：发送期间 Enter/按钮连点不重复请求
async function sendText() {
  const content = textInput.value.trim();
  if (!content || isSending) return;
  isSending = true;
  sendBtn.disabled = true;
  sendBtn.textContent = '...';
  // 失败时恢复输入内容（仅当用户没有重新输入）
  const restoreInput = () => {
    if (!textInput.value.trim()) {
      textInput.value = content;
      textInput.style.height = '44px';
      textInput.dispatchEvent(new Event('input'));
    }
    updateSendButtonState();
  };
  try {
    const res = await fetch(API_ROOT + '/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room:currentRoom,type:'text',content}) });
    const data = await safeJson(res);
    if (!res.ok || !data || !data.message) {
      if (res.status === 429) { showToast('发送过于频繁，请稍后再试', 'warning'); restoreInput(); return; }
      throw new Error(data ? data.error : '发送失败');
    }
    // 成功才清空；仅当输入未被用户改动（避免吞掉发送期间的新输入）
    if (textInput.value.trim() === content) {
      textInput.value = '';
      textInput.style.height = '44px';
      updateSendButtonState();
    }
    // 本地渲染发送的消息（WS 广播也会推送，按 data-id 幂等去重，先到先得）
    renderSingleMessage(data.message);
  } catch(e) { restoreInput(); showToast('发送失败: ' + e.message, 'error'); }
  finally { isSending = false; sendBtn.textContent = '发送'; updateSendButtonState(); }
}
function updateSendButtonState() {
  sendBtn.disabled = textInput.value.trim().length === 0;
}
function autoGrowTextarea() {
  textInput.style.height = '44px';
  textInput.style.height = Math.min(Math.max(textInput.scrollHeight, 44), 160) + 'px';
}
sendBtn.onclick = sendText;
textInput.oninput = () => { updateSendButtonState(); autoGrowTextarea(); };
textInput.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (textInput.value.trim()) sendText(); } }; // isComposing：输入法选词确认不误发送
updateSendButtonState(); autoGrowTextarea();

// ============ 图片粘贴 ============
textInput.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        // 给文件一个有意义的名字
        const ext = file.type.split('/')[1] || 'png';
        const namedFile = new File([file], 'clipboard_' + Date.now() + '.' + ext, { type: file.type });
        handleFiles([namedFile]);
      }
      return;
    }
  }
});

// ============ 上拉加载历史消息 ============
messagesEl.addEventListener('scroll', async () => {
  if (messagesEl.scrollTop > 50 || isLoadingHistory || noMoreHistory) return;
  // 捕获当前房间，防止加载期间切换房间导致消息错乱
  const loadingRoom = currentRoom;
  isLoadingHistory = true;
  // 获取最早消息的 timestamp
  const firstMsg = messagesEl.querySelector('.message');
  if (!firstMsg) { isLoadingHistory = false; return; }
  const oldestTs = getOldestTimestamp();
  if (!oldestTs) { noMoreHistory = true; isLoadingHistory = false; return; }
  // 显示加载提示
  const loadingEl = document.createElement('div');
  loadingEl.className = 'historyLoading';
  loadingEl.textContent = '加载中...';
  messagesEl.insertBefore(loadingEl, messagesEl.firstChild);
  try {
    const oldScrollHeight = messagesEl.scrollHeight;
    const oldScrollTop = messagesEl.scrollTop;
    const res = await fetch(API_ROOT + '/messages?room=' + encodeURIComponent(loadingRoom) + '&before=' + oldestTs + '&limit=50');
    const msgs = await safeJson(res) || [];
    loadingEl.remove();
    // 校验房间：期间可能已切换到其他房间
    if (loadingRoom !== currentRoom) { isLoadingHistory = false; return; }
    if (msgs.length === 0) {
      noMoreHistory = true;
      const doneEl = document.createElement('div');
      doneEl.className = 'historyDone';
      doneEl.textContent = '—— 没有更多消息了 ——';
      messagesEl.insertBefore(doneEl, messagesEl.firstChild);
    } else {
      // 在顶部插入新消息（批量渲染暂停朗读）
      messagesEl.setAttribute('aria-live', 'off');
      const firstMsg = messagesEl.querySelector('.message[data-id]');
      const startLabel = firstMsg ? dateLabel(+(firstMsg.getAttribute('data-ts') || 0)) : '';
      const lastBatchLabel = msgs.length ? dateLabel(msgs[msgs.length - 1].timestamp) : '';
      // 新批次与旧顶部消息同日：旧顶部的日期分隔线移交给新批次，避免重复
      if (startLabel && lastBatchLabel === startLabel &&
          firstMsg.previousElementSibling && firstMsg.previousElementSibling.classList.contains('dateDivider')) {
        firstMsg.previousElementSibling.remove();
      }
      const fragment = document.createDocumentFragment();
      let lastLabel = startLabel;
      msgs.forEach(m => {
        const label = dateLabel(m.timestamp);
        if (label && label !== lastLabel) {
          lastLabel = label;
          fragment.appendChild(makeDivider(label));
        }
        const el = createMessageElement(m);
        if (el) fragment.appendChild(el);
      });
      messagesEl.insertBefore(fragment, messagesEl.firstChild);
      messagesEl.setAttribute('aria-live', 'polite');
      // 保持滚动位置
      const newScrollHeight = messagesEl.scrollHeight;
      messagesEl.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
    }
  } catch(e) {
    loadingEl.remove();
    showToast('加载历史消息失败', 'error');
  }
  isLoadingHistory = false;
});

function getOldestTimestamp() {
  const msgs = messagesEl.querySelectorAll('.message[data-id]');
  if (msgs.length === 0) return null;
  // 找到第一条有 data-ts 属性的消息，或从 DOM 推断
  for (const el of msgs) {
    const ts = el.getAttribute('data-ts');
    if (ts) return parseInt(ts);
  }
  return null;
}

function createMessageElement(m) {
  const dataId = String(m.id || m.file_id || '');
  if (!dataId) return null;
  // renderSingleMessage 支持 append:false 返回游离节点（不再劫持 messagesEl.appendChild）
  return renderSingleMessage(m, { append: false });
}

// ============ 文件上传 ============
let dragCounter = 0;
document.addEventListener('dragenter', e => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).some(t => t === 'Files')) { dragCounter++; dropOverlay.style.display = 'flex'; }
  e.preventDefault();
});
document.addEventListener('dragleave', e => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).some(t => t === 'Files')) { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; dropOverlay.style.display = 'none'; } }
  e.preventDefault();
});
document.addEventListener('dragover', e => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).some(t => t === 'Files')) e.dataTransfer.dropEffect = 'copy';
  e.preventDefault();
});
document.addEventListener('drop', e => {
  e.preventDefault(); dropOverlay.style.display = 'none'; dragCounter = 0;
  if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});
uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = () => { if (fileInput.files.length) handleFiles(fileInput.files); fileInput.value = null; };

async function handleFiles(files) {
  const uploadRoom = currentRoom;
  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
  for (const file of files) {
    // 前端校验
    if (file.size > MAX_FILE_SIZE) {
      showToast(file.name + ' 超过 500MB 限制', 'error');
      continue;
    }
    const fileId = uid();
    await sendPlaceholderMessage(fileId, file.name, file.size, uploadRoom);
    try {
      if (file.size <= 5 * 1024 * 1024) {
        // ≤5MB 直传，省去分块开销
        const msg = await directUpload(file, fileId, uploadRoom);
        const wrapper = messagesEl.querySelector('[data-id="'+fileId+'"]');
        if (wrapper) { const pw = wrapper.querySelector('.progressWrap'); if (pw) pw.classList.add('done'); const txt = wrapper.querySelector('.progressText'); if (txt) txt.textContent = '上传完成 ✓'; }
        if (wrapper && msg) {
          renderSingleMessage(msg);
          const newEl = messagesEl.querySelector('[data-id="'+fileId+'"]');
          if (newEl && newEl !== wrapper) wrapper.replaceWith(newEl);
        }
        continue; // 跳过后续 finishUpload 流程
      }
      await uploadFileInChunks(file, fileId, uploadRoom);
      const msg = await finishUpload(file, fileId, uploadRoom);
      const wrapper = messagesEl.querySelector('[data-id="'+fileId+'"]');
      if (wrapper && msg) {
        renderSingleMessage(msg);
        const newEl = messagesEl.querySelector('[data-id="'+fileId+'"]');
        if (newEl && newEl !== wrapper) wrapper.replaceWith(newEl);
      }
    } catch(e) {
      console.error('Upload failed:', e);
      showToast('上传失败: ' + file.name, 'error');
      // 清理 R2 临时分块
      try { await fetch(API_ROOT + '/upload-cleanup', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room:uploadRoom,fileId}) }); } catch(_) {}
      await deleteMessage(fileId, uploadRoom, roomPasswords[uploadRoom] || null);
    }
  }
  // 上传完成不强制跳底（用户可能在查看历史）
  if (isNearBottom()) messagesEl.scrollTop = messagesEl.scrollHeight;
}
async function sendPlaceholderMessage(id, name, size, room) {
  const res = await fetch(API_ROOT + '/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room,type:'placeholder-file',id,name,size}) });
  const data = await safeJson(res);
  if (!res.ok || !data || !data.message) throw new Error('占位符发送失败');
  renderSingleMessage(data.message);
}
async function deleteMessage(id, room, passwordHash) {
  const el = messagesEl.querySelector('[data-id="'+id+'"]');
  if (el && currentRoom === room) removeMessageEl(el);
  await fetch(API_ROOT + '/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room,id,passwordHash}) });
}
async function uploadFileInChunks(file, fileId, room) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const chunk = file.slice(i * CHUNK_SIZE, Math.min(file.size, (i+1) * CHUNK_SIZE));
    const wrapper = messagesEl.querySelector('[data-id="'+fileId+'"]');
    if (wrapper) {
      const bar = wrapper.querySelector('.progressBar');
      const txt = wrapper.querySelector('.progressText');
      const pct = ((i + 1) / totalChunks * 100);
      if (bar) bar.style.width = pct.toFixed(1) + '%';
      if (txt) txt.textContent = Math.round(pct) + '% · ' + humanSize((i+1) * CHUNK_SIZE) + ' / ' + humanSize(file.size);
    }
    const fd = new FormData();
    fd.append('room', room); fd.append('fileId', fileId); fd.append('index', i); fd.append('chunk', chunk);
    const res = await fetch(API_ROOT + '/upload-chunk', { method: 'POST', body: fd });
    if (!res.ok) { const d = await safeJson(res); throw new Error(d ? d.error : '分块 '+i+' 上传失败'); }
  }
  const wrapper = messagesEl.querySelector('[data-id="'+fileId+'"]');
  if (wrapper) {
    const pw = wrapper.querySelector('.progressWrap');
    if (pw) pw.classList.add('done');
    const txt = wrapper.querySelector('.progressText');
    if (txt) txt.textContent = '上传完成 ✓';
  }
}
async function directUpload(file, fileId, room) {
  const fd = new FormData();
  fd.append('room', room);
  fd.append('fileId', fileId);
  fd.append('fileName', file.name);
  fd.append('fileType', file.type);
  fd.append('file', file);
  const res = await fetch(API_ROOT + '/upload-direct', { method: 'POST', body: fd });
  const data = await safeJson(res);
  if (!res.ok || !data) throw new Error(data ? data.error : '上传失败');
  return { id:data.id||fileId, type:data.type||'file-ref', file_id:data.file_id||fileId, file_name:data.file_name||file.name, file_size:data.file_size||file.size, file_type:data.file_type||file.type, timestamp:data.timestamp||Date.now() };
}
async function finishUpload(file, fileId, room) {
  try {
    const res = await fetch(API_ROOT + '/upload-finish', { method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room,fileId,name:file.name,type:file.type,totalChunks:Math.ceil(file.size/CHUNK_SIZE),size:file.size}) });
    const data = await safeJson(res);
    if (!res.ok || !data) throw new Error(data ? data.error : '上传失败');
    return { id:data.id||fileId, type:data.type||'file-ref', file_id:data.file_id||fileId, file_name:data.file_name||file.name, file_size:data.file_size||file.size, file_type:data.file_type||file.type, timestamp:data.timestamp||Date.now() };
  } catch(e) {
    const ph = document.querySelector('[data-id="'+fileId+'"]');
    if (ph) { const pw = ph.querySelector('.progressWrap'); if (pw) pw.classList.add('error'); const txt = ph.querySelector('.progressText'); if (txt) txt.textContent = '同步失败'; }
    throw e;
  }
}

// ============ 文件下载 ============
function downloadWithProgress(fileId, fileName, fileSize, wrapper) {
  const allPw = wrapper.querySelectorAll('.progressWrap');
  const pw = allPw[allPw.length - 1];
  if (!pw) return;
  pw.style.display = '';
  pw.classList.remove('done', 'error');
  const bar = pw.querySelector('.progressBar');
  const txt = pw.querySelector('.progressText');
  if (bar) bar.style.width = '0%';
  if (txt) txt.textContent = '准备下载...';
  const rawUrl = API_ROOT + '/file-raw?room=' + encodeURIComponent(currentRoom) + '&fileId=' + fileId;
  const xhr = new XMLHttpRequest();
  xhr.open('GET', rawUrl, true);
  xhr.responseType = 'blob';
  xhr.onprogress = (ev) => {
    const total = fileSize || ev.total;
    if (total > 0) { const pct = Math.min((ev.loaded / total) * 100, 100); if (bar) bar.style.width = pct.toFixed(1) + '%'; if (txt) txt.textContent = Math.round(pct) + '% · ' + humanSize(ev.loaded) + ' / ' + humanSize(total); }
    else { if (txt) txt.textContent = '下载中... ' + humanSize(ev.loaded); }
  };
  xhr.onload = () => {
    if (xhr.status === 200) {
      const url = URL.createObjectURL(xhr.response);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (pw) pw.classList.add('done');
      if (txt) txt.textContent = '下载完成 ✓';
      setTimeout(() => { if (pw) pw.style.display = 'none'; }, 3000);
    }
  };
  xhr.onerror = () => { if (pw) pw.classList.add('error'); if (txt) txt.textContent = '下载失败'; };
  xhr.send();
}

// ============ 窗口聚焦刷新 ============
window.addEventListener('focus', () => {
  loadRooms();
});

// ============ 图片查看器 ============
function showImageViewer(url, name) {
  const overlay = document.createElement('div');
  overlay.className = 'imgViewerOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '图片查看');
  overlay.innerHTML = '<div class="imgViewerLoading">加载中...</div><button type="button" class="imgViewerClose" aria-label="关闭">✕</button>' +
    '<img class="imgViewerImg" src="' + url + '" alt="' + escapeHtml(name || '') + '" />';
  document.body.appendChild(overlay);
  const img = overlay.querySelector('.imgViewerImg');
  const loadingEl = overlay.querySelector('.imgViewerLoading');
  // 记录焦点来源，关闭时恢复（与 showModal 先例一致）
  const prevFocus = document.activeElement;
  const closeBtn = overlay.querySelector('.imgViewerClose');
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); } // 焦点陷阱：查看器仅一个可聚焦元素，Tab 循环回自身
  };
  const close = () => {
    document.removeEventListener('keydown', onKey); // 幂等：无论何种方式关闭都移除监听
    overlay.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
  overlay.onclick = (e) => { if (e.target === overlay) close(); }; // 仅点遮罩关闭（与 modal 行为一致）
  closeBtn.onclick = close;
  img.onload = () => loadingEl.remove(); // 加载完成移除占位
  img.onerror = () => { loadingEl.textContent = '图片加载失败'; };
  img.decoding = 'async';
  document.addEventListener('keydown', onKey);
  // 打开时聚焦关闭按钮（键盘用户可达）
  closeBtn.focus();
}

// ============ 搜索和刷新 ============
let searchTimer = null;
let searchComposing = false; // 输入法组合中不触发搜索（避免半截拼音打接口）
// 清除按钮显隐：值非空时显示
function updateSearchClear() {
  if (!searchClearBtn) return;
  searchClearBtn.hidden = !searchInput.value.trim();
}
const triggerSearch = () => {
  updateSearchClear();
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (searchComposing) return;
    fetchMessages(true);
  }, 300);
};
searchInput.addEventListener('compositionstart', () => { searchComposing = true; });
searchInput.addEventListener('compositionend', () => { searchComposing = false; triggerSearch(); });
searchInput.oninput = () => { if (!searchComposing) triggerSearch(); };
if (searchClearBtn) searchClearBtn.onclick = () => {
  searchInput.value = '';
  updateSearchClear();
  fetchMessages(true); // 清空后立即重置，无需 debounce
  searchInput.focus();
};
refreshBtn.onclick = () => fetchMessages(true);
updateSearchClear(); // 初始状态（刷新页面后输入框可能保留值）

// ============ 初始化 ============
async function initApp() {
  isInitialLoad = true;
  await loadRooms();

  // URL 直接进入房间时，检查密码
  if (currentRoom && currentRoom !== 'default') {
    const needPassword = await checkRoomNeedsPassword(currentRoom);
    if (needPassword && !roomPasswords[currentRoom]) {
      await promptRoomPassword(currentRoom);
      if (!roomPasswords[currentRoom]) {
        // 用户取消密码输入，回退到 default
        currentRoom = 'default';
        window.history.replaceState({}, '', '?room=default');
        renderRooms();
      }
    }
  }

  await fetchMessages(true);
  connectWebSocket();
}
initApp().catch(e => { showToast('初始化失败: ' + e.message, 'error'); });
</script>
</body>
</html>
`;
