import { createServer } from "http";
import { Server } from "socket.io";
import ioc from "socket.io-client";
import type { Socket } from "socket.io-client";
import { setUpSockets } from "../socket";

let httpServer: ReturnType<typeof createServer>;
let serverSocket: Server;
let clientA: Socket;
let clientB: Socket;

beforeEach((done) => {
  httpServer = createServer();
  serverSocket = new Server(httpServer);
  setUpSockets(serverSocket);

  httpServer.listen(() => {
    const port = (httpServer.address() as any).port;

    clientA = ioc(`http://localhost:${port}`);
    clientB = ioc(`http://localhost:${port}`);

    let connected = 0;
    const onConnect = () => {
      connected++;
      if (connected == 2) done();
    };

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

    clientB.emit("canvas:join", canvasId);
    clientA.emit("canvas:join", canvasId);

    clientB.on("block:created", (receivedBlock: any) => {
      expect(receivedBlock).toEqual(block);
      done();
    });

    setTimeout(() => {
      clientA.emit("block:created", canvasId, block);
    }, 50);
  });
});
