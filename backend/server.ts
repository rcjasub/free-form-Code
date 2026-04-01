import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import canvasRoutes from "./routes/canvas";
import blockRoutes from "./routes/blocks";
import runRoutes from "./routes/run";
import authRoutes from "./routes/auth";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/canvases", canvasRoutes);
app.use("/api/canvases/:id/blocks", blockRoutes);
app.use("/api/run", runRoutes);

// create the http server manually so socket.io and express can share the same port
const httpServer = createServer(app)

// attach socket.io to the http server
const io = new Server(httpServer, { cors: { origin: '*' } })

// runs every time a new user opens a websocket connection
io.on('connection', (socket) => {

  // user joins a room named by canvasId — only users in the same room get each other's events
  socket.on('canvas:join', (canvasId) => {
    socket.join(canvasId)
  })

  // socket.to(canvasId) = broadcast to everyone in the room EXCEPT the sender
  socket.on('block:created', (canvasId, block) => {
    socket.to(canvasId).emit('block:created', block)
  })

  socket.on('block:moved', (canvasId, data) => {
    socket.to(canvasId).emit('block:moved', data)
  })

  socket.on('block:updated', (canvasId, data) => {
    socket.to(canvasId).emit('block:updated', data)
  })

  socket.on('block:deleted', (canvasId, blockId) => {
    socket.to(canvasId).emit('block:deleted', blockId)
  })
})

// start the http server (not app.listen — socket.io needs control of the server)
httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})