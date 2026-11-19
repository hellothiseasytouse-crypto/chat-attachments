import React, { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Cpu, FlaskConical, ShieldCheck, Wifi } from "lucide-react";
import WorkbenchConsole, { type ConsoleRunOptions } from "./WorkbenchConsole";

type MediaKind = "image" | "video" | "audio" | "3d";
type Message = {
  role: "user" | "assistant"; text: string; model?: string; provider?: string;
  latencyMs?: number; mediaUrl?: string; mediaKind?: MediaKind; mediaName?: string;
};
const MODELS = [
  { name: "NOXEN Core 1.0", label: "Core", description: "Original Core model · live NOXEN inference" },
  { name: "NOXEN Core 1.5", label: "Nova", description: "Balanced reasoning and coding · live NOXEN inference" },
  { name: "NOXEN Swift", label: "Swift", description: "Fast response model · live NOXEN inference" },
  { name: "NOXEN Studio", label: "Studio", description: "Advanced analysis and coding · live NOXEN inference" },
  { name: "NOXEN Studio Plus", label: "Studio Plus", description: "Requires the verified NOXEN owner session", locked: true }
];
const PROFILE_DIRECTIVES: Record<string, string> = {
  code: "Handle this as a software engineering task. Prioritize a correct, runnable solution; inspect assumptions, edge cases, types, security, and tests. Be explicit about anything you cannot execute.\n\n",
  write: "Handle this as a writing task. Produce a polished, complete draft in the requested format and tone.\n\n",
  study: "Handle this as a learning task. Explain concepts clearly, show the steps, and help the learner understand rather than only giving a result.\n\n",
  data: "Handle this as a data-analysis task. State the method, distinguish facts from assumptions, and show calculations or structured results.\n\n",
  ideas: "Handle this as a brainstorming task. Generate distinct, practical ideas and explain the strongest options briefly.\n\n"
};
const chooseModel = (prompt: string) => {
  const value = prompt.toLowerCase();
  if (/\b(deep research|architecture|complex|comprehensive|strategy|roadmap|audit|debug|refactor)\b/.test(value)) return "NOXEN Studio";
  if (/\b(search|research|latest|today|current|sources|news|fact.?check)\b/.test(value)) return "NOXEN Core 1.5";
  if (/\b(quick|briefly|simple|define|translate|calculate)\b/.test(value)) return "NOXEN Swift";
  return "NOXEN Core 1.5";
};
const modelLabel = (name: string) => MODELS.find(model => model.name === name)?.label || name.replace(/^NOXEN\s+/i, "");
function normalisePublicUrl(value: string) {
  const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : "https://" + value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only public HTTP or HTTPS URLs are supported.");
  return url.toString();
}
async function postJson(path: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(path, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error(path + " returned non-JSON (HTTP " + response.status + ")."); }
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : path + " returned HTTP " + response.status + ".");
  return payload;
}
function formatSearch(payload: any) {
  const results = Array.isArray(payload.results) ? payload.results : [];
  if (!results.length) return "## Search completed\n\nNo results returned.\n\nProviders: " + (payload.providers?.join(", ") || "not reported");
  return "## Web search results\n\n**Query:** " + String(payload.query || "") + "\n\n" +
    results.map((item: any, i: number) => (i + 1) + ". **[" + String(item.title || "Untitled") + "](" + String(item.url || "#") + ")**\n   " + String(item.snippet || "No description.")).join("\n\n") +
    "\n\n**Providers:** " + (Array.isArray(payload.providers) ? payload.providers.join(", ") : "Not reported");
}
function formatYoutube(payload: any) {
  const video = payload.video;
  if (!video || !/^[a-zA-Z0-9_-]{11}$/.test(String(video.id || ""))) throw new Error("YouTube returned no valid video result.");
  const url = "https://www.youtube.com/watch?v=" + video.id;
  return [
    "## YouTube match", "",
    "**[" + String(video.title || "Untitled video") + "](" + url + ")**", "",
    "Channel: " + String(video.channel || "Unavailable"),
    "Views: " + String(video.viewLabel || video.viewsLabel || video.views || "Unavailable"),
    "Duration: " + String(video.duration || "Unavailable"),
    "Published: " + String(video.publishedAt || "Unavailable"),
    "Search candidates: " + String(payload.candidates ?? "Unavailable"),
    "", "Exact video: " + url,
    video.transcriptAvailable ? "Transcript: available for follow-up analysis." : "Transcript: unavailable in this lookup."
  ].join("\n");
}
function formatInspection(report: any) {
  const headings = Array.isArray(report.headings) ? report.headings.slice(0, 16) : [];
  const findings = Array.isArray(report.findings) ? report.findings.slice(0, 10) : [];
  const links = Array.isArray(report.links) ? report.links : [];
  const buttons = Array.isArray(report.buttons) ? report.buttons : [];
  const controls = Array.isArray(report.controls) ? report.controls : [];
  const forms = Array.isArray(report.forms) ? report.forms : [];
  return [
    "## Public website inspection", "",
    "**Site:** " + String(report.title || report.url || "Unknown"),
    "**URL:** " + String(report.url || "Unknown"),
    "**HTTP status:** " + String(report.status ?? "Unavailable"),
    "**HTML inspected:** " + String(report.inspectedBytes ?? "Unavailable") + " bytes", "",
    "### Page headings", headings.length ? headings.map((item: any) => "- " + String(item)).join("\n") : "- No headings detected.", "",
    "### Interface inventory",
    "- Links: " + links.length, "- Buttons: " + buttons.length,
    "- Controls: " + controls.length, "- Forms: " + forms.length,
    "- Stylesheets: " + (report.stylesheets?.length ?? 0), "- Images: " + (report.images?.length ?? 0), "",
    "### Security indicators",
    findings.length ? findings.map((item: any) => "- **" + String(item.severity || "info").toUpperCase() + " · " + String(item.label || "Indicator") + "** — " + String(item.note || "Indicator detected.")).join("\n") : "- No heuristic indicators were reported. This does not prove the site is safe.",
    "", "**Coverage:** public HTML only. Scripts are not executed and authenticated pages are not accessed."
  ].join("\n");
}
function formatReverse(report: any) {
  const pages = Array.isArray(report.pages) ? report.pages : [];
  const inventory = report.inventory || {};
  const list = (items: any, limit = 16) => Array.isArray(items) && items.length ? items.slice(0, limit).map((item: any) => "- " + (typeof item === "string" ? item : JSON.stringify(item))).join("\n") : "- None detected.";
  const pageLines = pages.map((page: any) => "- **" + String(page.title || "Untitled page") + "** · " + String(page.url || "") + "\n  " + (page.headings?.slice?.(0, 5).join(" · ") || "No headings") + "\n  " + (page.links?.length ?? 0) + " links · " + (page.buttons?.length ?? 0) + " buttons · " + (page.controls?.length ?? 0) + " controls").join("\n");
  return [
    "## Public website reconstruction report", "",
    "**Target:** " + String(report.target || "Unknown"),
    "**Title:** " + String(report.siteTitle || "Unknown"),
    "**Pages inspected:** " + String(report.pagesInspected ?? pages.length),
    "**Public routes discovered:** " + String(report.candidateRoutesFound ?? "Unavailable"), "",
    "### Mapped pages", pageLines || "- No pages mapped.", "",
    "### Navigation", list(inventory.navigation), "",
    "### Buttons", list(inventory.buttons), "",
    "### Controls", list(inventory.controls), "",
    "### Framework signals", list(report.frameworkSignals), "",
    "### Assets",
    "- Stylesheets: " + (inventory.stylesheets?.length ?? 0),
    "- Public scripts inspected: " + (inventory.scripts?.length ?? 0),
    "- Images listed: " + (inventory.images?.length ?? 0), "",
    "### Limits",
    "Read-only public-page inspection. No script execution, control clicking, private APIs or source recovery."
  ].join("\n");
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState("NOXEN Core 1.5");
  const [autoModelRouting, setAutoModelRouting] = useState(false);
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [backendState, setBackendState] = useState<"not-checked" | "connected" | "error">("not-checked");
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const activeController = useRef<AbortController | null>(null);
  useEffect(() => {
    const online = () => setIsOnline(true), offline = () => setIsOnline(false);
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  const run = useCallback(async (prompt: string, options?: ConsoleRunOptions) => {
    const text = prompt.trim();
    if (!text) return;
    const tool = options?.toolOverride || "none";
    const model = options?.modelOverride || (autoModelRouting ? chooseModel(text) : selectedModel);
    if (model === "NOXEN Studio Plus") {
      setMessages(previous => [...previous, { role: "user", text, model }, { role: "assistant", text: "Studio Plus requires a verified, signed-in owner session. This separate console does not bypass that access control. Open the main NOXEN site and sign in there.", model: "ACCESS CONTROL" }]);
      return;
    }
    const history = options?.isolateHistory ? [] : messages.slice(-12).map(item => ({ role: item.role, content: item.text, model: item.model }));
    const controller = new AbortController();
    activeController.current = controller;
    setMessages(previous => [...previous, { role: "user", text: options?.displayInput || text, model }]);
    setRunning(true);
    setActivity("NOXEN " + modelLabel(model) + " · preparing request");
    const started = performance.now();
    const reply = (body: string, label: string, extra: Partial<Message> = {}) => {
      setMessages(previous => [...previous, { role: "assistant", text: body, model: label, latencyMs: Math.round(performance.now() - started), ...extra }]);
      setBackendState("connected");
    };
    try {
      if (!isOnline) throw new Error("This browser is offline. Reconnect and retry.");
      if (tool === "search") {
        setActivity("NOXEN Search · querying live web sources");
        const payload = await postJson("/api/search", { query: text, context: history.slice(-4).map((item: any) => item.content).join("\n").slice(-1200) }, controller.signal);
        reply(formatSearch(payload), "WEB SEARCH"); return;
      }
      if (tool === "youtube") {
        setActivity("NOXEN YouTube · searching public results");
        const payload = await postJson("/api/youtube", { query: text }, controller.signal);
        reply(formatYoutube(payload), "YOUTUBE"); return;
      }
      if (tool === "inspect") {
        const url = normalisePublicUrl(text);
        setActivity("NOXEN Inspector · checking public page");
        const payload = await postJson("/api/inspect", { url }, controller.signal);
        reply(formatInspection(payload), "SITE INSPECTOR"); return;
      }
      if (tool === "reverse") {
        const url = normalisePublicUrl(text);
        setActivity("NOXEN Reverse Engineer · mapping public pages");
        const response = await fetch("/api/inspect", {
          method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "reverse-engineer", url }), signal: controller.signal
        });
        if (!response.ok) {
          let payload: any = {}; try { payload = await response.json(); } catch {}
          throw new Error(payload.error || "Reverse engineering returned HTTP " + response.status + ".");
        }
        if (!response.body) throw new Error("Reverse-engineering progress stream unavailable.");
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = "", report: any = null, streamError = "";
        const consume = (frame: string) => {
          const line = frame.split(/\r?\n/).find(item => item.startsWith("data:"));
          if (!line) return;
          let item: any; try { item = JSON.parse(line.slice(5).trim()); } catch { return; }
          if (item.message) setActivity("NOXEN Reverse Engineer · " + String(item.message).slice(0, 145));
          if (item.type === "complete") report = item.report;
          if (item.type === "error") streamError = String(item.message || "Reverse engineering failed.");
        };
        try {
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            const frames = buffer.split(/\r?\n\r?\n/); buffer = frames.pop() || "";
            frames.forEach(consume);
          }
          buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
        } finally { reader.releaseLock(); }
        if (streamError) throw new Error(streamError);
        if (!report) throw new Error("No completed report arrived from the inspection stream.");
        reply(formatReverse(report), "REVERSE ENGINEER"); return;
      }
      if (tool === "image" || tool === "video" || tool === "audio" || tool === "3d") {
        const kind = tool as MediaKind, imageOnly = kind === "image";
        setActivity("NOXEN Media · generating " + kind);
        const response = await fetch(imageOnly ? "/api/image" : "/api/media", {
          method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, aspectRatio: /\b16\s*:\s*9\b|\bwide\b/i.test(text) ? "16:9" : "1:1", type: kind }),
          signal: controller.signal
        });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok) {
          let payload: any = {}; try { payload = await response.json(); } catch {}
          throw new Error(payload.error || "Media generation returned HTTP " + response.status + ".");
        }
        if (contentType.includes("application/json")) {
          const payload = await response.json(); throw new Error(payload.error || "Media endpoint returned JSON instead of a file.");
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("Media endpoint returned an empty file.");
        const mediaUrl = URL.createObjectURL(blob);
        const extension = kind === "image" ? ".png" : kind === "video" ? ".mp4" : kind === "audio" ? ".mp3" : ".glb";
        reply(kind === "3d" ? "Generated 3D asset ready. Download the GLB below." : "Generated " + kind + " is ready.", "MEDIA " + kind.toUpperCase(), { mediaUrl, mediaKind: kind, mediaName: "noxen-generated-" + kind + extension });
        return;
      }

      setActivity(tool === "web" ? "NOXEN " + modelLabel(model) + " · researching the web" : "NOXEN " + modelLabel(model) + " · waiting for response");
      const payload = await postJson("/api/chat", {
        message: (PROFILE_DIRECTIVES[tool] || "") + text,
        history, requestModel: model, selectedModel: model, attachments: [],
        search: tool === "web", searchResults: [], responseStylePreference: "direct-concise",
        profileHandle: "console-user", profileName: "NOXEN Console User", profileBio: "",
        context: "", feedbackMemory: "", studioProvider: "huggingface",
        preferences: { playfulBanter: false }, agentMode: true
      }, controller.signal);
      if (typeof payload.answer !== "string" || !payload.answer.trim()) throw new Error("NOXEN chat API returned no answer.");
      let answer = payload.answer.trim();
      const sources = Array.isArray(payload.sources) ? payload.sources.filter((item: any) => typeof item?.url === "string" && /^https?:\/\//i.test(item.url)).slice(0, 6) : [];
      if (sources.length) answer += "\n\n### Sources\n" + sources.map((item: any, i: number) => (i + 1) + ". [" + String(item.title || item.url) + "](" + item.url + ")" + (item.snippet ? " — " + String(item.snippet).slice(0, 220) : "")).join("\n");
      reply(answer, String(payload.noxenModel || payload.model || model), { provider: typeof payload.responseProvider === "string" ? payload.responseProvider : undefined });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setBackendState("error");
      setMessages(previous => [...previous, {
        role: "assistant", text: "## Request failed\n\n" + (error instanceof Error ? error.message : "Unknown NOXEN request error."),
        model: "API ERROR", latencyMs: Math.round(performance.now() - started)
      }]);
    } finally {
      if (activeController.current === controller) { activeController.current = null; setRunning(false); setActivity(null); }
    }
  }, [autoModelRouting, isOnline, messages, selectedModel]);

  const stop = useCallback(() => { activeController.current?.abort(); activeController.current = null; setRunning(false); setActivity(null); }, []);
  const clear = useCallback(() => {
    activeController.current?.abort(); activeController.current = null;
    messages.forEach(item => { if (item.mediaUrl) URL.revokeObjectURL(item.mediaUrl); });
    setMessages([]); setRunning(false); setActivity(null); setBackendState("not-checked");
  }, [messages]);
  const lastLatency = [...messages].reverse().find(item => item.role === "assistant" && typeof item.latencyMs === "number")?.latencyMs;

  return (
    <main className="playground">
      <header className="playground-header">
        <a className="brand" href="/" aria-label="NOXEN Console home"><span className="brand-icon"><FlaskConical size={18} /></span><span>NOXEN <b>CONSOLE</b></span></a>
        <span className={"top-pill " + (backendState === "connected" ? "connected" : backendState === "error" ? "error" : "")}><span className={"pulse-dot " + (backendState === "connected" ? "live" : "")} />{backendState === "connected" ? "BACKEND CONNECTED" : backendState === "error" ? "BACKEND ERROR" : "API READY TO TEST"}</span>
      </header>
      <section className="playground-intro">
        <div className="intro-copy"><div className="eyebrow"><Activity size={14} /> DEVELOPER TERMINAL · SESSION 01</div><h1>NOXEN<span>://</span>console</h1><p>Test the actual NOXEN models and tools from one terminal. Run commands, inspect output, compare models and export your session.</p></div>
        <div className="runtime-card"><div className="runtime-card-title"><Wifi size={15} /> BACKEND STATUS</div><strong>{backendState === "connected" ? "CONNECTED" : backendState === "error" ? "ERROR" : "NOT TESTED"}</strong><small>{lastLatency != null ? "Last response · " + lastLatency.toLocaleString() + " ms" : "Run /ping to test a model response"}</small></div>
      </section>
      <section className="notice" role="note"><ShieldCheck size={17} /><div><strong>Real NOXEN services · separate test session</strong><p>Chat, search, YouTube and public-site inspection use NOXEN's backend. This console does not load account memories or plugin grants. Media generation requires an explicit <code>--confirm</code> command. Studio Plus remains account-locked.</p></div></section>
      <div className="backend-meta"><span><Cpu size={13} /> CORE · NOVA · SWIFT · STUDIO</span><span><AlertTriangle size={13} /> NO HOST SHELL · NO ACCOUNT DATA</span></div>
      <WorkbenchConsole
        messages={messages} models={MODELS} selectedModel={selectedModel} autoModelRouting={autoModelRouting}
        isOnline={isOnline} backendState={backendState} running={running} activity={activity}
        onModelChange={setSelectedModel} onAutoModelRoutingChange={setAutoModelRouting} onRun={run} onStop={stop} onClear={clear}
      />
      <footer className="playground-footer"><span><ShieldCheck size={13} /> Local console transcript · not synced to NOXEN account history</span><span>Smiling Cat Lab · NOXEN Developer Test Bench</span></footer>
    </main>
  );
}
