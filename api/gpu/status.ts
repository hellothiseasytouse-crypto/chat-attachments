type ApiRequest = { method?: string };
type ApiResponse = { status(code: number): ApiResponse; json(body: unknown): void; setHeader(name: string, value: string): void };
function safeHttpsUrl(value: string): string | null {
  try { const url = new URL(value); if (url.protocol !== "https:") return null; return url.toString().replace(/\\/$/, ""); } catch { return null; }
}
export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const baseUrl = safeHttpsUrl(process.env.NOXEN_STUDIO_PLUS_GPU_URL || "");
  if (!baseUrl) return res.status(200).json({ service: "studio-plus-airllm", configured: false, reachable: false, state: "not_configured", message: "No HTTPS AirLLM worker URL is configured. Free notebook sessions are temporary and must be started before connecting." });
  try {
    const response = await fetch(baseUrl + "/health", { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return res.status(200).json({ service: "studio-plus-airllm", configured: true, reachable: false, state: "unhealthy", message: "The GPU worker health check returned HTTP " + response.status + "." });
    const health: any = await response.json().catch(() => ({}));
    return res.status(200).json({ service: "studio-plus-airllm", configured: true, reachable: health.ok === true, state: health.ok === true ? "online" : "unhealthy", cudaAvailable: health.cuda_available === true, cudaDevice: typeof health.cuda_device === "string" ? health.cuda_device : null, cachedModels: Array.isArray(health.cached_models) ? health.cached_models.filter((item: unknown) => typeof item === "string").slice(0, 4) : [], message: health.ok === true ? "AirLLM worker responded. Model generation still requires a separate authenticated inference test." : "The worker responded but did not report a healthy state." });
  } catch { return res.status(200).json({ service: "studio-plus-airllm", configured: true, reachable: false, state: "offline", message: "The configured GPU worker is unreachable or its temporary notebook session has ended." }); }
}
