import { describe, it, expect } from "vitest";
import { extractApiError, shouldRedirectToLogin } from "@/lib/error-handling";

describe("extractApiError", () => {
  it("extracts status and message from Axios error with response", () => {
    const axiosError = {
      response: {
        status: 404,
        data: { detail: "Not found" },
      },
      message: "Request failed with status code 404",
    };
    const result = extractApiError(axiosError);
    expect(result.status).toBe(404);
    expect(result.message).toBe("Not found");
    expect(result.detail).toBe("Not found");
  });

  it("uses axios message when no detail in response body", () => {
    const axiosError = {
      response: {
        status: 500,
        data: {},
      },
      message: "Internal Server Error",
    };
    const result = extractApiError(axiosError);
    expect(result.status).toBe(500);
    expect(result.message).toBe("Internal Server Error");
  });

  it("falls back to 'Request failed' when no detail or message", () => {
    const axiosError = {
      response: {
        status: 500,
        data: {},
      },
    };
    const result = extractApiError(axiosError);
    expect(result.message).toBe("Request failed");
  });

  it("extracts message from native Error", () => {
    const error = new Error("Network timeout");
    const result = extractApiError(error);
    expect(result.message).toBe("Network timeout");
    expect(result.status).toBeUndefined();
  });

  it("returns fallback message for unknown error shape", () => {
    const result = extractApiError("something went wrong");
    expect(result.message).toBe("An unknown error occurred");
  });

  it("returns fallback message for null", () => {
    const result = extractApiError(null);
    expect(result.message).toBe("An unknown error occurred");
  });
});

describe("shouldRedirectToLogin", () => {
  it("returns true for 401 status", () => {
    expect(shouldRedirectToLogin({ status: 401, message: "Unauthorized" })).toBe(true);
  });

  it("returns false for 403 status", () => {
    expect(shouldRedirectToLogin({ status: 403, message: "Forbidden" })).toBe(false);
  });

  it("returns false for 500 status", () => {
    expect(shouldRedirectToLogin({ status: 500, message: "Server error" })).toBe(false);
  });

  it("returns false when status is undefined", () => {
    expect(shouldRedirectToLogin({ message: "Network error" })).toBe(false);
  });
});
