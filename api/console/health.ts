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
    key: process.env.NOXEN_STUDIO_PLUS_GPU_API_KEY
  };
  if (provider === "kimi-k3") return {
    url: process.env.NOXEN_KIMI_GPU_URL,
    key: process.env.NOXEN_KIMI_GPU_API_KEY
  };
  return null;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  if (!authorized(req)) return res.status(401).json({ error: "Console access token is missing or invalid." });

  const provider = String(req.query?.provider || "");
  const selected = config(provider);
  if (!selected) return res.status(400).json({ error: "Choose studio-plus or kimi-k3." });
  if (!selected.url || !selected.key) {
    return res.status(503).json({
      ok: false,
      configured: false,
      provider,
      error: "This worker is not configured yet. Add its URL and API key to server environment variables."
    });
  }

  try {
    const response = await fetch(selected.url.replace(/\/$/, "") + "/health", {
      method: "GET",
      headers: { Authorization: "Bearer " + selected.key },
      signal: AbortSignal.timeout(8000),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ ok: false, configured: true, provider, error: "GPU worker health check failed (HTTP " + response.status + ")." });
    return res.status(200).json({ ok: true, configured: true, provider, worker: payload });
  } catch {
    return res.status(502).json({ ok: false, configured: true, provider, error: "GPU worker is unreachable or its free session has stopped." });
  }
}
