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
  isGuest?: boolean;
}

// Everyone currently in a canvas room, sent to the whole room (the joiner
// included) whenever someone joins or leaves. Usernames live on socket.data
// because fetchSockets() returns RemoteSockets, which don't carry .user.
async function broadcastPresence(io: Server, canvasId: string): Promise<void> {
  const sockets = await io.in(canvasId).fetchSockets();
  io.to(canvasId).emit(
    "presence",
    sockets.map((s) => ({ userId: s.id, username: s.data.username as string })),
  );
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
    let payload: JwtPayload | null = null;
    const cookieHeader = socket.handshake.headers.cookie;
    const token = cookieHeader ? parse(cookieHeader).token : undefined;
    if (token) {
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      } catch {
        // invalid token — treat as unauthenticated
      }
    }

    // A real account keeps its username everywhere, shared links included,
    // so the people list shows who it actually is.
    if (payload && !payload.isGuest) {
      socket.user = { id: payload.id, username: payload.username };
      return next();
    }

    // shared-link viewers without an account get a friendly guest name
    // instead of their "guest_xxxx" account name
    if (socket.handshake.auth?.guest) {
      const name = typeof socket.handshake.auth.guestName === "string" && socket.handshake.auth.guestName
        ? socket.handshake.auth.guestName
        : randomGuestName();
      socket.user = { id: socket.id, username: name };
      return next();
    }

    if (payload) {
      socket.user = { id: payload.id, username: payload.username };
      return next();
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
    socket.data.username = user.username;

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
          // switching canvases: drop out of the old room's people list
          if (currentCanvas && currentCanvas !== canvasId) {
            const previous = currentCanvas;
            socket.leave(previous);
            socket.to(previous).emit("cursor:leave", { userId: socket.id });
            broadcastPresence(io, previous).catch(() => {});
          }
          socket.join(canvasId);
          currentCanvas = canvasId;
          ack?.({ ok: true });
          // after the ack, so a failure here can't reach the catch below and ack twice
          broadcastPresence(io, canvasId).catch(() => {});
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

    // by "disconnect" Socket.IO has already removed this socket from its
    // rooms, so the list sent here no longer includes it
    socket.on("disconnect", () => {
      if (currentCanvas) {
        socket.to(currentCanvas).emit("cursor:leave", { userId: socket.id });
        broadcastPresence(io, currentCanvas).catch(() => {});
      }
    });
  });
}
