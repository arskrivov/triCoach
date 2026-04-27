import axios, { AxiosHeaders, type AxiosRequestConfig } from "axios";
import { createClient } from "@/lib/supabase/client";
import type { Workout, RouteSuggestion } from "@/lib/types";

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

export type ApiError = { detail: string };

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

// ── Workout-Route Integration ────────────────────────────────────────────────

/** Link a route to a workout (PUT /workouts/:workoutId/route). */
export async function linkRouteToWorkout(
  workoutId: string,
  routeId: string,
): Promise<Workout> {
  const res = await api.put<Workout>(`/workouts/${workoutId}/route`, {
    route_id: routeId,
  });
  return res.data;
}

/** Remove the route link from a workout (DELETE /workouts/:workoutId/route). */
export async function unlinkRouteFromWorkout(
  workoutId: string,
): Promise<void> {
  await api.delete(`/workouts/${workoutId}/route`);
}

/** Fetch ranked route suggestions for a discipline and location. */
export async function getRouteSuggestions(params: {
  discipline: string;
  target_distance_meters: number;
  start_lat: number;
  start_lng: number;
  target_elevation_gain?: number;
}): Promise<RouteSuggestion[]> {
  const res = await api.post<RouteSuggestion[]>("/routes/suggestions", params);
  return res.data;
}

/** Upload a cycling route to Garmin Connect as a course. */
export async function syncRouteToGarmin(
  routeId: string,
): Promise<{ garmin_course_id: number; message: string }> {
  const res = await api.post<{ garmin_course_id: number; message: string }>(
    `/routes/${routeId}/sync-garmin`,
  );
  return res.data;
}

/** Check whether a route passes through cycling-prohibited areas. */
export async function checkProhibitedAreas(
  routeId: string,
): Promise<{ has_prohibited_areas: boolean; areas: Record<string, unknown>[] }> {
  const res = await api.get<{
    has_prohibited_areas: boolean;
    areas: Record<string, unknown>[];
  }>(`/routes/${routeId}/check-prohibited`);
  return res.data;
}
