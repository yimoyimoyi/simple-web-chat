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
let theme = 'light';
try { theme = localStorage.getItem('theme') || 'light'; } catch(e) {}
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
function showModal(title, fields, onSubmit) {
  const mid = ++modalCounter;
  const overlay = document.createElement('div');
  overlay.className = 'modalOverlay';
  overlay.innerHTML = '<div class="modalBox">' +
    '<h3>' + escapeHtml(title) + '</h3>' +
    fields.map(f => '<input type="' + (f.type || 'text') + '" placeholder="' + escapeHtml(f.placeholder || '') + '" id="modal_' + mid + '_' + f.name + '" />').join('') +
    '<div class="modalError" id="modalError_' + mid + '"></div>' +
    '<div class="modalActions"><button class="modalCancel">取消</button><button class="modalConfirm">确定</button></div>' +
    '</div>';
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modalCancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('.modalConfirm').onclick = async () => {
    const values = {};
    fields.forEach(f => { values[f.name] = (document.getElementById('modal_' + mid + '_' + f.name).value || '').trim(); });
    const errEl = document.getElementById('modalError_' + mid);
    try {
      await onSubmit(values);
      close();
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
        if (e.key === 'Escape') { close(); }
      });
    });
  }
}

// ============ WebSocket ============
let wsConnected = false;
let wsConnectedRoom = null;  // 当前连接的房间
let wsRetryCount = 0;
let wsDisconnectTimer = null;
let wsIntentional = false;   // 是否为主动关闭

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

function connectWebSocket() {
  closeWebSocket();
  wsIntentional = false;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    ws = new WebSocket(proto + '//' + location.host + '/api/ws?room=' + encodeURIComponent(currentRoom));
    ws.addEventListener('open', () => {
      wsRetryCount = 0;
      wsConnected = true;
      wsConnectedRoom = currentRoom;
      if (wsDisconnectTimer) { clearTimeout(wsDisconnectTimer); wsDisconnectTimer = null; }
      if (connectionBar) connectionBar.className = '';
      startHeartbeat(); // 连接建立后启动心跳
    });
    ws.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        // 房间校验：丢弃不属于当前房间的消息
        var msgRoom = data.room || data.message?.room;
        if (msgRoom && msgRoom !== currentRoom) return;
        if (data.type === 'new-message') { renderSingleMessage(data.message); if (isNearBottom()) messagesEl.scrollTop = messagesEl.scrollHeight; }
        else if (data.type === 'delete-message') { const el = messagesEl.querySelector('[data-id="'+data.messageId+'"]'); if (el) el.remove(); }
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
          }
        }, 5000);
      }
      reconnectTimer = setTimeout(connectWebSocket, Math.min((wsRetryCount + 1) * 2000, 15000));
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
    reconnectTimer = setTimeout(connectWebSocket, 5000);
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
    const div = document.createElement('div');
    div.className = 'roomItem' + (r === currentRoom ? ' active' : '');
    div.innerHTML = '<span class="name">' + escapeHtml(r) + '</span>';
    div.addEventListener('click', async () => {
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
    });
  });
}

// ============ 消息管理 ============
async function fetchMessages(force) {
  const room = currentRoom;
  try {
    const kw = searchInput.value.trim().toLowerCase();
    const url = API_ROOT + '/messages?room=' + encodeURIComponent(room) + (kw ? '&keyword=' + encodeURIComponent(kw) : '');
    const res = await fetch(url);
    let msgs = await safeJson(res) || [];
    if (force || room === currentRoom) {
      messagesEl.innerHTML = '';
      noMoreHistory = false;
      renderMessages(msgs);
      if (force || isInitialLoad) { messagesEl.scrollTop = messagesEl.scrollHeight; isInitialLoad = false; }
    }
  } catch(e) { if (room === currentRoom) messagesEl.innerHTML = ''; }
}

function renderSingleMessage(m) {
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
      // 展开/收起按钮
      const expandBtn = document.createElement('div');
      expandBtn.className = 'textExpandBtn';
      expandBtn.textContent = '展开全文 ▼';
      let expanded = false;
      expandBtn.onclick = (e) => {
        e.stopPropagation();
        expanded = !expanded;
        previewContent.classList.toggle('expanded', expanded);
        expandBtn.textContent = expanded ? '收起 ▲' : '展开全文 ▼';
      };
      // 加载文本内容（自动检测编码：UTF-8 / GBK / GB2312）
      fetch(rawUrl).then(r => r.arrayBuffer()).then(buf => {
        // 校验 wrapper 仍在 DOM 中（防止切房间后写入已销毁元素）
        if (!wrapper.isConnected) return;
        const bytes = new Uint8Array(buf);
        let text = '';
        // 检测 BOM
        if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
          text = new TextDecoder('utf-8').decode(buf);
        } else {
          // 尝试 UTF-8，检测是否有乱码特征
          const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
          const hasGarbled = utf8.includes('�');
          if (!hasGarbled) {
            text = utf8;
          } else {
            // UTF-8 有乱码，尝试 GBK
            try {
              text = new TextDecoder('gbk').decode(buf);
            } catch(e) {
              text = utf8; // GBK 也失败，回退 UTF-8
            }
          }
        }
        const lines = text.split('\\n');
        const preview = lines.slice(0, 20).join('\\n');
        previewContent.textContent = preview;
        if (lines.length > 20) {
          previewWrap.appendChild(expandBtn);
          previewContent.dataset.full = text;
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

  // 绑定上下文菜单（长按/右键）
  attachContextMenu(wrapper, m);

  if (isNew) messagesEl.appendChild(wrapper);
  return wrapper;
}

function renderMessages(msgs) {
  const batchSize = 20;
  let idx = 0;
  function next() {
    const end = Math.min(idx + batchSize, msgs.length);
    for (; idx < end; idx++) renderSingleMessage(msgs[idx]);
    if (idx < msgs.length) requestAnimationFrame(next);
  }
  next();
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

function showContextMenu(wrapper, m, x, y) {
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
  var items = [];
  // 复制：文本消息复制内容，文件消息复制直链
  items.push({ label: '复制', icon: '📋', action: function() {
    hideContextMenu();
    var text = m.type === 'text' ? (m.content || '') : location.origin + '/api/file-raw?room=' + encodeURIComponent(currentRoom) + '&fileId=' + (m.file_id || m.id);
    navigator.clipboard.writeText(text).then(function() { showToast('已复制', 'success'); });
  }});
  // 编辑（仅文本消息）
  if (m.type === 'text') {
    items.push({ label: '编辑', icon: '✏️', action: function() {
      hideContextMenu();
      startEditMessage(wrapper, m);
    }});
  }
  // 删除
  items.push({ label: '删除', icon: '🗑️', cls: 'danger', action: function() {
    hideContextMenu();
    if (!confirm('确定删除？')) return;
    var dataId = String(m.id || m.file_id || '');
    fetch('/api/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room:currentRoom,id:dataId}) });
    wrapper.remove();
  }});
  // 构建菜单项
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
  var left = Math.min(x, window.innerWidth - menuW - 8);
  var top = Math.min(y, window.innerHeight - menuH - 8);
  contextMenuEl.style.left = Math.max(4, left) + 'px';
  contextMenuEl.style.top = Math.max(4, top) + 'px';
}

function attachContextMenu(wrapper, m) {
  var longPressTimer = null;
  // 触摸长按（500ms）
  wrapper.addEventListener('touchstart', function(e) {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(function() {
      var touch = e.touches[0] || e.changedTouches[0];
      showContextMenu(wrapper, m, touch.clientX, touch.clientY);
    }, 500);
  }, { passive: true });
  wrapper.addEventListener('touchmove', function() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }, { passive: true });
  wrapper.addEventListener('touchend', function() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  });
  wrapper.addEventListener('touchcancel', function() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  });
  // 右键菜单（桌面端）- 始终拦截原生菜单
  wrapper.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    if (contextMenuEl) return; // 防止与长按重复
    showContextMenu(wrapper, m, e.clientX, e.clientY);
  });
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
  progressWrap.addEventListener('click', function(e) { seekByClientX(e.clientX); });
  progressWrap.addEventListener('mousedown', function(e) { isSeeking = true; seekByClientX(e.clientX); });
  document.addEventListener('mousemove', function(e) { if (isSeeking && container.isConnected) seekByClientX(e.clientX); });
  document.addEventListener('mouseup', function() { isSeeking = false; });
  progressWrap.addEventListener('touchstart', function(e) { isSeeking = true; seekByClientX(e.touches[0].clientX); }, { passive: true });
  progressWrap.addEventListener('touchmove', function(e) { if (isSeeking && container.isConnected) seekByClientX(e.touches[0].clientX); }, { passive: true });
  progressWrap.addEventListener('touchend', function() { isSeeking = false; });
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

// ============ 发送消息 ============
async function sendText() {
  const content = textInput.value.trim();
  if (!content) return;
  sendBtn.disabled = true;
  sendBtn.textContent = '...';
  textInput.value = '';
  textInput.style.height = '44px';
  updateSendButtonState();
  try {
    const res = await fetch(API_ROOT + '/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room:currentRoom,type:'text',content}) });
    const data = await safeJson(res);
    if (!res.ok || !data || !data.message) {
      if (res.status === 429) { showToast('发送过于频繁，请稍后再试', 'warning'); return; }
      throw new Error(data ? data.error : '发送失败');
    }
    // 本地渲染发送的消息（WS 广播也会推送，按 data-id 幂等去重，先到先得）
    renderSingleMessage(data.message);
  } catch(e) { showToast('发送失败: ' + e.message, 'error'); }
  finally { sendBtn.textContent = '发送'; updateSendButtonState(); }
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
textInput.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (textInput.value.trim()) sendText(); } };
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
      // 在顶部插入新消息
      const fragment = document.createDocumentFragment();
      msgs.forEach(m => {
        const el = createMessageElement(m);
        if (el) fragment.appendChild(el);
      });
      messagesEl.insertBefore(fragment, messagesEl.firstChild);
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
  // 创建临时容器，避免直接操作 DOM
  const temp = document.createElement('div');
  temp.style.display = 'none';
  messagesEl.appendChild(temp);
  const oldAppend = messagesEl.appendChild.bind(messagesEl);
  // 临时替换 appendChild 以捕获元素
  messagesEl.appendChild = (el) => {
    temp.appendChild(el);
    return el;
  };
  const result = renderSingleMessage(m);
  messagesEl.appendChild = oldAppend;
  temp.remove();
  return result || null;
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
      await deleteMessage(fileId, uploadRoom);
    }
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
async function sendPlaceholderMessage(id, name, size, room) {
  const res = await fetch(API_ROOT + '/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room,type:'placeholder-file',id,name,size}) });
  const data = await safeJson(res);
  if (!res.ok || !data || !data.message) throw new Error('占位符发送失败');
  renderSingleMessage(data.message);
}
async function deleteMessage(id, room) {
  const el = messagesEl.querySelector('[data-id="'+id+'"]');
  if (el && currentRoom === room) el.remove();
  await fetch(API_ROOT + '/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({room,id}) });
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
  overlay.innerHTML = '<div class="imgViewerClose">✕</div><img class="imgViewerImg" src="' + url + '" alt="' + escapeHtml(name || '') + '" />';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = close;
  overlay.querySelector('.imgViewerClose').onclick = close;
  // ESC 关闭
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

// ============ 搜索和刷新 ============
let searchTimer = null;
searchInput.oninput = () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (!searchInput.value.trim()) {
      // 搜索框清空，自动恢复全部消息
      fetchMessages(true);
    } else {
      fetchMessages(true);
    }
  }, 300);
};
refreshBtn.onclick = () => fetchMessages(true);

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
initApp();
</script>
</body>
</html>
`;
