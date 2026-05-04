/**
 * Tests for the SSE streaming utility (stream-chat.ts).
 *
 * These tests verify SSE line parsing, token accumulation, tool result
 * detection, AbortController cancellation, and error handling.
 */

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock supabase before importing the module under test
jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "test-token-123" } },
      }),
    },
  },
}));

// We need to mock global fetch for these tests
const mockFetch = jest.fn();
(global as unknown as Record<string, unknown>).fetch = mockFetch;

import { streamChat } from "../../lib/stream-chat";

// ── Helpers ────────────────────────────────────────────────────────────

/** Create a ReadableStream from an array of SSE chunks. */
function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/** Create a mock Response with a ReadableStream body. */
function mockResponse(chunks: string[], ok = true, status = 200): Response {
  return {
    ok,
    status,
    body: createSSEStream(chunks),
    json: jest.fn().mockResolvedValue({ detail: "Error detail" }),
  } as unknown as Response;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("streamChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("SSE line parsing", () => {
    it("parses tokens from SSE data lines", async () => {
      const tokens: string[] = [];
      mockFetch.mockResolvedValue(
        mockResponse([
          'data: {"token": "Hello"}\n\n',
          'data: {"token": " world"}\n\n',
          "data: [DONE]\n\n",
        ])
      );

      await streamChat({
        message: "test",
        onToken: (t) => tokens.push(t),
      });

      expect(tokens).toEqual(["Hello", " world"]);
    });

    it("handles multiple SSE lines in a single chunk", async () => {
      const tokens: string[] = [];
      mockFetch.mockResolvedValue(
        mockResponse([
          'data: {"token": "A"}\ndata: {"token": "B"}\ndata: {"token": "C"}\n',
          "data: [DONE]\n\n",
        ])
      );

      await streamChat({
        message: "test",
        onToken: (t) => tokens.push(t),
      });

      expect(tokens).toEqual(["A", "B", "C"]);
    });

    it("ignores non-data lines", async () => {
      const tokens: string[] = [];
      mockFetch.mockResolvedValue(
        mockResponse([
          ": comment line\n",
          'data: {"token": "valid"}\n',
          "event: ping\n",
          "data: [DONE]\n\n",
        ])
      );

      await streamChat({
        message: "test",
        onToken: (t) => tokens.push(t),
      });

      expect(tokens).toEqual(["valid"]);
    });

    it("ignores [DONE] marker", async () => {
      const tokens: string[] = [];
      mockFetch.mockResolvedValue(
        mockResponse([
          'data: {"token": "text"}\n',
          "data: [DONE]\n\n",
        ])
      );

      await streamChat({
        message: "test",
        onToken: (t) => tokens.push(t),
      });

      expect(tokens).toEqual(["text"]);
    });

    it("handles non-JSON data lines gracefully", async () => {
      const tokens: string[] = [];
      mockFetch.mockResolvedValue(
        mockResponse([
          "data: not-json\n",
          'data: {"token": "ok"}\n',
          "data: [DONE]\n\n",
        ])
      );

      await streamChat({
        message: "test",
        onToken: (t) => tokens.push(t),
      });

      expect(tokens).toEqual(["ok"]);
    });

    it("handles SSE lines split across chunks (buffering)", async () => {
      const tokens: string[] = [];
      // The line 'data: {"token": "split"}' is split across two chunks
      mockFetch.mockResolvedValue(
        mockResponse([
          'data: {"token": "sp',
          'lit"}\n',
          "data: [DONE]\n\n",
        ])
      );

      await streamChat({
        message: "test",
        onToken: (t) => tokens.push(t),
      });

      expect(tokens).toEqual(["split"]);
    });
  });

  describe("tool result detection", () => {
    it("calls onToolResult when a token contains a tool result pattern", async () => {
      const tokens: string[] = [];
      const toolResults: string[] = [];
      mockFetch.mockResolvedValue(
        mockResponse([
          'data: {"token": "\\n\\n*✅ Skipped today\'s run*\\n\\n"}\n',
          "data: [DONE]\n\n",
        ])
      );

      await streamChat({
        message: "skip today's run",
        onToken: (t) => tokens.push(t),
        onToolResult: (r) => toolResults.push(r),
      });

      expect(tokens.length).toBe(1);
      expect(toolResults).toEqual(["Skipped today's run"]);
    });

    it("does not call onToolResult for normal tokens", async () => {
      const toolResults: string[] = [];
      mockFetch.mockResolvedValue(
        mockResponse([
          'data: {"token": "Hello there"}\n',
          "data: [DONE]\n\n",
        ])
      );

      await streamChat({
        message: "test",
        onToken: () => {},
        onToolResult: (r) => toolResults.push(r),
      });

      expect(toolResults).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("throws when response is not ok", async () => {
      mockFetch.mockResolvedValue(
        mockResponse([], false, 500)
      );

      await expect(
        streamChat({ message: "test", onToken: () => {} })
      ).rejects.toThrow("Error detail");
    });

    it("throws when response body is null", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
      });

      await expect(
        streamChat({ message: "test", onToken: () => {} })
      ).rejects.toThrow("No stream body");
    });
  });

  describe("request configuration", () => {
    it("sends POST with correct headers and body", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(["data: [DONE]\n\n"])
      );

      await streamChat({ message: "hello coach", onToken: () => {} });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/coach/chat"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token-123",
          }),
          body: JSON.stringify({ message: "hello coach" }),
        })
      );
    });

    it("passes AbortSignal to fetch", async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValue(
        mockResponse(["data: [DONE]\n\n"])
      );

      await streamChat({
        message: "test",
        onToken: () => {},
        signal: controller.signal,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: controller.signal,
        })
      );
    });
  });
});
