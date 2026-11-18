import axios, { type AxiosError } from "axios";
import { clearSession, getToken } from "./auth";

/**
 * In development the Vite proxy forwards `/api` to the API server, so the
 * default base URL is an empty string (same-origin). In production set
 * `VITE_API_URL` at build time, e.g. https://api.example.com
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? "" : "http://localhost:5000")
).replace(/\/$/, "");

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? "";
    const isAuthAttempt = url.includes("/api/auth/login") || url.includes("/api/auth/signup");

    if (error.response?.status === 401 && !isAuthAttempt) {
      clearSession();
      if (!["/login", "/signup"].includes(window.location.pathname)) {
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (error.code === "ECONNABORTED") return "The request timed out. Please try again.";
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
