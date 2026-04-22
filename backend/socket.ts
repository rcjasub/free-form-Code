import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { parse } from "cookie";

interface JwtPayload {
  id: string;
  username: string;
}

interface SocketWithUser extends Socket {
  user?: { id: string; username: string };
}

const ADJECTIVES = ["Swift", "Lazy", "Brave", "Clever", "Sneaky", "Wild", "Tiny", "Cosmic", "Fuzzy", "Chill", "Speedy", "Bold", "Mystic", "Quiet", "Zesty"];
const ANIMALS = ["Fox", "Panda", "Otter", "Wolf", "Owl", "Bear", "Tiger", "Rabbit", "Deer", "Lynx", "Raven", "Hawk", "Seal", "Crow", "Frog"];

function randomGuestName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj}${animal}`;
}

export function setUpSockets(io: Server) {
  io.use((socket: SocketWithUser, next) => {
    // shared-link viewers always get a random guest identity
    if (socket.handshake.auth?.guest) {
      const name = typeof socket.handshake.auth.guestName === "string" && socket.handshake.auth.guestName
        ? socket.handshake.auth.guestName
        : randomGuestName();
      socket.user = { id: socket.id, username: name };
      return next();
    }

    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const token = parse(cookieHeader).token;
      if (token) {
        try {
          const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
          socket.user = { id: payload.id, username: payload.username };
          return next();
        } catch {
          // invalid token — fall through to guest
        }
      }
    }
    // unauthenticated: give them a guest identity
    socket.user = { id: socket.id, username: randomGuestName() };
    next();
  });

  io.on("connection", (socket: SocketWithUser) => {
    let currentCanvas: string | null = null;

    socket.on("canvas:join", (canvasId, ack?: () => void) => {
      socket.join(canvasId);
      currentCanvas = canvasId;
      if (typeof ack === "function") ack();
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
        userId: socket.id,
        username: socket.user!.username,
        x,
        y,
      });
    });

    socket.on("disconnect", () => {
      if (currentCanvas) {
        socket.to(currentCanvas).emit("cursor:leave", { userId: socket.id });
      }
    });
  });
}
