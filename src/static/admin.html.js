// 管理后台页面（独立于主站，内联 CSS+JS）
// 访问路径：/admin；密码来自 Cloudflare 控制台配置的 PASSWORD 变量
export const ADMIN_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>管理后台 - 逸陌聊天室</title>
<style>
/* 主题变量：跟随系统明暗（管理后台无切换按钮，自动跟随最合理） */
:root {
  color-scheme: light dark;
  --bg: #f0f2f5;
  --panel: #ffffff;
  --text: #1a1a2e;
  --muted: #667085;
  --accent: #4361ee;
  --accent-strong: #2c55d6;
  --danger: #d43b5f;
  --btn-text: #fff;
  --border: #e9ebf0;
  --input: #f5f6f8;
  --tag-bg: #e8edff;
  --tag-file-bg: #fde8ed;
  --hover: #f7f8fa;
  --shadow: 0 1px 3px rgba(0,0,0,0.08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1117;
    --panel: #1a1d28;
    --text: #e4e6eb;
    --muted: #6d768b; /* 与主站 .dark 保持一致 */
    --accent: #5b7bf9;
    --accent-strong: #4a68e8;
    --danger: #ff6b8a;
    --btn-text: #fff;
    --border: #2d3140;
    --input: #232733;
    --tag-bg: #1e2440;
    --tag-file-bg: #2a1520;
    --hover: #20242f;
    --shadow: 0 1px 4px rgba(0,0,0,0.35);
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  padding: 24px 16px 48px;
  -webkit-font-smoothing: antialiased;
}
h1 { font-size: 20px; margin-bottom: 16px; }
h2 { font-size: 16px; margin: 16px 0 8px; }
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 20px;
  max-width: 920px;
  margin: 0 auto 16px;
}
.login-box { text-align: center; padding: 40px 24px; max-width: 400px; margin-top: 8vh; }
.login-box h1 { font-size: 24px; }
.login-box input {
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  width: 100%;
  max-width: 280px;
  margin-bottom: 12px;
  outline: none;
  background: var(--input);
  color: var(--text);
}
.login-box input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(67,97,238,0.12); }
button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: var(--btn-text);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, opacity 0.15s, transform 0.1s;
}
button:hover { background: var(--accent-strong); }
button:active { transform: scale(0.97); }
button.secondary { background: var(--input); color: var(--text); border: 1px solid var(--border); }
button.secondary:hover { background: var(--border); }
button.danger { background: var(--danger); }
button.danger:hover { filter: brightness(0.92); }
button:disabled { opacity: 0.55; cursor: not-allowed; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#error { color: var(--danger); margin-top: 8px; font-size: 13px; min-height: 18px; }
#roomsWrap { overflow-x: auto; } /* 窄屏横向滚动，保留表格信息密度 */
table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 620px; }
th, td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 500; white-space: nowrap; }
tbody tr:hover { background: var(--hover); }
.room-actions button { margin-right: 6px; padding: 5px 10px; font-size: 12px; }
.msg-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.msg-content { flex: 1; word-break: break-word; white-space: pre-wrap; min-width: 0; }
.msg-meta { color: var(--muted); font-size: 12px; white-space: nowrap; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.msg-tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 5px;
  margin-right: 6px;
  background: var(--tag-bg);
  color: var(--accent);
  vertical-align: 1px;
}
.msg-tag.file { background: var(--tag-file-bg); color: var(--danger); }
.back-bar { margin-bottom: 12px; display: flex; gap: 8px; align-items: center; }
.muted { color: var(--muted); font-size: 12px; }
@media (max-width: 640px) {
  body { padding: 12px 8px 32px; }
  .card { padding: 14px; }
  .msg-item { flex-direction: column; gap: 6px; }
  .msg-meta { flex-direction: row; align-items: center; }
}
</style>
</head>
<body>
<div class="card login-box" id="loginBox">
  <h1>🔐 管理后台</h1>
  <p class="muted" style="margin-bottom:16px">输入管理密码（Cloudflare 控制台配置的 PASSWORD 变量）</p>
  <div><input type="password" id="pwd" placeholder="管理密码" autocomplete="off" aria-label="管理密码" /></div>
  <button id="loginBtn">进入</button>
  <div id="error" role="alert"></div>
</div>

<div class="card" id="panel" style="display:none">
  <div class="back-bar"><button id="logoutBtn" class="secondary">退出</button></div>
  <h1>📋 房间管理</h1>
  <div id="roomsWrap"><table id="roomsTable"></table></div>
  <div id="msgPanel" style="display:none">
    <div class="back-bar"><button id="msgBack" class="secondary">← 返回房间列表</button></div>
    <h2 id="msgTitle">消息</h2>
    <div id="msgList"></div>
  </div>
</div>

<script>
let adminHash = null; // sha256(密码)，仅存内存，刷新后需重新输入

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const $ = s => document.querySelector(s);
const errEl = $('#error');
function showErr(msg) { errEl.textContent = msg || ''; }

// HTML 转义：与主站 app.js.js 实现一致（& 必须第一个转，防二次转义）
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

// 操作中状态包装：禁用按钮 + 文案反馈，防重复点击
async function withBusy(btn, label, fn) {
  if (!btn) { await fn(); return; }
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = label;
  try { await fn(); }
  finally { btn.disabled = false; btn.textContent = old; }
}

async function api(path, opts = {}) {
  const headers = { 'X-Admin-Password': adminHash, ...(opts.headers || {}) };
  const res = await fetch('/api/admin' + path, { ...opts, headers });
  if (res.status === 401) { showErr('管理密码错误'); return null; }
  if (res.status === 503) { showErr('管理密码未配置（请在 Cloudflare 控制台设置 PASSWORD 变量）'); return null; }
  if (res.status === 429) { showErr('尝试过于频繁，请稍后再试'); return null; }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) { showErr((data && data.error) || '请求失败'); return null; }
  return data;
}

// ============ 登录 ============
async function doLogin() {
  const pwd = $('#pwd').value;
  if (!pwd) { showErr('请输入密码'); return; }
  showErr('');
  $('#loginBtn').disabled = true;
  adminHash = await sha256(pwd);
  const data = await api('/rooms');
  $('#loginBtn').disabled = false;
  if (data) { $('#pwd').value = ''; enterAdmin(data); }
}
$('#loginBtn').onclick = doLogin;
$('#pwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('#logoutBtn').onclick = () => {
  adminHash = null;
  $('#panel').style.display = 'none';
  $('#loginBox').style.display = '';
  showErr('');
};

// ============ 房间列表 ============
function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B','KB','MB','GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}
function fmtDate(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function enterAdmin(data) {
  $('#loginBox').style.display = 'none';
  $('#panel').style.display = '';
  renderRooms(data);
}
function renderRooms(data) {
  // admin API 对数组数据返回裸数组（okResponse 对 Array 直接返回），兼容两种结构
  const rooms = Array.isArray(data) ? data : ((data && data.data) || []);
  const t = $('#roomsTable');
  if (!rooms.length) { t.innerHTML = '<tr><td class="muted">暂无房间</td></tr>'; return; }
  t.innerHTML = '<tr><th>房间</th><th>密码</th><th>消息</th><th>文件</th><th>大小</th><th>创建</th><th>操作</th></tr>' +
    rooms.map(r => '<tr>' +
      '<td>' + escapeHtml(r.name) + '</td>' +
      '<td>' + (r.hasPassword ? '🔒' : '—') + '</td>' +
      '<td>' + r.msgCount + '</td>' +
      '<td>' + r.fileCount + '</td>' +
      '<td>' + fmtBytes(r.fileBytes) + '</td>' +
      '<td>' + fmtDate(r.createdAt) + '</td>' +
      '<td class="room-actions">' +
        '<button data-act="view" data-room="' + escapeHtml(r.name) + '">查看消息</button>' +
        (r.name !== 'default' ? '<button data-act="del" class="danger" data-room="' + escapeHtml(r.name) + '">删除房间</button>' : '') +
      '</td></tr>'
    ).join('');
  t.querySelectorAll('button[data-act]').forEach(btn => {
    btn.onclick = () => {
      const room = btn.dataset.room;
      if (btn.dataset.act === 'view') withBusy(btn, '加载中...', () => loadMessages(room));
      else if (confirm('确定删除房间 "' + room + '" 吗？所有消息与文件将被永久删除。')) withBusy(btn, '删除中...', () => delRoom(room));
    };
  });
}

async function refreshRooms() {
  const data = await api('/rooms');
  if (data) renderRooms(data);
}

async function delRoom(room) {
  const data = await api('/room/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room })
  });
  if (data) { showErr(''); await refreshRooms(); }
}

// ============ 消息查看 ============
let viewingRoom = null;
async function loadMessages(room) {
  const data = await api('/messages?room=' + encodeURIComponent(room) + '&limit=50');
  if (!data) return;
  viewingRoom = room;
  $('#msgTitle').textContent = '消息 - ' + room;
  const msgs = Array.isArray(data) ? data : ((data && data.data) || []);
  const list = $('#msgList');
  list.innerHTML = msgs.length ? msgs.map(m => {
    const tag = m.type === 'image-ref' ? '<span class="msg-tag">🖼️ 图片</span>'
      : m.type === 'file-ref' ? '<span class="msg-tag file">📄 文件</span>'
      : m.type === 'placeholder-file' ? '<span class="msg-tag file">⬆️ 上传中</span>' : '';
    const content = m.type === 'text' ? escapeHtml(m.content) : escapeHtml(m.file_name || m.file_id || '');
    return '<div class="msg-item"><div class="msg-content">' + tag + content + '</div>' +
      '<div class="msg-meta">' + new Date(m.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) +
      ' <button class="danger" data-id="' + m.id + '">删除</button></div></div>';
  }).join('') : '<div class="muted">暂无消息</div>';
  list.querySelectorAll('button[data-id]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('确定删除这条消息吗？')) return;
      await withBusy(btn, '删除中...', async () => {
        const data = await api('/message/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: viewingRoom, id: btn.dataset.id })
        });
        if (data) { showErr(''); loadMessages(viewingRoom); }
      });
    };
  });
  $('#roomsWrap').style.display = 'none';
  $('#msgPanel').style.display = '';
}
$('#msgBack').onclick = () => {
  $('#msgPanel').style.display = 'none';
  $('#roomsWrap').style.display = '';
  refreshRooms();
};
</script>
</body>
</html>
`;
