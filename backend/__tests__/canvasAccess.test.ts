import { requireCanvasAccess } from "../middleware/canvasAccess";
import * as Canvas from "../models/canvas";

jest.mock("../models/canvas");
const mockCanvas = Canvas as jest.Mocked<typeof Canvas>;

describe("requireCanvasAccess", () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = { params: { id: "canvas-1" }, user: { id: "user-1" } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  test("calls next when the requester owns the canvas", async () => {
    mockCanvas.getById.mockResolvedValue({
      id: "canvas-1",
      user_id: "user-1",
      name: "Mine",
      share_id: "abc",
      is_public: false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await requireCanvasAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("calls next when the canvas is public, regardless of owner", async () => {
    mockCanvas.getById.mockResolvedValue({
      id: "canvas-1",
      user_id: "someone-else",
      name: "Public canvas",
      share_id: "abc",
      is_public: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await requireCanvasAccess(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test("returns 403 when a non-owner requests a private canvas", async () => {
    mockCanvas.getById.mockResolvedValue({
      id: "canvas-1",
      user_id: "someone-else",
      name: "Private canvas",
      share_id: "abc",
      is_public: false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await requireCanvasAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
  });

  test("returns 404 when the canvas doesn't exist", async () => {
    mockCanvas.getById.mockResolvedValue(null);

    await requireCanvasAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("returns 500 on database error instead of hanging", async () => {
    mockCanvas.getById.mockRejectedValue(new Error("db error"));

    await requireCanvasAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });
});
