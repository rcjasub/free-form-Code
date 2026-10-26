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
import { startGuestCleanup } from "./cleanup";
import { runMigrations } from "./db/migrate";

import canvasRoutes from "./routes/canvas";
import blockRoutes from "./routes/blocks";
import runRoutes from "./routes/run";
import authRoutes from "./routes/auth";

const app = express();
const PORT = process.env.PORT || 3001;

// Two proxies sit in front of this server in production: Caddy (HTTPS) then
// nginx. Caddy replaces any X-Forwarded-For the visitor sends with their real
// IP, and nginx appends Caddy's address, so the header reads "visitor, caddy".
// Trusting 2 hops makes req.ip the visitor — what the rate limiters key on.
// Remove a proxy and this must drop to match, or req.ip becomes spoofable.
app.set("trust proxy", 2);
app.use(helmet());
const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
];
app.use(cors({ origin: allowedOrigins, credentials: true }));
// Pasted images are saved inside the block (as a data URL), so block
// requests get a bigger body limit than the default 100kb everything else keeps.
// Registered first: express.json skips bodies that are already parsed.
app.use("/api/canvases/:id/blocks", express.json({ limit: "3mb" }));
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
  // block:created carries a pasted image's data URL, which can pass the 1MB default
  maxHttpBufferSize: 3e6,
});

// register all socket event handlers
setUpSockets(io);

// start the BullMQ worker — passes io so it can emit results back to clients
startWorker(io);

// daily deletion of idle guests (cleanup.ts)
startGuestCleanup().catch((err) => console.error("[cleanup] could not schedule:", err));

// update the database schema, then start the http server (not app.listen —
// socket.io needs control of the server). A failed update stops the server:
// running against an outdated schema would fail on the first save instead.
runMigrations()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[db] schema update failed, not starting:", err);
    process.exit(1);
  });
