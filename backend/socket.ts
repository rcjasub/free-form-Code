import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { parse } from "cookie";

export function setUpSockets(io: Server) {
  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) return next(new Error("Authentication required"));
    const token = parse(cookieHeader).token;
    if (!token) return next(new Error("Authentication required"));
    try {
      jwt.verify(token, process.env.JWT_SECRET!);
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {

    socket.on("canvas:join", (canvasId) => {
      socket.join(canvasId);
    });

    socket.on("block:created", (canvasId, block) => {
      socket.to(canvasId).emit("block:created", block);
    });

    socket.on("block:moved", (canvasId, data) => {
      socket.to(canvasId).emit("block:moved", data);
    });

    socket.on("block:updated", (canvasId, data) => {
      socket.to(canvasId).emit("block:updated", data);
    });

    socket.on("block:deleted", (canvasId, blockId) => {
      socket.to(canvasId).emit("block:deleted", blockId);
    });
  });
}
