import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { parse } from "cookie";

interface JwtPayload {
  id: string;
  username: string;
}

interface SocketWithUser extends Socket {
  user?: JwtPayload;
}

export function setUpSockets(io: Server) {
  io.use((socket: SocketWithUser, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) return next(new Error("Authentication required"));
    const token = parse(cookieHeader).token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      socket.user = payload;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: SocketWithUser) => {
    let currentCanvas: string | null = null;

    socket.on("canvas:join", (canvasId) => {
      socket.join(canvasId);
      currentCanvas = canvasId;
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

    socket.on("cursor:move", (canvasId, { x, y }) => {
      socket.to(canvasId).emit("cursor:move", {
        userId: socket.user!.id,
        username: socket.user!.username,
        x,
        y,
      });
    });

    socket.on("disconnect", () => {
      if (currentCanvas) {
        socket.to(currentCanvas).emit("cursor:leave", { userId: socket.user!.id });
      }
    });
  });
}
