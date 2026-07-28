import "dotenv/config";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET environment variable must be set");

import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";
import { setUpSockets } from "./socket";
import { startWorker } from "./worker";

import canvasRoutes from "./routes/canvas";
import blockRoutes from "./routes/blocks";
import runRoutes from "./routes/run";
import authRoutes from "./routes/auth";

const app = express();
const PORT = process.env.PORT || 3001;

app.set("trust proxy", 1);
app.use(helmet());
const allowedOrigins = [
  "http://localhost:5173",
  "https://free-form-code-production.up.railway.app",
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/canvases", canvasRoutes);
app.use("/api/canvases/:id/blocks", blockRoutes);
app.use("/api/run", runRoutes);

// create the http server manually so socket.io and express can share the same port
const httpServer = createServer(app);

// attach socket.io to the http server
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
});

// register all socket event handlers
setUpSockets(io);

// start the BullMQ worker — passes io so it can emit results back to clients
startWorker(io);

// start the http server (not app.listen — socket.io needs control of the server)
httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
