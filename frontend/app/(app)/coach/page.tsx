"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api, getAuthHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_URL =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    : "/api/backend";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function loadHistory() {
    try {
      const res = await api.get<Message[]>("/coach/history");
      setMessages(res.data);
    } catch {
      // empty history is fine
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreaming(true);

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${API_URL}/api/v1/coach/chat`, {
        method: "POST",
        credentials: "include",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message: text }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        let detail = "Sorry, something went wrong. Please try again.";
        try {
          const payload = await response.json();
          if (payload?.detail) detail = String(payload.detail);
        } catch {
          // ignore non-JSON error bodies
        }
        throw new Error(detail);
      }

      if (!response.body) throw new Error("No stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                accumulated += parsed.token;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: accumulated };
                  return updated;
                });
              }
            } catch {
              // non-JSON SSE line
            }
          }
        }
      }

      if (!accumulated) {
        throw new Error("The coach returned an empty response.");
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Sorry, something went wrong. Please try again.";
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: message,
          };
          return updated;
        });
      }
    } finally {
      setStreaming(false);
    }
  }

  async function clearHistory() {
    if (!confirm("Clear conversation history?")) return;
    await api.delete("/coach/history");
    setMessages([]);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadHistory());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card">
        <div>
          <h1 className="font-semibold text-foreground">AI Coach</h1>
          <p className="text-xs text-muted-foreground">
            Powered by ChatGPT · can adjust your training plan
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearHistory}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear history
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 pb-24 lg:pb-4 flex flex-col gap-4">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">🤖</p>
            <p className="font-medium">Your personal triathlon coach</p>
            <p className="text-sm mt-1">
              Ask about training, recovery, or tell me to adjust your plan.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {[
                "How is my fitness trending?",
                "Skip today's run, bad weather",
                "Am I overtraining?",
                "Swap tomorrow's ride for a swim",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-sm px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-bl-sm"
              }`}
            >
              {msg.role === "assistant" && msg.content === "" ? (
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              ) : msg.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none prose-headings:mb-2 prose-headings:mt-0 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-foreground">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-border bg-card fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask your coach or adjust your plan…"
            disabled={streaming}
            className="flex-1"
          />
          <Button onClick={send} disabled={streaming || !input.trim()}>
            {streaming ? "…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
