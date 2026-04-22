import { createServer } from "http";
import { Server } from "socket.io";
import ioc from "socket.io-client";
import type { Socket } from "socket.io-client";
import { setUpSockets } from "../socket";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";
const testToken = jwt.sign({ id: "user-1", username: "testuser" }, "test-secret");
const authCookie = `token=${testToken}`;

let httpServer: ReturnType<typeof createServer>;
let serverSocket: Server;
let clientA: ReturnType<typeof ioc>;
let clientB: ReturnType<typeof ioc>;

function bothJoined(canvasId: string, cb: () => void) {
  let count = 0;
  const ack = () => { if (++count === 2) cb(); };
  clientA.emit("canvas:join", canvasId, ack);
  clientB.emit("canvas:join", canvasId, ack);
}

beforeEach((done) => {
  httpServer = createServer();
  serverSocket = new Server(httpServer);
  setUpSockets(serverSocket);

  httpServer.listen(() => {
    const port = (httpServer.address() as any).port;

    clientA = ioc(`http://localhost:${port}`, { extraHeaders: { cookie: authCookie } });
    clientB = ioc(`http://localhost:${port}`, { extraHeaders: { cookie: authCookie } });

    let connected = 0;
    const onConnect = () => { if (++connected === 2) done(); };
    clientA.on("connect", onConnect);
    clientB.on("connect", onConnect);
  });
});

afterEach((done) => {
  clientA.disconnect();
  clientB.disconnect();
  serverSocket.close();
  httpServer.close(() => done());
});

describe("socket events", () => {
  test("block:created is received by clientB when clientA emits it", (done) => {
    const canvasId = "canvas-1";
    const block = { id: "block-1", type: "code" };

    clientB.on("block:created", (receivedBlock: any) => {
      expect(receivedBlock).toEqual(block);
      done();
    });

    bothJoined(canvasId, () => {
      clientA.emit("block:created", canvasId, block);
    });
  });

  test("block:moved is received by clientB when clientA emits it", (done) => {
    const canvasId = "canvas-1";
    const block = { id: "block-1", x: 100, y: 200 };

    clientB.on("block:moved", (receivedBlock: any) => {
      expect(receivedBlock).toEqual(block);
      done();
    });

    bothJoined(canvasId, () => {
      clientA.emit("block:moved", canvasId, block);
    });
  });

  test("block:updated is received by clientB when clientA emits it", (done) => {
    const canvasId = "canvas-1";
    const block = { id: "block-1", content: "hello" };

    clientB.on("block:updated", (receivedBlock: any) => {
      expect(receivedBlock).toEqual(block);
      done();
    });

    bothJoined(canvasId, () => {
      clientA.emit("block:updated", canvasId, block);
    });
  });

  test("block:deleted is received by clientB when clientA emits it", (done) => {
    const canvasId = "canvas-1";
    const blockId = "block-1";

    clientB.on("block:deleted", (receivedId: any) => {
      expect(receivedId).toEqual(blockId);
      done();
    });

    bothJoined(canvasId, () => {
      clientA.emit("block:deleted", canvasId, blockId);
    });
  });

  test("block:created sender does not receive their own event", (done) => {
    const canvasId = "canvas-1";
    const block = { id: "block-1", type: "code" };
    let clientAReceived = false;

    clientA.on("block:created", () => { clientAReceived = true; });

    bothJoined(canvasId, () => {
      clientA.emit("block:created", canvasId, block);
      setTimeout(() => {
        expect(clientAReceived).toBe(false);
        done();
      }, 100);
    });
  });
});
