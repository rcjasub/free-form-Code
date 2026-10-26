import { runGuestCleanup } from "../cleanup";
import { deleteInactiveGuests } from "../models/users";
import { cacheDel } from "../redis";

jest.mock("bullmq");
jest.mock("../models/users");
jest.mock("../redis", () => ({ bullConnection: {}, cacheDel: jest.fn() }));

const mockDelete = deleteInactiveGuests as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("runGuestCleanup", () => {
  test("deletes guests idle for 15 days and clears their canvases' cached blocks", async () => {
    mockDelete.mockResolvedValue(["c1", "c2"]);

    await expect(runGuestCleanup()).resolves.toBe(2);

    expect(mockDelete).toHaveBeenCalledWith(15);
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:c1");
    expect(mockCacheDel).toHaveBeenCalledWith("blocks:c2");
  });

  test("does nothing else when no guest is idle", async () => {
    mockDelete.mockResolvedValue([]);

    await expect(runGuestCleanup()).resolves.toBe(0);

    expect(mockCacheDel).not.toHaveBeenCalled();
  });
});
