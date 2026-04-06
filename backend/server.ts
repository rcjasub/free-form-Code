import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { setUpSockets } from "./socket";

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
const httpServer = createServer(app);

// attach socket.io to the http server
const io = new Server(httpServer, { cors: { origin: "*" } });

// register all socket event handlersn
setUpSockets(io);

// start the http server (not app.listen — socket.io needs control of the server)
httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
