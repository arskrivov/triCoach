import axios, { AxiosHeaders } from "axios";
import { supabase } from "./supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor: attach JWT and timezone header
api.interceptors.request.use(async (config) => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      const headers = AxiosHeaders.from(config.headers ?? {});
      headers.set("Authorization", `Bearer ${session.access_token}`);
      headers.set(
        "X-User-Timezone",
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      config.headers = headers;
    }
  } catch {
    // proceed without auth header; backend returns 401 if required
  }
  return config;
});

// Response interceptor: handle 401 by signing out
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await supabase.auth.signOut();
      // Navigation to login is handled by the auth provider
      // reacting to the session change
    }
    return Promise.reject(err);
  }
);
