import { create } from "zustand";

interface AuthState {
  token: string | null;
  userId: string | null;
  isBeta: boolean;
  setAuth: (token: string, userId: string, isBeta: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  isBeta: false,
  setAuth: (token, userId, isBeta) => set({ token, userId, isBeta }),
  clearAuth: () => set({ token: null, userId: null, isBeta: false }),
}));
