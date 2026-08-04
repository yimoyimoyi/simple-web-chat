-- 逸陌聊天室数据库表结构

-- 房间表
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  password_hash TEXT,                    -- 房间密码哈希（可选）
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  type TEXT NOT NULL,                    -- 'text' | 'image-ref' | 'file-ref'
  content TEXT,                          -- 文本内容
  file_id TEXT,                          -- 文件 ID（file-ref/image-ref）
  file_name TEXT,                        -- 文件名
  file_size INTEGER,                     -- 文件大小
  file_type TEXT,                        -- MIME 类型
  total_chunks INTEGER,                  -- 分块数
  timestamp INTEGER NOT NULL,
  edited_at INTEGER,                     -- 编辑时间戳（NULL 表示未编辑）
  FOREIGN KEY (room) REFERENCES rooms(name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, timestamp);

-- 全文搜索虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  file_name,
  content='messages',
  content_rowid='rowid'
);

-- 触发器：自动同步搜索索引
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, file_name)
  VALUES (new.rowid, new.content, new.file_name);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, file_name)
  VALUES ('delete', old.rowid, old.content, old.file_name);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, file_name)
  VALUES ('delete', old.rowid, old.content, old.file_name);
  INSERT INTO messages_fts(rowid, content, file_name)
  VALUES (new.rowid, new.content, new.file_name);
END;

-- 文件元数据表
CREATE TABLE IF NOT EXISTS file_meta (
  file_id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_meta_room ON file_meta(room);

-- 频率限制表（降级方案，主要使用 KV）
CREATE TABLE IF NOT EXISTS rate_limit (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

-- 插入默认房间
INSERT OR IGNORE INTO rooms (name) VALUES ('default');
