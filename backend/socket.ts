import { Server } from "socket.io";

export function setUpSockets(io: Server) {
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
