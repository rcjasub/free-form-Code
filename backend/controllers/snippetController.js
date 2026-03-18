const Snippet = require('../models/snippet')

async function getAll(req, res) {
  try {
    const snippets = await Snippet.findAll()
    res.json(snippets)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

async function getOne(req, res) {
  try {
    const snippet = await Snippet.findById(req.params.id)
    if (!snippet) return res.status(404).json({ error: 'Not found' })
    res.json(snippet)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

async function create(req, res) {
  try {
    const snippet = await Snippet.create(req.body)
    res.status(201).json(snippet)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

async function update(req, res) {
  try {
    const snippet = await Snippet.update(req.params.id, req.body)
    if (!snippet) return res.status(404).json({ error: 'Not found' })
    res.json(snippet)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

async function remove(req, res) {
  try {
    await Snippet.delete(req.params.id)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, getOne, create, update, remove }
