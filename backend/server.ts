import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import canvasRoutes from './routes/canvas'
import blockRoutes from './routes/blocks'
import runRoutes from './routes/run'
import authRoutes from './routes/auth'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/canvases', canvasRoutes)
app.use('/api/canvases/:id/blocks', blockRoutes)
app.use('/api/run', runRoutes)


app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
