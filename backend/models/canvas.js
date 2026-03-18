const pool = require('../db')

async function create({ user_id, name, share_id, is_public }) {
  const result = await pool.query(
    `INSERT INTO canvases (user_id, name, share_id, is_public)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [user_id, name, share_id, is_public]
  )
  return result.rows[0]
}

module.exports = { create }
