import axios, { AxiosHeaders, type AxiosRequestConfig } from "axios";
import { createClient } from "@/lib/supabase/client";

const API_ROOT =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    : "/api/backend";

export type ApiRequestConfig = AxiosRequestConfig & {
  skipAuthRedirect?: boolean;
};

export const api = axios.create({
  baseURL: `${API_ROOT}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  if (typeof window === "undefined") return config;

  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (accessToken) {
      const headers = AxiosHeaders.from(config.headers ?? {});
      headers.set("Authorization", `Bearer ${accessToken}`);
      config.headers = headers;
    }
  } catch {
    // ignore — request proceeds without auth header; backend returns 401 if required
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = (err as { response?: { status?: number } }).response?.status;
    const config = (err.config ?? {}) as ApiRequestConfig;
    if (
      status === 401 &&
      config.skipAuthRedirect !== true &&
      typeof window !== "undefined"
    ) {
      // Defer navigation so in-flight concurrent requests aren't aborted mid-flight.
      setTimeout(() => {
        window.location.href = "/login";
      }, 0);
    }
    return Promise.reject(err);
  }
);

export async function getAuthHeaders(init?: HeadersInit): Promise<Headers> {
  const headers = new Headers(init);
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch {
    // proceed without auth
  }
  return headers;
}
