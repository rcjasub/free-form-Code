import { createServer } from "http";
import { Server } from "socket.io";
import ioc from "socket.io-client";
import type { Socket } from "socket.io-client";
import { setUpSockets } from "../socket";
import jwt from "jsonwebtoken";
import * as Canvas from "../models/canvas";

jest.mock("../models/canvas");
const mockCanvas = Canvas as jest.Mocked<typeof Canvas>;

process.env.JWT_SECRET = "test-secret";
const testToken = jwt.sign({ id: "user-1", username: "testuser" }, "test-secret");
const authCookie = `token=${testToken}`;

const ownedCanvas = {
  id: "canvas-1",
  user_id: "user-1",
  name: "Test canvas",
  share_id: "share-1",
  is_public: false,
  created_at: new Date(),
  updated_at: new Date(),
};

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
  mockCanvas.getById.mockResolvedValue(ownedCanvas);

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
    const block = { id: "block-1", type: "code", x: 100, y: 100, content: "" };

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
    const block = { id: "block-1", type: "code", x: 100, y: 100, content: "" };
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

describe("presence", () => {
  type Person = { userId: string; username: string };

  test("everyone in the room gets the full list when someone joins", (done) => {
    clientA.emit("canvas:join", "canvas-1", () => {
      clientA.on("presence", (people: Person[]) => {
        if (people.length < 2) return;
        expect(people.map((p) => p.userId).sort()).toEqual([clientA.id, clientB.id].sort());
        expect(people.every((p) => p.username === "testuser")).toBe(true);
        done();
      });
      clientB.emit("canvas:join", "canvas-1");
    });
  });

  test("the list drops a person when they disconnect", (done) => {
    bothJoined("canvas-1", () => {
      // wait out the join broadcasts so only the post-disconnect list counts
      setTimeout(() => {
        clientA.on("presence", (people: Person[]) => {
          expect(people.map((p) => p.userId)).toEqual([clientA.id]);
          done();
        });
        clientB.disconnect();
      }, 50);
    });
  });

  test("a logged-in account keeps its username on a shared link", (done) => {
    clientB.disconnect();
    const port = (httpServer.address() as any).port;
    const shared = ioc(`http://localhost:${port}`, {
      extraHeaders: { cookie: authCookie },
      auth: { guest: true, guestName: "SwiftFox" },
    });
    shared.emit("canvas:join", "canvas-1", () => {});
    shared.on("presence", (people: Person[]) => {
      expect(people.find((p) => p.userId === shared.id)?.username).toBe("testuser");
      shared.disconnect();
      done();
    });
  });

  test("a guest on a shared link shows up under their guest name", (done) => {
    clientB.disconnect();
    const port = (httpServer.address() as any).port;
    const guestToken = jwt.sign({ id: "guest-1", username: "guest_abc", isGuest: true }, "test-secret");
    const shared = ioc(`http://localhost:${port}`, {
      extraHeaders: { cookie: `token=${guestToken}` },
      auth: { guest: true, guestName: "SwiftFox" },
    });
    // a public canvas, since the guest doesn't own it
    mockCanvas.getById.mockResolvedValue({ ...ownedCanvas, is_public: true });
    shared.emit("canvas:join", "canvas-1", () => {});
    shared.on("presence", (people: Person[]) => {
      expect(people.find((p) => p.userId === shared.id)?.username).toBe("SwiftFox");
      shared.disconnect();
      done();
    });
  });
});

describe("canvas:join authorization", () => {
  test("acks ok:true and receives room broadcasts when the socket owns the canvas", (done) => {
    clientA.emit("canvas:join", "canvas-1", (result: { ok: boolean }) => {
      expect(result.ok).toBe(true);
      done();
    });
  });

  test("acks ok:false and does not join the room for someone else's private canvas", (done) => {
    // Only clientA's join (the first getById call) sees the "not mine"
    // canvas; clientB's join right after falls back to the beforeEach
    // default (ownedCanvas) and should succeed normally.
    mockCanvas.getById.mockResolvedValueOnce({
      id: "canvas-1",
      user_id: "someone-else",
      name: "Not yours",
      share_id: "share-1",
      is_public: false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    let clientAReceived = false;
    clientA.on("block:created", () => { clientAReceived = true; });

    clientA.emit("canvas:join", "canvas-1", (joinResult: { ok: boolean; error?: string }) => {
      expect(joinResult.ok).toBe(false);
      expect(joinResult.error).toBe("Forbidden");

      // clientB legitimately joins the same room id and broadcasts;
      // clientA never actually joined (rejected above), so it must not
      // receive this even though it asked for the same canvasId.
      clientB.emit("canvas:join", "canvas-1", () => {
        clientB.emit("block:created", "canvas-1", { id: "block-1", x: 0, y: 0, content: "" });
        setTimeout(() => {
          expect(clientAReceived).toBe(false);
          done();
        }, 100);
      });
    });
  });

  test("rejected joins don't show up in the room's presence list", (done) => {
    mockCanvas.getById.mockResolvedValueOnce({ ...ownedCanvas, user_id: "someone-else" });

    clientA.emit("canvas:join", "canvas-1", () => {
      clientB.on("presence", (people: { userId: string }[]) => {
        expect(people.map((p) => p.userId)).toEqual([clientB.id]);
        done();
      });
      clientB.emit("canvas:join", "canvas-1");
    });
  });

  test("acks ok:false when the canvas doesn't exist", (done) => {
    mockCanvas.getById.mockResolvedValue(null);

    clientA.emit("canvas:join", "canvas-1", (result: { ok: boolean; error?: string }) => {
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Canvas not found");
      done();
    });
  });
});
