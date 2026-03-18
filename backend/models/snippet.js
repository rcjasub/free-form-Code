const pool = require('../db')

const Snippet = {
  async findAll() {
    const result = await pool.query('SELECT * FROM snippets ORDER BY created_at DESC')
    return result.rows
  },

  async findById(id) {
    const result = await pool.query('SELECT * FROM snippets WHERE id = $1', [id])
    return result.rows[0]
  },

  async create({ title, code, language }) {
    const result = await pool.query(
      'INSERT INTO snippets (title, code, language) VALUES ($1, $2, $3) RETURNING *',
      [title, code, language]
    )
    return result.rows[0]
  },

  async update(id, { title, code, language }) {
    const result = await pool.query(
      'UPDATE snippets SET title = $1, code = $2, language = $3 WHERE id = $4 RETURNING *',
      [title, code, language, id]
    )
    return result.rows[0]
  },

  async delete(id) {
    await pool.query('DELETE FROM snippets WHERE id = $1', [id])
  },
}

module.exports = Snippet
