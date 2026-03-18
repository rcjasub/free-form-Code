const express = require('express')
const router = express.Router()
const { createCanvas } = require('../controllers/canvasController')

router.post('/', createCanvas)

module.exports = router
