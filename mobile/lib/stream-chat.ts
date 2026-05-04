/**
 * SSE streaming utility for the AI Coach chat.
 *
 * Uses XMLHttpRequest (not fetch) because React Native's fetch in Expo Go
 * does not support ReadableStream/response.body. XHR fires onprogress events
 * as data arrives, allowing real-time token display.
 *
 * @see Requirements 7.4, 7.5, 7.6
 */

import { supabase } from "./supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export interface StreamChatOptions {
  message: string;
  onToken: (token: string) => void;
  onToolResult?: (result: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream a coach chat response via SSE using XMLHttpRequest.
 *
 * XHR fires `onprogress` as chunks arrive, giving us incremental access
 * to the response text. We track how much we've already processed and
 * parse only the new data on each progress event.
 */
export async function streamChat({
  message,
  onToken,
  onToolResult,
  signal,
}: StreamChatOptions): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let processedLength = 0;
    let buffer = "";

    xhr.open("POST", `${API_URL}/api/v1/coach/chat`);
    xhr.setRequestHeader("Content-Type", "application/json");
    if (session?.access_token) {
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    }

    // Handle abort
    if (signal) {
      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new DOMException("Aborted", "AbortError"));
      });
    }

    xhr.onprogress = () => {
      // Get only the new data since last progress event
      const newData = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;

      if (!newData) return;

      // Append to buffer and process complete lines
      buffer += newData;
      const lines = buffer.split("\n");
      // Keep the last element (may be incomplete)
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.token) {
            onToken(parsed.token);

            // Detect tool results
            if (onToolResult && parsed.token.includes("✅")) {
              const match = parsed.token.match(/\*✅\s*(.+?)\*/);
              if (match) onToolResult(match[1].trim());
            }
          }
        } catch {
          // non-JSON SSE line
        }
      }
    };

    xhr.onload = () => {
      // Process any remaining buffer
      if (buffer.startsWith("data: ")) {
        const data = buffer.slice(6).trim();
        if (data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            if (parsed.token) onToken(parsed.token);
          } catch { /* ignore */ }
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        // Try to extract error detail
        let detail = "Chat request failed";
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData?.detail) detail = String(errData.detail);
        } catch { /* ignore */ }
        reject(new Error(detail));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Request timed out"));
    };

    // Important: set responseType BEFORE send for streaming to work
    xhr.responseType = "text";
    xhr.timeout = 120000; // 2 min timeout for long AI responses

    xhr.send(JSON.stringify({ message }));
  });
}
