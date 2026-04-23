/**
 * Timezone detection utility.
 *
 * Provides a consistent way to read the user's local IANA timezone across
 * all components that need to pass `X-User-Timezone` to the backend.
 */

/**
 * Return the user's local IANA timezone string (e.g. "America/New_York").
 *
 * Falls back to "UTC" in server-side rendering contexts where `window` is
 * not available, or when the browser does not expose timezone information.
 *
 * @returns IANA timezone string.
 */
export function getUserTimezone(): string {
  if (typeof window === "undefined") {
    return "UTC";
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
