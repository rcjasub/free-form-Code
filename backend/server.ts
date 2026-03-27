import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import canvasRoutes from './routes/canvas'
import runRoutes from './routes/run'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/canvas', canvasRoutes)
app.use('/api/run', runRoutes)

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
