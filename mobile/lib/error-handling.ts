/**
 * Unified error handling utilities for API calls.
 *
 * Provides consistent error extraction and classification across all
 * screens in the TriCoach mobile app.
 *
 * Error Handling Strategy:
 * 1. API Client Layer — The Axios response interceptor catches HTTP 401 globally
 *    and triggers sign-out + navigation to login. All other errors propagate to
 *    the calling screen.
 * 2. Screen Layer — Each screen wraps API calls in try/catch and uses
 *    extractApiError() to normalise error shapes. Errors are displayed inline
 *    using an Alert component, never as native alerts.
 * 3. Pull-to-Refresh Resilience — When a refresh fails, the error is displayed
 *    but previously loaded data is preserved.
 * 4. Network Errors — Network failures show a user-friendly message with a
 *    "Retry" button.
 */

/** Normalised representation of an API error. */
export interface ApiError {
  /** HTTP status code, if available (e.g. 401, 404, 500). */
  status?: number;
  /** Human-readable error message suitable for display. */
  message: string;
  /** Raw detail string from the backend response body, if present. */
  detail?: string;
}

/**
 * Extract a normalised ApiError from any thrown value.
 *
 * Handles three cases in order:
 * 1. Axios-style errors with a `response` object
 * 2. Native `Error` instances
 * 3. Unknown values (fallback message)
 *
 * @param error - The caught value from a try/catch block.
 * @returns A normalised ApiError object.
 */
export function extractApiError(error: unknown): ApiError {
  // Handle Axios errors (have a .response property)
  const axiosErr = error as {
    response?: {
      status?: number;
      data?: { detail?: string };
    };
    message?: string;
  };

  if (axiosErr?.response) {
    const rawDetail = axiosErr.response.data?.detail;
    // FastAPI validation errors return detail as an array of objects
    // e.g. [{type: "missing", loc: [...], msg: "Field required", input: null}]
    let detail: string | undefined;
    if (typeof rawDetail === "string") {
      detail = rawDetail;
    } else if (Array.isArray(rawDetail) && rawDetail.length > 0) {
      // Extract human-readable messages from validation error array
      detail = rawDetail
        .map((e: any) => e.msg || e.message || JSON.stringify(e))
        .join("; ");
    } else if (rawDetail && typeof rawDetail === "object") {
      detail = (rawDetail as any).msg || (rawDetail as any).message || JSON.stringify(rawDetail);
    }
    return {
      status: axiosErr.response.status,
      message: detail ?? axiosErr.message ?? "Request failed",
      detail,
    };
  }

  // Handle native Error instances
  if (error instanceof Error) {
    return { message: error.message };
  }

  // Fallback for unknown error shapes
  return { message: "An unknown error occurred" };
}

/**
 * Determine whether an API error should trigger a redirect to the login page.
 *
 * @param error - A normalised ApiError.
 * @returns `true` if the error is a 401 Unauthorized response.
 */
export function shouldRedirectToLogin(error: ApiError): boolean {
  return error.status === 401;
}

/**
 * Check if an error is a network connectivity error.
 *
 * @param error - The caught value from a try/catch block.
 * @returns `true` if the error appears to be a network failure.
 */
export function isNetworkError(error: unknown): boolean {
  const axiosErr = error as {
    code?: string;
    message?: string;
  };

  // Axios network error codes
  if (axiosErr?.code === "ERR_NETWORK" || axiosErr?.code === "ECONNABORTED") {
    return true;
  }

  // Check for common network error messages
  const message = axiosErr?.message?.toLowerCase() ?? "";
  return (
    message.includes("network error") ||
    message.includes("network request failed") ||
    message.includes("unable to connect")
  );
}

/**
 * Get a user-friendly message for network errors.
 *
 * @returns A message suitable for display to the user.
 */
export function getNetworkErrorMessage(): string {
  return "Unable to connect. Check your internet connection.";
}
