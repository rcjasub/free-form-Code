const Canvas = require('../models/canvas')
const crypto = require('crypto')

function generateShareId(length = 12) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length)
}

async function createCanvas(req, res) {
  const { user_id, name = 'Untitled', is_public = false } = req.body

  if (!user_id) return res.status(400).json({ error: 'user_id is required' })

  try {
    const share_id = generateShareId()
    const canvas = await Canvas.create({ user_id, name, share_id, is_public })
    res.status(201).json(canvas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}



module.exports = { createCanvas }
