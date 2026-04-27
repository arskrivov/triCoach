import { getAuthHeaders } from "@/lib/api";

const DIRECT_API_ROOT =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    : "/api/backend";

export type GarminSyncResponse = {
  activities_synced: number;
  activity_files_synced?: number;
  health_days_synced: number;
};

export async function postGarminSync(
  path: string,
  options?: { timezone?: string },
): Promise<GarminSyncResponse> {
  const headers = await getAuthHeaders({ "Content-Type": "application/json" });
  if (options?.timezone) {
    headers.set("X-User-Timezone", options.timezone);
  }

  const response = await fetch(`${DIRECT_API_ROOT}/api/v1${path}`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    let message = `Sync failed (${response.status})`;
    try {
      const text = await response.text();
      try {
        const payload = JSON.parse(text) as { detail?: string };
        if (payload?.detail) {
          message = payload.detail;
        }
      } catch {
        // Not JSON — use the raw text if it's short enough to be useful
        if (text.length > 0 && text.length < 200) {
          message = text;
        }
      }
    } catch {
      // Could not read response body at all
    }
    throw new Error(message);
  }

  return (await response.json()) as GarminSyncResponse;
}
