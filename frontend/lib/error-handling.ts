/**
 * Unified error handling utilities for API calls.
 *
 * Provides consistent error extraction and classification across all
 * dashboard and application components.
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
    const detail = axiosErr.response.data?.detail;
    return {
      status: axiosErr.response.status,
      message: detail ?? axiosErr.message ?? "Request failed",
      detail,
    };
  }

  // Handle native Error instances
  if (error instanceof Error && error.message) {
    return {
      message: error.message,
    };
  }

  // Fallback for unknown error shapes
  return {
    message: "An unknown error occurred",
  };
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
