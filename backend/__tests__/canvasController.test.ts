import { getCanvasById, createCanva, getCanvasByShareId } from "../controllers/canvasController";

import * as Canvas from "../models/canvas";

jest.mock("../models/canvas");
const mockCanvas = Canvas as jest.Mocked<typeof Canvas>;

describe("getCanvasById", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1" }, user: { id: "user-1" } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  test("returns 200 and canvas when found", async () => {
    const fakeCanvas = {
      id: "1",
      name: "My Canvas",
      user_id: "user-1",
      share_id: "abc123",
      is_public: false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockCanvas.getById.mockResolvedValue(fakeCanvas);

    await getCanvasById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fakeCanvas);
  });

  test("returns 404 and canvas not found", async () => {
    mockCanvas.getById.mockResolvedValue(null);

    await getCanvasById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Canvas not found" });
  });

  test("returns 500 on database error", async () => {
    mockCanvas.getById.mockRejectedValue(new Error("db error"));

    await getCanvasById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "db error" });
  });
});

describe("createCanva", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = {
      params: { id: "1" },
      user: { id: "user-1" },
      body: { name: "My Canvas", is_public: false },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  test("returns 201 and creates a canva", async () => {
    const fakeCanvas = {
      id: "1",
      user_id: "2",
      name: "My new Canvas",
      share_id: "abc123",
      is_public: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockCanvas.create.mockResolvedValue(fakeCanvas);
    await createCanva(req, res);

    expect(res.status).toHaveBeenLastCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(fakeCanvas);
  });

  test("retunrs 500 on database error", async () => {
    mockCanvas.getById.mockRejectedValue(new Error("db error"));

    await getCanvasById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "db error" });
  });
});

describe("getCanvasByShareId", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = { params: { id: "1" } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  test("returns 200 and canvas when found", async () => {
    const fakeCanvas = {
      id: "1",
      user_id: "2",
      name: "My new Canvas",
      share_id: "abc123",
      is_public: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockCanvas.getCanvasByShareId.mockResolvedValue(fakeCanvas);

    await getCanvasByShareId(req, res);

    expect(res.status).toHaveBeenLastCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fakeCanvas);
  });


  test("returns 404 when shared canvas not found", async () => {
    mockCanvas.getCanvasByShareId.mockResolvedValue(null);

    await getCanvasByShareId(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Shared Canvas not found" });
  })

  test("retunrs 500 on database error", async () => {
    mockCanvas.getCanvasByShareId.mockRejectedValue(new Error("db error"));

    await getCanvasByShareId(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "db error" });
  });

});
