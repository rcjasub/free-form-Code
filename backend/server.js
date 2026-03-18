require('dotenv').config()
const express = require('express')
const cors = require('cors')

const snippetRoutes = require('./routes/snippets')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/snippets', snippetRoutes)

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
