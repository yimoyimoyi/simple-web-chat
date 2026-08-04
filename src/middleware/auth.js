// 认证中间件
// 用于验证房间密码

/**
 * 验证房间密码
 * @param {Object} env - Cloudflare Worker 环境
 * @param {string} room - 房间名
 * @param {string} passwordHash - 密码哈希（可选）
 * @returns {Promise<boolean>} - 验证通过返回 true
 */
export async function verifyRoomPassword(env, room, passwordHash) {
  const roomInfo = await env.DB.prepare(
    `SELECT password_hash FROM rooms WHERE name = ?`
  ).bind(room).first();

  if (!roomInfo) {
    throw new Error('房间不存在');
  }

  // 如果房间有密码，验证密码
  if (roomInfo.password_hash) {
    if (!passwordHash || roomInfo.password_hash !== passwordHash) {
      throw new Error('密码错误');
    }
  }

  return true;
}
