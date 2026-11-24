import { timingSafeEqual } from "node:crypto";

function authorized(req: any): boolean {
  const expected = process.env.NOXEN_CONSOLE_ACCESS_TOKEN || "";
  const supplied = String(req.headers["x-console-token"] || "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function config(provider: string) {
  if (provider === "studio-plus") return {
    url: process.env.NOXEN_STUDIO_PLUS_GPU_URL,
    key: process.env.NOXEN_STUDIO_PLUS_GPU_API_KEY,
    model: process.env.NOXEN_STUDIO_PLUS_GPU_MODEL || "deepseek-airllm"
  };
  if (provider === "kimi-k3") return {
    url: process.env.NOXEN_KIMI_GPU_URL,
    key: process.env.NOXEN_KIMI_GPU_API_KEY,
    model: process.env.NOXEN_KIMI_GPU_MODEL || "kimi-k3-airllm"
  };
  return null;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!authorized(req)) return res.status(401).json({ error: "Console access token is missing or invalid." });

  const provider = String(req.body?.provider || "");
  const selected = config(provider);
  if (!selected) return res.status(400).json({ error: "Choose studio-plus or kimi-k3." });
  if (!selected.url || !selected.key) return res.status(503).json({ error: "This GPU worker is not configured on the server yet." });

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt || prompt.length > 12000) return res.status(400).json({ error: "Enter a prompt between 1 and 12,000 characters." });

  try {
    const upstream = await fetch(selected.url.replace(/\/$/, "") + "/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + selected.key
      },
      body: JSON.stringify({
        model: selected.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: Math.min(1024, Math.max(64, Number(req.body?.maxTokens) || 512)),
        temperature: 0.6,
        stream: false
      }),
      signal: AbortSignal.timeout(180000),
      cache: "no-store"
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(502).json({ error: typeof payload.detail === "string" ? payload.detail : "GPU inference failed (HTTP " + upstream.status + ")." });
    }
    const answer = payload?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) return res.status(502).json({ error: "The worker returned no text completion." });
    return res.status(200).json({
      ok: true,
      provider,
      model: payload.model || selected.model,
      answer: answer.trim(),
      usage: payload.usage || null
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "GPU inference timed out. Free GPU sessions can be slow or disconnect."
      : "GPU worker is unavailable. Check whether its free session is still running.";
    return res.status(504).json({ error: message });
  }
}
