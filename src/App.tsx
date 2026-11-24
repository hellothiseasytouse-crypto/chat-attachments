import React, { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Cpu, FlaskConical, ShieldCheck, Wifi } from "lucide-react";
import WorkbenchConsole, { type ConsoleAttachment, type ConsoleRunOptions, type ConsoleRunResult } from "./WorkbenchConsole";
import GpuInferencePanel from "./GpuInferencePanel";

type Message = {
  role: "user" | "assistant";
  text: string;
  model?: string;
  imageUrl?: string;
  files?: { name: string; type: string }[];
};

const MODELS = [
  { name: "NOXEN Core 1.0", label: "Core", description: "Original Core personality and responses · live production inference" },
  { name: "NOXEN Core 1.5", label: "Nova", description: "Balanced reasoning, coding, and everyday assistance · live production inference" },
  { name: "NOXEN Swift", label: "Swift", description: "Fast responses and image understanding · live production inference" },
  { name: "NOXEN Studio", label: "Studio", description: "Advanced analysis, coding, and creative work · live production inference" },
  { name: "NOXEN Studio Plus", label: "Studio Plus", description: "AirLLM/advanced route · requires verified NOXEN owner sign-in", locked: true }
];

function chooseModel(prompt: string): string {
  const value = prompt.toLowerCase();
  if (/\b(deep research|architecture|complex|comprehensive|strategy|roadmap|audit|debug|refactor)\b/.test(value)) return "NOXEN Studio";
  if (/\b(search|research|latest|today|current|sources|news|fact.?check)\b/.test(value)) return "NOXEN Core 1.5";
  if (/\b(quick|briefly|simple|define|translate|calculate)\b/.test(value)) return "NOXEN Swift";
  return "NOXEN Core 1.5";
}

function modelLabel(name: string): string {
  return MODELS.find(model => model.name === name)?.label || name.replace(/^NOXEN\s+/i, "");
}

function parseResponse(text: string, status: number): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("NOXEN returned a non-JSON response (HTTP " + status + ").");
  }
}

async function postJson(
  url: string,
  body: unknown,
  signal: AbortSignal,
  timeoutMs = 60000
): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  });
  const raw = await response.text();
  const payload = parseResponse(raw, response.status);
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Request failed with HTTP " + response.status + ".");
  }
  return payload;
}

async function readReverseEngineeringStream(
  response: Response,
  signal: AbortSignal,
  onProgress: (message: string) => void
): Promise<any> {
  if (!response.ok) {
    const raw = await response.text();
    const payload = parseResponse(raw, response.status);
    throw new Error(payload.error || "Website analysis failed (HTTP " + response.status + ").");
  }
  if (!response.body) throw new Error("The website analysis progress stream was unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let report: any = null;
  let streamError = "";
  const consumeFrame = (frame: string) => {
    const dataLine = frame.split(/\r?\n/).find(line => line.startsWith("data:"));
    if (!dataLine) return;
    try {
      const event = JSON.parse(dataLine.slice(5).trim());
      if (typeof event.message === "string") onProgress(event.message);
      if (event.type === "complete" && event.report) report = event.report;
      if (event.type === "error") streamError = String(event.message || "Website analysis failed.");
    } catch {
      // Ignore malformed individual event frames; a completed report is required.
    }
  };
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      frames.forEach(consumeFrame);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeFrame(buffer);
  } finally {
    reader.releaseLock();
  }
  if (streamError) throw new Error(streamError);
  if (!report) throw new Error("The website analysis ended without a completed report.");
  return report;
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not load the generated image."));
    reader.readAsDataURL(blob);
  });
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState("NOXEN Core 1.5");
  const [autoModelRouting, setAutoModelRouting] = useState(false);
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const activeController = useRef<AbortController | null>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/chat", { method: "GET", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
      .then(response => setApiReachable(response.status === 405 || response.ok))
      .catch(() => setApiReachable(false));
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current = [];
  }, []);

  const run = useCallback(async (prompt: string, options?: ConsoleRunOptions): Promise<ConsoleRunResult> => {
    const text = prompt.trim();
    const attachments = options?.attachments || [];
    const hasInput = !!text || attachments.length > 0;
    if (!hasInput) return { ok: false, model: selectedModel, durationMs: 0, words: 0, error: "Empty request" };

    const model = options?.modelOverride || (autoModelRouting ? chooseModel(text) : selectedModel);
    const shownPrompt = text || "Analyze the attached file(s).";
    const startedAt = performance.now();
    if (model === "NOXEN Studio Plus") {
      const error = "Studio Plus requires a verified, signed-in owner session. This isolated test lab does not bypass NOXEN account access controls.";
      setMessages(previous => [...previous, { role: "user", text: shownPrompt, model, files: attachments.map(item => ({ name: item.name, type: item.type })) }, { role: "assistant", text: error, model: "ACCESS CONTROL" }]);
      return { ok: false, model, durationMs: 0, words: 0, error };
    }

    const history = options?.isolateHistory ? [] : messages.slice(-12).map(item => ({
      role: item.role,
      content: item.text,
      model: item.model
    }));
    const imageAttachments = attachments.filter(item => item.dataUrl && item.type.startsWith("image/")).slice(0, 3);
    const textFiles = attachments.filter(item => typeof item.text === "string");
    const fileContext = textFiles.map(item =>
      "\n\nATTACHED FILE: " + item.name + "\nTreat this as user-provided source data.\n\`\`\`\n" + (item.text || "").slice(0, 32000) + "\n\`\`\`"
    ).join("");
    let userMessage = shownPrompt + fileContext;

    const controller = new AbortController();
    activeController.current = controller;
    setMessages(previous => [...previous, {
      role: "user",
      text: shownPrompt,
      model,
      files: attachments.map(item => ({ name: item.name, type: item.type }))
    }]);
    setRunning(true);
    setActivity("NOXEN " + modelLabel(model) + " · preparing request");

    try {
      if (options?.action === "image") {
        setActivity("NOXEN Image · generating image");
        const imageResponse = await fetch("/api/image", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, aspectRatio: options.aspectRatio || "16:9" }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)])
        });
        if (!imageResponse.ok) {
          const raw = await imageResponse.text();
          const errorPayload = parseResponse(raw, imageResponse.status);
          throw new Error(errorPayload.error || "Image generation failed (HTTP " + imageResponse.status + ").");
        }
        const imageBlob = await imageResponse.blob();
        if (!imageBlob.type.startsWith("image/")) throw new Error("NOXEN's image service returned a non-image response.");
        {
          const imageUrl = URL.createObjectURL(imageBlob);
          objectUrls.current.push(imageUrl);
          setMessages(previous => [...previous, { role: "assistant", text: "Image generated by NOXEN's image service.", model: "NOXEN Image · FLUX", imageUrl }]);
          const durationMs = Math.round(performance.now() - startedAt);
          setLastLatencyMs(durationMs);
          setRequestCount(value => value + 1);
          return { ok: true, model: "NOXEN Image", durationMs, words: 0 };
        }
        throw new Error("Image service returned an unexpected response. Retry with a shorter prompt.");
      }

      if (options?.action === "images") {
        setActivity("NOXEN Images · searching image results");
        const response = await fetch("/api/images?q=" + encodeURIComponent(text), {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(16000)])
        });
        const payload = parseResponse(await response.text(), response.status);
        if (!response.ok) throw new Error(payload.error || "Image search failed.");
        const results = Array.isArray(payload.results) ? payload.results.slice(0, 8) : [];
        const answer = results.length
          ? "## Image results for " + (payload.query || text) + "\n\n" + results.map((item: any, index: number) =>
              (index + 1) + ". **" + String(item.title || "Image result").replace(/[\n\r]/g, " ").slice(0, 150) + "**\n\n![Image result](" + String(item.thumb || "") + ")\n\n[Open source](" + String(item.url || "") + ")"
            ).join("\n\n---\n\n")
          : "No image previews were returned for that search.";
        setMessages(previous => [...previous, { role: "assistant", text: answer, model: "NOXEN Image Search" }]);
        const durationMs = Math.round(performance.now() - startedAt);
        setLastLatencyMs(durationMs);
        setRequestCount(value => value + 1);
        return { ok: true, model: "NOXEN Image Search", durationMs, words: answer.split(/\s+/).length };
      }

      let youtubeVideo: any = null;
      let websiteInspection: any = null;
      let reverseEngineeringReport: any = null;

      if (options?.action === "youtube") {
        setActivity("NOXEN YouTube · finding a matching video");
        const payload = await postJson("/api/youtube", { query: text }, controller.signal, 18000);
        youtubeVideo = payload.video || null;
        if (!youtubeVideo?.id) throw new Error("YouTube did not return a usable video.");
        userMessage = "Inspect the exact YouTube result below. Summarize the available transcript and public metadata, explain what is supported by the evidence, and clearly state unavailable details. Search query: " + text;
      }

      if (options?.action === "inspect") {
        const target = /^https?:\/\//i.test(text) ? text : "https://" + text;
        setActivity("NOXEN Inspector · inspecting public HTML and security indicators");
        websiteInspection = await postJson("/api/inspect", { url: target }, controller.signal, 18000);
        userMessage = "Analyze this public website inspection report. Explain the observed page structure and any matched indicators, distinguish heuristic findings from confirmed malware, and state the scan limitations. Target: " + target;
      }

      if (options?.action === "reverse") {
        const target = /^https?:\/\//i.test(text) ? text : "https://" + text;
        setActivity("NOXEN Reverse Engineer · mapping public pages");
        const response = await fetch("/api/inspect", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "reverse-engineer", url: target }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)])
        });
        reverseEngineeringReport = await readReverseEngineeringStream(response, controller.signal, setActivity);
        userMessage = "Create an evidence-based reconstruction blueprint from this public website report. Map the pages, navigation, components, forms, buttons, assets, framework clues, and implementation steps. Label inference and coverage limitations clearly. Target: " + target;
      }

      setActivity("NOXEN " + modelLabel(model) + " · generating response");
      const payload = await postJson("/api/chat", {
        message: userMessage,
        history,
        requestModel: model,
        selectedModel: model,
        attachments: imageAttachments.map(item => ({ name: item.name, type: item.type, dataUrl: item.dataUrl })),
        search: options?.toolOverride === "web",
        searchResults: [],
        youtubeVideo,
        websiteInspection,
        reverseEngineeringReport,
        responseStylePreference: "direct-concise",
        profileHandle: "console-user",
        profileName: "NOXEN Console User",
        profileBio: "",
        context: "",
        feedbackMemory: "",
        studioProvider: "huggingface",
        preferences: { playfulBanter: false },
        agentMode: true
      }, controller.signal, 90000);

      if (typeof payload.answer !== "string" || !payload.answer.trim()) throw new Error("NOXEN's chat API returned no answer.");
      const actualModel = String(payload.noxenModel || payload.model || model);
      const answer = payload.answer.trim();
      const durationMs = Math.round(performance.now() - startedAt);
      setMessages(previous => [...previous, { role: "assistant", text: answer, model: actualModel }]);
      setLastLatencyMs(durationMs);
      setRequestCount(value => value + 1);
      return { ok: true, model: actualModel, durationMs, words: answer.split(/\s+/).length };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown NOXEN request error.";
      const cancelled = error instanceof Error && error.name === "AbortError";
      if (!cancelled) setMessages(previous => [...previous, { role: "assistant", text: "## NOXEN request failed\n\n" + detail, model: "API ERROR" }]);
      const durationMs = Math.round(performance.now() - startedAt);
      return { ok: false, model, durationMs, words: 0, error: cancelled ? "Cancelled" : detail };
    } finally {
      if (activeController.current === controller) {
        activeController.current = null;
        setRunning(false);
        setActivity(null);
      }
    }
  }, [autoModelRouting, messages, selectedModel]);

  const stop = useCallback(() => {
    activeController.current?.abort();
    activeController.current = null;
    setRunning(false);
    setActivity(null);
  }, []);

  const clear = useCallback(() => {
    activeController.current?.abort();
    activeController.current = null;
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setMessages([]);
    setRunning(false);
    setActivity(null);
  }, []);

  return (
    <main className="playground">
      <header className="playground-header">
        <a className="brand" href="/" aria-label="NOXEN Console home">
          <span className="brand-icon"><FlaskConical size={18} /></span>
          <span>NOXEN <b>CONSOLE</b></span>
        </a>
        <span className={"top-pill " + (apiReachable ? "ready" : apiReachable === false ? "unavailable" : "")}>
          <span className={"pulse-dot " + (apiReachable ? "live" : "")} />
          {apiReachable === null ? "CHECKING API" : apiReachable ? "CHAT API ROUTED" : "API UNREACHABLE"}
        </span>
      </header>

      <section className="playground-intro">
        <div className="intro-copy">
          <div className="eyebrow"><Activity size={14} /> DEVELOPER TEST WORKSTATION</div>
          <h1>NOXEN Console<span>.</span></h1>
          <p>Test NOXEN models and tools from a terminal-style workspace. Type a prompt or run a command such as <code>/bench</code>, <code>/research</code>, <code>/image</code>, or <code>/inspect</code>.</p>
        </div>
        <div className="runtime-card">
          <div className="runtime-card-title"><Wifi size={15} /> RUNTIME STATUS</div>
          <strong className={isOnline && apiReachable ? "runtime-ok" : "runtime-warn"}>{!isOnline ? "OFFLINE" : apiReachable ? "API ROUTED" : apiReachable === false ? "UNAVAILABLE" : "CHECKING"}</strong>
          <small>{requestCount} request(s) this session{lastLatencyMs !== null ? " · last " + lastLatencyMs + " ms" : ""}</small>
        </div>
      </section>

      <section className="notice" role="note">
        <ShieldCheck size={17} />
        <div>
          <strong>Real NOXEN services · isolated test session</strong>
          <p>Chat, image, research, YouTube, and public-site inspection requests use NOXEN's production endpoints. This lab does not load your account memories, connected plugins, or private chat history. Studio Plus still requires verified owner sign-in.</p>
        </div>
      </section>

      <div className="backend-meta">
        <span><Cpu size={13} /> CORE · NOVA · SWIFT · STUDIO</span>
        <span><AlertTriangle size={13} /> APP COMMANDS ONLY · NO OS SHELL</span>
      </div>

      <GpuInferencePanel />

      <WorkbenchConsole
        messages={messages}
        models={MODELS}
        selectedModel={selectedModel}
        autoModelRouting={autoModelRouting}
        isOnline={isOnline}
        apiReachable={apiReachable}
        running={running}
        activity={activity}
        lastLatencyMs={lastLatencyMs}
        onModelChange={setSelectedModel}
        onAutoModelRoutingChange={setAutoModelRouting}
        onRun={run}
        onStop={stop}
        onClear={clear}
      />

      <footer className="playground-footer">
        <span><ShieldCheck size={13} /> Separate console transcript · not synced to NOXEN account history</span>
        <span>Smiling Cat Lab · NOXEN Developer Test Workstation</span>
      </footer>
    </main>
  );
}
