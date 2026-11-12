import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { deleteAccountSchema } from "../schemas/user.schema";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

jest.mock("../models/users");
jest.mock("../redis", () => {
  const mock = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
  };
  return { __esModule: true, default: mock, ...mock, cacheDel: jest.fn().mockResolvedValue(undefined) };
});

import * as Users from "../models/users";
import { cacheDel } from "../redis";
import { deleteAccount, me } from "../controllers/usersController";

const mockUsers = Users as jest.Mocked<typeof Users>;
const mockCacheDel = cacheDel as jest.MockedFunction<typeof cacheDel>;

function fakeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    clearCookie: jest.fn(),
  } as any;
}

// made up fresh every run: no password lives in the repo
const PASSWORD = randomBytes(12).toString("hex");
let account: Users.User;

beforeAll(async () => {
  account = {
    id: "user-1",
    username: "ada",
    email: "ada@example.com",
    password_hash: await bcrypt.hash(PASSWORD, 4),
    is_guest: false,
    created_at: "",
    last_active_at: "",
  };
});

beforeEach(() => jest.clearAllMocks());

describe("deleteAccount", () => {
  const req = (password: string) => ({ user: { id: "user-1", username: "ada" }, body: { password } }) as any;

  test("deletes the account, clears its cached canvases and signs it out", async () => {
    mockUsers.findUserById.mockResolvedValue(account);
    mockUsers.deleteUser.mockResolvedValue([
      { id: "c1", share_id: "s1" },
      { id: "c2", share_id: "s2" },
    ]);
    const res = fakeRes();

    await deleteAccount(req(PASSWORD), res);

    expect(mockUsers.deleteUser).toHaveBeenCalledWith("user-1");
    expect(mockCacheDel.mock.calls.map((c) => c[0]).sort()).toEqual(
      ["blocks:c1", "blocks:c2", "canvas:c1", "canvas:c2", "share:s1", "share:s2"],
    );
    expect(res.clearCookie).toHaveBeenCalledWith("token");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "Account deleted", canvasesDeleted: 2 });
  });

  test("refuses a wrong password and deletes nothing", async () => {
    mockUsers.findUserById.mockResolvedValue(account);
    const res = fakeRes();

    await deleteAccount(req(`${PASSWORD}-wrong`), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUsers.deleteUser).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  test("refuses guests, who have no password (their accounts are cleaned up on their own)", async () => {
    mockUsers.findUserById.mockResolvedValue({ ...account, is_guest: true, email: null, password_hash: null });
    const res = fakeRes();

    await deleteAccount(req(PASSWORD), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockUsers.deleteUser).not.toHaveBeenCalled();
  });

  test("signs out an account that's already gone", async () => {
    mockUsers.findUserById.mockResolvedValue(null);
    const res = fakeRes();

    await deleteAccount(req(PASSWORD), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.clearCookie).toHaveBeenCalledWith("token");
    expect(mockUsers.deleteUser).not.toHaveBeenCalled();
  });

  test("answers 500 when the database fails, without signing out", async () => {
    mockUsers.findUserById.mockResolvedValue(account);
    mockUsers.deleteUser.mockRejectedValue(new Error("db down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const res = fakeRes();

    await deleteAccount(req(PASSWORD), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

describe("the delete-account request", () => {
  test("needs a password", () => {
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "x".repeat(73) }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: PASSWORD }).success).toBe(true);
  });
});

describe("me", () => {
  const token = () => jwt.sign({ id: "user-1", username: "ada", email: "ada@example.com" }, process.env.JWT_SECRET!);

  test("returns the signed-in account", async () => {
    mockUsers.findUserById.mockResolvedValue(account);
    const res = fakeRes();

    await me({ cookies: { token: token() } } as any, res);

    expect(res.json).toHaveBeenCalledWith({ user: expect.objectContaining({ id: "user-1", username: "ada" }) });
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  test("signs out a login whose account was deleted elsewhere", async () => {
    mockUsers.findUserById.mockResolvedValue(null);
    const res = fakeRes();

    await me({ cookies: { token: token() } } as any, res);

    expect(res.json).toHaveBeenCalledWith({ user: null });
    expect(res.clearCookie).toHaveBeenCalledWith("token");
  });
});
