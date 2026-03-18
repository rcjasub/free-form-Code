require('dotenv').config()
const express = require('express')
const cors = require('cors')

const canvasRoutes = require('./routes/canvas')
const runRoutes = require('./routes/run')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/canvas', canvasRoutes)
app.use('/api/run', runRoutes)

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
