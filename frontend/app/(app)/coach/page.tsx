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

interface Goal {
  id: string;
  description: string;
  target_date: string | null;
  is_active: boolean;
}

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  const [addingGoal, setAddingGoal] = useState(false);
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

  async function loadGoals() {
    try {
      const res = await api.get<Goal[]>("/coach/goals");
      setGoals(res.data);
    } catch {
      // ignore
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

  async function addGoal() {
    if (!newGoal.trim()) return;
    setAddingGoal(true);
    try {
      const res = await api.post<Goal>("/coach/goals", { description: newGoal.trim() });
      setGoals((prev) => [res.data, ...prev]);
      setNewGoal("");
    } finally {
      setAddingGoal(false);
    }
  }

  async function deleteGoal(id: string) {
    await api.delete(`/coach/goals/${id}`);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadHistory();
      void loadGoals();
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  return (
    <div className="flex h-screen overflow-hidden">
      {/* Goals sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm">Goals</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {goals.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-4">No goals yet. Add one below.</p>
          )}
          {goals.map((g) => (
            <div key={g.id} className="p-2.5 border border-zinc-100 rounded-lg group">
              <div className="flex items-start justify-between gap-1">
                <p className="text-sm font-medium leading-tight flex-1">{g.description}</p>
                <button onClick={() => deleteGoal(g.id)}
                  className="text-zinc-300 hover:text-red-400 opacity-0 group-hover:opacity-100 text-base leading-none shrink-0">
                  ×
                </button>
              </div>
              <span className={`mt-1 inline-block text-xs px-1.5 py-0.5 rounded-full font-medium ${g.is_active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>
                {g.is_active ? "active" : "done"}
              </span>
              {g.target_date && (
                <p className="text-xs text-zinc-400 mt-0.5">by {g.target_date}</p>
              )}
            </div>
          ))}
        </div>
        <div className="p-3 border-t flex gap-2">
          <Input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGoal()}
            placeholder="Add a goal…"
            className="text-sm h-8 flex-1"
          />
          <Button size="sm" className="h-8 px-2" onClick={addGoal} disabled={addingGoal}>+</Button>
        </div>
      </aside>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 py-3 border-b bg-white">
          <div>
            <h1 className="font-semibold">AI Coach</h1>
            <p className="text-xs text-zinc-400">Powered by ChatGPT · context includes your last 90 days</p>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearHistory} className="text-zinc-400 hover:text-zinc-700">
              Clear history
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-16 text-zinc-400">
              <p className="text-4xl mb-3">🤖</p>
              <p className="font-medium">Your personal triathlon coach</p>
              <p className="text-sm mt-1">Ask about your training, recovery, race plans, or technique.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {[
                  "How is my fitness trending?",
                  "Suggest a workout for tomorrow",
                  "Am I overtraining?",
                  "Review my last week",
                ].map((s) => (
                  <button key={s} onClick={() => { setInput(s); }}
                    className="text-sm px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-zinc-900 text-white rounded-br-sm"
                  : "bg-white border border-zinc-100 text-zinc-800 rounded-bl-sm"
              }`}>
                {msg.role === "assistant" && msg.content === "" ? (
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-headings:mb-2 prose-headings:mt-0 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-zinc-900">
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
        <div className="px-6 py-4 border-t bg-white">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask your coach…"
              disabled={streaming}
              className="flex-1"
            />
            <Button onClick={send} disabled={streaming || !input.trim()}>
              {streaming ? "…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
