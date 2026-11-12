import axios from "axios";

const api = axios.create({ baseURL: "/api", withCredentials: true });

export interface Me {
  id: string;
  username: string;
  email?: string;
  isGuest: boolean;
}

// Resolves to null when nobody is logged in.
export async function getMe(): Promise<Me | null> {
  const { data } = await api.get<{ user: Me | null }>("/auth/me");
  return data.user;
}

// Deletes the signed-in account and everything it owns. Takes its password
// again; rejects with 401 if it's wrong.
export function deleteAccount(password: string) {
  return api.delete<{ message: string; canvasesDeleted: number }>("/auth/me", { data: { password } });
}

export function startGuest() {
  return api.post<{ user: Me; canvasId: string }>("/auth/guest");
}
