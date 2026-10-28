"use client";

import { useState, type FormEvent } from "react";

export function AiPromptPanel({ projectTitle }: { projectTitle: string }) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          systemInstruction: `You are an assistant helping with the TobyVerse project "${projectTitle}". Be concise and useful.`,
        }),
      });

      const data = (await result.json()) as { text?: string; error?: string };

      if (!result.ok) {
        throw new Error(data.error ?? "Generation failed.");
      }

      setResponse(data.text ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Claude</h2>
        <p className="mt-1 text-xs text-muted">Ask the model about this project.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          required
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          placeholder="Describe a location, character, or next scene…"
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-white/20"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Generating…" : "Generate"}
          </button>
        </div>
      </form>

      {response && (
        <div className="mt-4 whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-6 text-foreground/90">
          {response}
        </div>
      )}
    </section>
  );
}
