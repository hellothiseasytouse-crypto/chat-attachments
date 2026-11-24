type ApiRequest = { method?: string };
type ApiResponse = { status(code: number): ApiResponse; json(body: unknown): void; setHeader(name: string, value: string): void };
function safeHttpsUrl(value: string): string | null {
  try { const url = new URL(value); if (url.protocol !== "https:") return null; return url.toString().replace(/\\/$/, ""); } catch { return null; }
}
export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const baseUrl = safeHttpsUrl(process.env.NOXEN_KIMI_GPU_URL || "");
  const apiKey = process.env.NOXEN_KIMI_GPU_API_KEY || "";
  const model = process.env.NOXEN_KIMI_MODEL_ID || "moonshotai/Kimi-K2.5";
  if (!baseUrl || !apiKey) return res.status(200).json({ service: "kimi-open-weights", configured: false, reachable: false, state: "not_configured", model, message: "No private Kimi-compatible inference endpoint is configured. Kimi K2.5 has 1T total parameters; a free notebook GPU is not sufficient to host the full model." });
  try {
    const response = await fetch(baseUrl + "/v1/models", { method: "GET", cache: "no-store", headers: { Authorization: "Bearer " + apiKey }, signal: AbortSignal.timeout(6000) });
    return res.status(200).json({ service: "kimi-open-weights", configured: true, reachable: response.ok, state: response.ok ? "online" : "unhealthy", model, message: response.ok ? "The configured Kimi-compatible endpoint responded. This confirms connectivity, not that the requested Kimi model is loaded." : "The configured endpoint did not accept the model-list health check (HTTP " + response.status + ")." });
  } catch { return res.status(200).json({ service: "kimi-open-weights", configured: true, reachable: false, state: "offline", model, message: "The configured Kimi endpoint is unreachable." }); }
}
