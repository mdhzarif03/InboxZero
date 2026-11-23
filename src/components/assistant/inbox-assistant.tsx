"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowUpRight, Bot, Loader2, Send, Sparkles } from "lucide-react";

type Source = { threadId: string; subject: string; reason: string };
type Exchange = { question: string; answer: string; sources: Source[] };

const SUGGESTIONS = [
  "Which emails need my attention today?",
  "What am I still waiting to hear back about?",
  "What deadlines are coming up?",
  "Summarize my most important recent conversations.",
];

export function InboxAssistant() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = question.trim();
    if (!value || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
      setHistory((items) => [...items, { question: value, answer: data.answer, sources: data.sources ?? [] }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ask InboxZero.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Bot className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Ask your inbox</h2>
          <p className="text-xs text-muted-foreground">Answers grounded in your synced conversations, with source links.</p>
        </div>
        <span className="hidden items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex"><Sparkles className="size-3" /> Gemini</span>
      </div>

      <div className="space-y-5 p-5">
        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5">
            <p className="text-sm font-medium">Your mailbox is searchable as context, not just a pile of messages.</p>
            <p className="mt-1 text-sm text-muted-foreground">Ask a question. InboxZero finds relevant conversations and asks Gemini to answer from those records.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="rounded-full border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-h-[560px] space-y-5 overflow-y-auto pr-1">
            {history.map((item, index) => (
              <article key={index} className="space-y-3">
                <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground">{item.question}</div>
                <div className="max-w-[95%] rounded-2xl rounded-bl-md border border-border bg-background px-4 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-7">{item.answer}</p>
                  {item.sources.length ? (
                    <div className="mt-4 border-t border-border pt-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
                      <ul className="space-y-2">
                        {item.sources.map((source) => (
                          <li key={source.threadId}>
                            <Link href={`/inbox/${source.threadId}`} className="group flex items-start gap-2 text-xs hover:text-primary">
                              <ArrowUpRight className="mt-0.5 size-3.5 shrink-0" />
                              <span className="min-w-0">
                                <span className="block font-medium">{source.subject}</span>
                                <span className="block text-muted-foreground">{source.reason}</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}

        {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

        <form onSubmit={submit} className="flex items-end gap-2 rounded-xl border border-input bg-background p-2 shadow-xs focus-within:ring-2 focus-within:ring-ring">
          <label htmlFor="inbox-question" className="sr-only">Ask a question about your inbox</label>
          <textarea id="inbox-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={600} rows={2} placeholder="Ask anything about your emails…" className="max-h-36 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground" />
          <button type="submit" disabled={loading || question.trim().length < 3} aria-label="Send question" className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
        <p className="text-[11px] text-muted-foreground">Read-only. InboxZero never sends or changes email. Questions are processed under your AI consent and usage limit.</p>
      </div>
    </section>
  );
}
