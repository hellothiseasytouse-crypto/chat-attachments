type ChatRole = "user" | "assistant";
type ChatHistoryItem = { role: ChatRole; content: string; model?: string };

const UPSTREAM = "https://noxenlabs.vercel.app/api/chat";
const ALLOWED_MODELS = new Set([
  "NOXEN Core",
  "NOXEN Core 1.0",
  "NOXEN Core 1.5",
  "NOXEN Swift",
  "NOXEN Studio"
]);
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 18;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

function clientAddress(req: any): string {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",").map(value => value.trim()).filter(Boolean);
  return String(req.headers?.["x-real-ip"] || forwarded[0] || "unknown").slice(0, 80);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST for NOXEN chat requests." });
  }

  const origin = String(req.headers?.origin || "");
  const allowedOrigins = new Set([
    "https://noxen-console-lab.vercel.app",
    "https://noxen-console-lab-cyber-0ab0.vercel.app"
  ]);
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: "This chat relay is only available to the NOXEN Console Lab website." });
  }

  const address = clientAddress(req);
  const now = Date.now();
  const bucket = requestWindows.get(address);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    requestWindows.set(address, { startedAt: now, count: 1 });
  } else {
    bucket.count += 1;
    if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
      res.setHeader("Retry-After", String(Math.ceil((WINDOW_MS - (now - bucket.startedAt)) / 1000)));
      return res.status(429).json({ error: "Console request limit reached. Wait a minute and try again." });
    }
  }
  if (requestWindows.size > 2000) {
    for (const [key, value] of requestWindows) {
      if (now - value.startedAt > WINDOW_MS * 2) requestWindows.delete(key);
    }
  }

  if (!isPlainObject(req.body)) return res.status(400).json({ error: "Invalid request body." });
  const message = safeString(req.body.message, 40_000).trim();
  if (!message) return res.status(400).json({ error: "Message cannot be empty." });
  if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > 120_000) {
    return res.status(413).json({ error: "Request is too large. Shorten the message or history." });
  }

  const requestedModel = safeString(req.body.requestModel, 80) || "NOXEN Core 1.5";
  if (requestedModel === "NOXEN Studio Plus") {
    return res.status(403).json({ error: "Studio Plus requires a verified signed-in NOXEN owner session. Use the main NOXEN app for that model." });
  }
  if (!ALLOWED_MODELS.has(requestedModel)) {
    return res.status(400).json({ error: "Unknown model target. Use /models to list available models." });
  }

  const history: ChatHistoryItem[] = Array.isArray(req.body.history)
    ? req.body.history.slice(-16).flatMap((item: any) => {
        if (!isPlainObject(item) || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") return [];
        const row: ChatHistoryItem = { role: item.role, content: item.content.slice(-7000) };
        if (typeof item.model === "string") row.model = item.model.slice(0, 80);
        return [row];
      })
    : [];

  const searchResults = Array.isArray(req.body.searchResults)
    ? req.body.searchResults.slice(0, 6).flatMap((item: any) => {
        if (!isPlainObject(item)) return [];
        const title = safeString(item.title, 180);
        const url = safeString(item.url, 1200);
        const snippet = safeString(item.snippet, 400);
        try {
          const parsed = new URL(url);
          if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !title) return [];
        } catch { return []; }
        return [{ title, url, snippet }];
      })
    : [];

  const forwardedBody = {
    responseStylePreference: safeString(req.body.responseStylePreference, 40) || "direct-concise",
    feedbackMemory: safeString(req.body.feedbackMemory, 5000),
    profileHandle: safeString(req.body.profileHandle, 80),
    profileName: safeString(req.body.profileName, 80),
    message,
    history,
    attachments: [],
    search: req.body.search === true,
    searchResults,
    context: safeString(req.body.context, 7000),
    requestModel: requestedModel,
    preferences: { playfulBanter: false },
    studioProvider: "huggingface",
    agentMode: req.body.agentMode === false ? false : true
  };

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(forwardedBody),
      cache: "no-store",
      signal: AbortSignal.timeout(115_000)
    });
    const raw = await upstream.text();
    let payload: any;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(502).json({ error: "NOXEN's response service returned an invalid response. Please try again." });
    }
    if (!upstream.ok) {
      const detail = safeString(payload?.error, 500) || "NOXEN's model service returned HTTP " + upstream.status + ".";
      return res.status(upstream.status).json({ error: detail });
    }
    if (!isPlainObject(payload) || typeof payload.answer !== "string" || !payload.answer.trim()) {
      return res.status(502).json({ error: "NOXEN's model service did not return an answer." });
    }
    return res.status(200).json(payload);
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "NOXEN's model service took too long to respond. Try again."
        : "Could not connect to NOXEN's live model service."
    });
  }
}
