import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getUserTimezone } from "@/lib/timezone";

describe("getUserTimezone", () => {
  it("returns the browser timezone when window is available", () => {
    const result = getUserTimezone();
    // In jsdom, Intl.DateTimeFormat should return a valid timezone
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns UTC when window is undefined (SSR context)", () => {
    // Simulate SSR by temporarily making window undefined
    const originalWindow = global.window;
    // @ts-expect-error - intentionally setting window to undefined for SSR test
    delete global.window;

    const result = getUserTimezone();
    expect(result).toBe("UTC");

    // Restore window
    global.window = originalWindow;
  });

  it("returns UTC when Intl returns empty string", () => {
    const originalIntl = global.Intl;
    global.Intl = {
      ...originalIntl,
      DateTimeFormat: vi.fn(() => ({
        resolvedOptions: () => ({ timeZone: "" }),
      })) as unknown as typeof Intl.DateTimeFormat,
    };

    const result = getUserTimezone();
    expect(result).toBe("UTC");

    global.Intl = originalIntl;
  });
});
