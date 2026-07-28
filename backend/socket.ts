import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import * as Canvas from "./models/canvas";
import {
  blockCreatedEventSchema,
  blockMovedEventSchema,
  blockUpdatedEventSchema,
  blockDeletedEventSchema,
  cursorMoveEventSchema,
} from "./schemas/socketEvents.schema";

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
    // io.use always runs before "connection" fires, so socket.user is set
    // by every path through the middleware above — but the type keeps it
    // optional, and that gap would otherwise force a non-null assertion at
    // every use site below. Guard once here and bind to a local const so
    // TypeScript can actually prove it's defined for the rest of this scope.
    if (!socket.user) {
      socket.disconnect(true);
      return;
    }
    const user = socket.user;

    let currentCanvas: string | null = null;

    socket.on(
      "canvas:join",
      async (canvasId, ack?: (result: { ok: boolean; error?: string }) => void) => {
        // Rooms are just Socket.IO's join() call — nothing stopped a socket
        // from joining any canvasId before this check, which meant anyone
        // could silently watch a private canvas's live cursors and block
        // events without ever touching the (now-guarded) REST routes.
        try {
          const canvas = await Canvas.getById(canvasId);
          if (!canvas) {
            ack?.({ ok: false, error: "Canvas not found" });
            return;
          }
          if (canvas.user_id !== user.id && !canvas.is_public) {
            ack?.({ ok: false, error: "Forbidden" });
            return;
          }
          socket.join(canvasId);
          currentCanvas = canvasId;
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: "Internal error" });
        }
      },
    );

    // Room targeting trusts currentCanvas (set by a successful canvas:join
    // above), not the canvasId argument the client sends per-event —
    // socket.to(room) doesn't require the sender to actually be in that
    // room, so trusting a client-supplied id here would let a socket skip
    // canvas:join entirely and broadcast straight into a canvas it was
    // never authorized to join.
    function inJoinedCanvas(canvasId: string): boolean {
      return currentCanvas !== null && canvasId === currentCanvas;
    }

    socket.on("block:created", (canvasId, block) => {
      if (!inJoinedCanvas(canvasId)) return;
      const parsed = blockCreatedEventSchema.safeParse(block);
      if (!parsed.success) return;
      socket.to(canvasId).emit("block:created", parsed.data);
    });

    socket.on("block:moved", (canvasId, data) => {
      if (!inJoinedCanvas(canvasId)) return;
      const parsed = blockMovedEventSchema.safeParse(data);
      if (!parsed.success) return;
      socket.to(canvasId).emit("block:moved", parsed.data);
    });

    socket.on("block:updated", (canvasId, data) => {
      if (!inJoinedCanvas(canvasId)) return;
      const parsed = blockUpdatedEventSchema.safeParse(data);
      if (!parsed.success) return;
      socket.to(canvasId).emit("block:updated", parsed.data);
    });

    socket.on("block:deleted", (canvasId, blockId) => {
      if (!inJoinedCanvas(canvasId)) return;
      const parsed = blockDeletedEventSchema.safeParse(blockId);
      if (!parsed.success) return;
      socket.to(canvasId).emit("block:deleted", parsed.data);
    });

    socket.on("cursor:move", (canvasId, data) => {
      if (!inJoinedCanvas(canvasId)) return;
      const parsed = cursorMoveEventSchema.safeParse(data);
      if (!parsed.success) return;
      socket.to(canvasId).emit("cursor:move", {
        userId: socket.id,
        username: user.username,
        x: parsed.data.x,
        y: parsed.data.y,
      });
    });

    socket.on("disconnect", () => {
      if (currentCanvas) {
        socket.to(currentCanvas).emit("cursor:leave", { userId: socket.id });
      }
    });
  });
}
