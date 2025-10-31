"use client";

import { useEffect, useRef, useState } from "react";
import { SparklesIcon, PaperAirplaneIcon } from "@heroicons/react/24/solid";

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Hi, I’m Mindful. How are you feeling right now?" },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (data?.reply) setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      else {
        const fallbacks = [
          "I’m here and listening. What feels most present for you right now?",
          "Thanks for sharing that. What would feel supportive in this moment?",
          "That sounds tough. Want to tell me a bit more about what’s beneath it?",
        ];
        const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        setMessages((m) => [...m, { role: "assistant", content: pick }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry—something went wrong." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-sky-100 to-emerald-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-6 flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Mindful</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">A calm, supportive AI companion (OpenAI)</p>
          </div>
        </header>

        <main className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-white/5">
          <div className="space-y-4 overflow-y-auto p-2" style={{ maxHeight: "60vh" }}>
            {messages.map((m, i) => (
              <div key={i} className={m.role === "assistant" ? "text-slate-800 dark:text-slate-100" : "text-slate-900"}>
                <div className={
                  m.role === "assistant"
                    ? "inline-block max-w-[80%] rounded-2xl rounded-tl-none bg-indigo-50 px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow dark:bg-slate-800/60 dark:text-slate-100"
                    : "inline-block max-w-[80%] rounded-2xl rounded-tr-none bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-900 shadow dark:bg-slate-700/60 dark:text-slate-100"
                }>
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={loading ? "Sending…" : "How are you feeling today?"}
              className="flex-1 rounded-xl border border-slate-300/60 bg-white/90 px-4 py-3 text-[15px] shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600/50 dark:bg-slate-800/70 dark:placeholder:text-slate-500"
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 disabled:opacity-50"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
              Send
            </button>
          </div>
        </main>

        <footer className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Not medical advice. If you’re in crisis, call your local emergency number.
        </footer>
      </div>
    </div>
  );
}
