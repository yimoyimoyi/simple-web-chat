// ID 生成工具

// 生成 UUID
export function generateId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (e) {
    // 降级方案
  }
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}
