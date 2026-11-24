import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity, ArrowUpRight, Bot, CircleHelp, Code2, Command, Cpu, Download,
  FileText, Image as ImageIcon, Paperclip, Play, Radio, Search, ShieldCheck,
  Square, Terminal, Trash2, Wifi, WifiOff, Zap, X, Youtube, Globe
} from "lucide-react";
import "./workbench-console.css";

export type ConsoleAttachment = {
  name: string;
  type: string;
  dataUrl?: string;
  text?: string;
};

export type ConsoleRunOptions = {
  modelOverride?: string;
  isolateHistory?: boolean;
  toolOverride?: string;
  action?: "image" | "images" | "youtube" | "inspect" | "reverse";
  attachments?: ConsoleAttachment[];
  aspectRatio?: string;
};

export type ConsoleRunResult = {
  ok: boolean;
  model: string;
  durationMs: number;
  words: number;
  error?: string;
};

type ConsoleMessage = {
  role: "user" | "assistant";
  text: string;
  model?: string;
  imageUrl?: string;
  files?: { name: string; type: string }[];
};

type ConsoleModel = {
  name: string;
  label: string;
  description: string;
  locked?: boolean;
};

type ConsoleEvent = {
  id: number;
  kind: "command" | "system" | "success" | "warning";
  text: string;
  at: number;
};

type Props = {
  messages: ConsoleMessage[];
  models: ConsoleModel[];
  selectedModel: string;
  autoModelRouting: boolean;
  isOnline: boolean;
  apiReachable: boolean | null;
  running: boolean;
  activity: string | null;
  lastLatencyMs: number | null;
  onModelChange: (model: string) => void;
  onAutoModelRoutingChange: (enabled: boolean) => void;
  onRun: (prompt: string, options?: ConsoleRunOptions) => Promise<ConsoleRunResult>;
  onStop: () => void;
  onClear: () => void;
};

const COMMANDS = [
  ["/help", "Show the command guide and ready-to-run examples"],
  ["/status", "Inspect API route, model, session, and latency"],
  ["/gpu status", "Check the Studio Plus AirLLM worker connection"],
  ["/kimi status", "Check the private Kimi inference endpoint connection"],
  ["/ping", "Send a real model request and measure latency"],
  ["/models", "List model names and access"],
  ["/model <name>", "Switch model: core, nova, swift, or studio"],
  ["/auto on|off", "Toggle automatic model routing"],
  ["/bench <prompt>", "Run the same prompt across every unlocked model"],
  ["/research <prompt>", "Run live web research with sources"],
  ["/code <prompt>", "Send a coding-focused task"],
  ["/write <prompt>", "Send a writing-focused task"],
  ["/study <prompt>", "Ask NOXEN to teach or explain a topic"],
  ["/data <prompt>", "Analyse supplied data or a file"],
  ["/ideas <prompt>", "Brainstorm and compare ideas"],
  ["/youtube <query>", "Find and analyse a matching YouTube video"],
  ["/inspect <url>", "Inspect public HTML and heuristic security indicators"],
  ["/reverse <url>", "Map public pages and build a reconstruction blueprint"],
  ["/image <prompt>", "Generate a new image"],
  ["/images <query>", "Find existing web images and source pages"],
  ["/attach", "Choose images or text/code files for analysis"],
  ["/export", "Download the console transcript as Markdown"],
  ["/clear", "Clear the current test session"],
  ["/stop", "Cancel the current request or benchmark"]
] as const;

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "js", "jsx", "ts", "tsx", "py", "html", "htm", "css", "xml", "yaml", "yml", "toml", "log", "sql", "c", "cpp", "h", "hpp", "java", "go", "rs", "sh"]);

function displayModel(model?: string) {
  return String(model || "NOXEN").replace(/^NOXEN\s+/i, "");
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not prepare the selected image."));
    reader.readAsDataURL(blob);
  });
}

async function prepareImage(file: File): Promise<ConsoleAttachment> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("Use PNG, JPEG, WebP, or GIF images.");
  if (file.type === "image/gif" && file.size <= 1_450_000) {
    return { name: file.name, type: file.type, dataUrl: await readBlobAsDataUrl(file) };
  }
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare this image.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.84 - attempt * 0.08));
      if (!blob) throw new Error("Your browser could not compress this image.");
      if (blob.size <= 1_450_000) return { name: file.name, type: "image/jpeg", dataUrl: await readBlobAsDataUrl(blob) };
      scale *= 0.78;
    }
    throw new Error("That image is too large after compression. Choose a smaller image.");
  } finally {
    bitmap.close();
  }
}

async function prepareTextFile(file: File): Promise<ConsoleAttachment> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!TEXT_EXTENSIONS.has(extension)) throw new Error("Use an image or a text/code file such as .txt, .md, .csv, .json, .ts, .py, or .html.");
  if (file.size > 140_000) throw new Error("Keep text/code files below 140 KB for this test console.");
  const text = await file.text();
  if (!text.trim()) throw new Error(file.name + " is empty.");
  if (text.length > 32000) throw new Error("Keep " + file.name + " below 32,000 characters.");
  return { name: file.name, type: file.type || "text/plain", text };
}

export default function WorkbenchConsole({
  messages, models, selectedModel, autoModelRouting, isOnline, apiReachable,
  running, activity, lastLatencyMs, onModelChange, onAutoModelRoutingChange,
  onRun, onStop, onClear
}: Props) {
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<ConsoleEvent[]>([
    { id: 1, kind: "system", text: "NOXEN Console initialized. Type /help for commands or /ping to test a live model.", at: Date.now() }
  ]);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [attachments, setAttachments] = useState<ConsoleAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const eventIdRef = useRef(2);
  const benchmarkCancelRef = useRef(false);
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const appendEvent = useCallback((kind: ConsoleEvent["kind"], text: string) => {
    setEvents(previous => [...previous.slice(-80), { id: eventIdRef.current++, kind, text, at: Date.now() }]);
  }, []);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [messages.length, events.length, running, benchmarkRunning, activity]);

  const clearConsole = useCallback(() => {
    onClear();
    setEvents([]);
    setAttachments([]);
    appendEvent("success", "Session cleared. The console is ready for a new test.");
    inputRef.current?.focus();
  }, [appendEvent, onClear]);

  const exportTranscript = useCallback(() => {
    const content = [
      "# NOXEN Console transcript",
      "Exported: " + new Date().toLocaleString(),
      ...events.map(event => "[" + formatTime(event.at) + "] " + event.text),
      ...messages.map(message => [
        message.role === "user" ? "## INPUT" : "## NOXEN OUTPUT · " + displayModel(message.model),
        message.text,
        ...(message.files?.length ? ["Files: " + message.files.map(file => file.name).join(", ")] : []),
        ...(message.imageUrl ? ["[Generated image attached in the console UI]"] : [])
      ].join("\n\n"))
    ].join("\n\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "noxen-console-" + new Date().toISOString().replace(/[:.]/g, "-") + ".md";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    appendEvent("success", "Transcript exported as Markdown.");
  }, [appendEvent, events, messages]);

  const runPrompt = useCallback(async (prompt: string, options: ConsoleRunOptions = {}, label = "request") => {
    const result = await onRun(prompt, options);
    if (result.ok) {
      appendEvent("success", label.toUpperCase() + " COMPLETE · " + result.model + " · " + result.durationMs + " ms · " + result.words + " words");
    } else if (result.error === "Cancelled") {
      appendEvent("warning", label.toUpperCase() + " CANCELLED.");
    } else {
      appendEvent("warning", label.toUpperCase() + " FAILED · " + (result.error || "Unknown error"));
    }
    return result;
  }, [appendEvent, onRun]);

  const runModelBenchmark = useCallback(async (prompt: string) => {
    const available = models.filter(model => !model.locked);
    if (!available.length) {
      appendEvent("warning", "No unlocked models are available for this benchmark.");
      return;
    }
    benchmarkCancelRef.current = false;
    setBenchmarkRunning(true);
    appendEvent("system", "BENCHMARK STARTED · " + available.length + " models · sequential requests · isolated history");
    const results: ConsoleRunResult[] = [];
    try {
      for (let index = 0; index < available.length; index += 1) {
        if (benchmarkCancelRef.current) break;
        const model = available[index];
        appendEvent("command", "BENCH " + (index + 1) + "/" + available.length + " · " + model.label);
        const result = await runPrompt(prompt, { modelOverride: model.name, isolateHistory: true }, "benchmark " + model.label);
        results.push(result);
        if (benchmarkCancelRef.current) break;
      }
      if (results.length) appendEvent("system", "BENCHMARK RESULTS\n" + results.map(result =>
        (result.ok ? "PASS" : "FAIL") + " · " + displayModel(result.model) + " · " + result.durationMs + " ms · " + result.words + " words"
      ).join("\n"));
      appendEvent(benchmarkCancelRef.current ? "warning" : "success",
        benchmarkCancelRef.current ? "Benchmark stopped by user." : "Benchmark complete. Compare answer quality and latency; this is not a formal accuracy score.");
    } finally {
      setBenchmarkRunning(false);
      benchmarkCancelRef.current = false;
      inputRef.current?.focus();
    }
  }, [appendEvent, models, runPrompt]);

  const selectFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setPreparingFiles(true);
    try {
      const next = [...attachments];
      for (const file of Array.from(files)) {
        if (next.length >= 6) throw new Error("Up to 6 files can be staged per request.");
        const imageCount = next.filter(item => !!item.dataUrl).length;
        if (file.type.startsWith("image/")) {
          if (imageCount >= 3) throw new Error("NOXEN accepts up to 3 images per request.");
          next.push(await prepareImage(file));
        } else {
          next.push(await prepareTextFile(file));
        }
      }
      setAttachments(next);
      appendEvent("success", "FILES READY · " + Array.from(files).map(file => file.name).join(", "));
    } catch (error) {
      appendEvent("warning", error instanceof Error ? error.message : "Could not prepare the selected files.");
    } finally {
      setPreparingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      inputRef.current?.focus();
    }
  }, [appendEvent, attachments]);

  const needsArgument = (command: string, argument: string) => {
    if (argument) return true;
    appendEvent("warning", "USAGE · " + command + " <input>");
    return false;
  };

  const execute = useCallback(async (raw: string) => {
    const line = raw.trim();
    if ((!line && !attachments.length) || ((running || benchmarkRunning || preparingFiles) && line.toLowerCase() !== "/stop")) return;
    setInput("");
    appendEvent("command", "$ " + (line || "[attached files]"));
    if (line) commandHistoryRef.current = [...commandHistoryRef.current.filter(item => item !== line), line].slice(-40);
    historyIndexRef.current = -1;

    if (!line.startsWith("/")) {
      appendEvent("system", "DISPATCH · " + displayModel(selectedModel) + (attachments.length ? " · " + attachments.length + " attachment(s)" : ""));
      const staged = attachments;
      setAttachments([]);
      await runPrompt(line || "Analyse the attached file(s) and explain their contents.", { attachments: staged }, "chat");
      return;
    }

    const firstSpace = line.indexOf(" ");
    const command = (firstSpace < 0 ? line : line.slice(0, firstSpace)).toLowerCase();
    const argument = firstSpace < 0 ? "" : line.slice(firstSpace + 1).trim();
    switch (command) {
      case "/help":
      case "/?":
        appendEvent("system",
          "MODEL CONTROL\n" + COMMANDS.filter(([name]) => ["/models", "/model <name>", "/auto on|off", "/ping", "/bench <prompt>"].includes(name)).map(([name, description]) => name.padEnd(24) + " " + description).join("\n") +
          "\n\nAI MODES\n" + COMMANDS.filter(([name]) => ["/research <prompt>", "/code <prompt>", "/write <prompt>", "/study <prompt>", "/data <prompt>", "/ideas <prompt>"].includes(name)).map(([name, description]) => name.padEnd(24) + " " + description).join("\n") +
          "\n\nNOXEN TOOLS\n" + COMMANDS.filter(([name]) => ["/youtube <query>", "/inspect <url>", "/reverse <url>", "/image <prompt>", "/images <query>", "/attach"].includes(name)).map(([name, description]) => name.padEnd(24) + " " + description).join("\n") +
          "\n\nSESSION\n" + COMMANDS.filter(([name]) => ["/status", "/export", "/clear", "/stop"].includes(name)).map(([name, description]) => name.padEnd(24) + " " + description).join("\n") +
          "\n\nEXAMPLES\n  /model studio\n  /bench Explain recursion with an example\n  /research latest TypeScript release notes\n  /youtube how transformers work animation\n  /inspect https://example.com\n  /image a little robot in a greenhouse at sunrise\n  Attach a PNG/JPEG/WebP/GIF or text/code file, then ask NOXEN to analyse it.\n\nThis console runs NOXEN app actions, not arbitrary operating-system shell commands.");
        return;
      case "/status":
        appendEvent("success", [
          "NETWORK: " + (isOnline ? "ONLINE" : "OFFLINE"),
          "CHAT API: " + (apiReachable === null ? "CHECKING" : apiReachable ? "ROUTE REACHABLE" : "UNREACHABLE"),
          "MODEL: " + displayModel(selectedModel),
          "ROUTING: " + (autoModelRouting ? "AUTOMATIC" : "MANUAL"),
          "STATE: " + (running || benchmarkRunning ? "BUSY" : "READY"),
          "MESSAGES: " + messages.length,
          "STAGED FILES: " + attachments.length,
          "LAST REQUEST: " + (lastLatencyMs === null ? "NOT RUN YET" : lastLatencyMs + " ms")
        ].join("\n"));
        return;
      case "/gpu":
      case "/kimi": {
        const service = command.slice(1);
        const action = argument.toLowerCase() || "status";
        if (action !== "status") {
          appendEvent("warning", "Only the status check is available here. Model generation remains on NOXEN's authenticated chat pipeline.");
          return;
        }
        try {
          const response = await fetch("/api/" + service + "/status", { cache: "no-store", signal: AbortSignal.timeout(7000) });
          const payload: any = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "Status endpoint returned HTTP " + response.status);
          appendEvent(payload.reachable ? "success" : "warning", [
            service.toUpperCase() + " · " + String(payload.state || "unknown").toUpperCase(),
            "CONFIGURED: " + (payload.configured ? "YES" : "NO"),
            "REACHABLE: " + (payload.reachable ? "YES" : "NO"),
            payload.cudaAvailable === undefined ? "" : "CUDA: " + (payload.cudaAvailable ? "AVAILABLE" : "NOT DETECTED"),
            payload.cudaDevice ? "GPU: " + payload.cudaDevice : "",
            payload.message || "No additional status details."
          ].filter(Boolean).join("\n"));
        } catch (error) {
          appendEvent("warning", service.toUpperCase() + " status check failed: " + (error instanceof Error ? error.message : "Unknown error"));
        }
        return;
      }
      case "/ping": {
        const result = await runPrompt("Reply with exactly PONG and one short sentence confirming which model handled this request.", { isolateHistory: true }, "ping");
        if (result.ok) appendEvent("success", "PING LATENCY · " + result.durationMs + " ms");
        return;
      }
      case "/models":
        appendEvent("system", "MODEL REGISTRY\n" + models.map(model =>
          (model.locked ? "[LOCKED] " : "[READY]  ") + model.label + " · " + model.name + "\n          " + model.description
        ).join("\n"));
        return;
      case "/model": {
        if (!argument) {
          appendEvent("warning", "USAGE · /model <core|nova|swift|studio>");
          return;
        }
        const target = argument.toLowerCase().replace(/^noxen\s+/, "").trim();
        const aliases: Record<string, string> = { core: "NOXEN Core 1.0", "core 1.0": "NOXEN Core 1.0", nova: "NOXEN Core 1.5", "core 1.5": "NOXEN Core 1.5", swift: "NOXEN Swift", studio: "NOXEN Studio", "studio plus": "NOXEN Studio Plus" };
        const model = models.find(item => item.name.toLowerCase() === target || item.label.toLowerCase() === target) || models.find(item => item.name === aliases[target]);
        if (!model) {
          appendEvent("warning", "Unknown model. Use /models to list available models.");
          return;
        }
        if (model.locked) {
          appendEvent("warning", model.label + " requires verified owner sign-in on the main NOXEN site.");
          return;
        }
        onModelChange(model.name);
        onAutoModelRoutingChange(false);
        appendEvent("success", "MODEL SELECTED · " + model.label + " · automatic routing disabled");
        return;
      }
      case "/auto": {
        const value = argument.toLowerCase();
        if (value !== "on" && value !== "off") {
          appendEvent("warning", "USAGE · /auto on OR /auto off");
          return;
        }
        onAutoModelRoutingChange(value === "on");
        appendEvent("success", "AUTO ROUTING " + (value === "on" ? "ENABLED" : "DISABLED"));
        return;
      }
      case "/clear":
      case "/cls":
      case "/new":
        clearConsole();
        return;
      case "/export":
        exportTranscript();
        return;
      case "/attach":
        fileInputRef.current?.click();
        return;
      case "/stop":
        benchmarkCancelRef.current = true;
        onStop();
        appendEvent("warning", "CANCEL SIGNAL SENT.");
        return;
      case "/bench":
        if (needsArgument(command, argument)) await runModelBenchmark(argument);
        return;
      case "/research":
      case "/code":
      case "/write":
      case "/study":
      case "/data":
      case "/ideas": {
        if (!needsArgument(command, argument)) return;
        const prefix: Record<string, string> = {
          "/code": "Treat this as a coding task. Give a complete compatible solution and relevant edge cases.\n\n",
          "/write": "Treat this as a writing task and produce a polished ready-to-use result.\n\n",
          "/study": "Teach this clearly, step by step, with a concise example.\n\n",
          "/data": "Analyse the supplied data carefully. Explain findings and limitations without inventing values.\n\n",
          "/ideas": "Brainstorm specific original ideas and briefly compare trade-offs.\n\n"
        };
        await runPrompt((prefix[command] || "") + argument, command === "/research" ? { toolOverride: "web" } : {}, command.slice(1));
        return;
      }
      case "/youtube":
        if (needsArgument(command, argument)) await runPrompt(argument, { action: "youtube" }, "youtube");
        return;
      case "/inspect":
        if (needsArgument(command, argument)) await runPrompt(argument, { action: "inspect" }, "website inspection");
        return;
      case "/reverse":
        if (needsArgument(command, argument)) await runPrompt(argument, { action: "reverse" }, "reverse engineering");
        return;
      case "/image":
        if (needsArgument(command, argument)) await runPrompt(argument, { action: "image", aspectRatio: "16:9" }, "image generation");
        return;
      case "/images":
        if (needsArgument(command, argument)) await runPrompt(argument, { action: "images" }, "image search");
        return;
      default:
        appendEvent("warning", "UNKNOWN COMMAND · " + command + " · Type /help for the command registry.");
    }
  }, [
    apiReachable, appendEvent, attachments, autoModelRouting, benchmarkRunning,
    clearConsole, exportTranscript, isOnline, lastLatencyMs, messages.length,
    models, onAutoModelRoutingChange, onModelChange, onRun, onStop, preparingFiles,
    runModelBenchmark, runPrompt, selectedModel
  ]);

  const busy = running || benchmarkRunning || preparingFiles;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void execute(input);
  };

  return (
    <section className="content-page noxen-console-page" aria-label="NOXEN Console">
      <div className="noxen-console-heading">
        <div>
          <span className="noxen-console-eyebrow"><Terminal size={14} /> NOXEN DEVELOPER WORKSPACE</span>
          <h1>Console<span>.</span></h1>
          <p>Run models, test tools, inspect outputs, and compare response latency—all from one terminal.</p>
        </div>
        <div className="noxen-console-heading-actions">
          <span className={"noxen-console-status " + (apiReachable ? "online" : "offline")}>
            {apiReachable ? <Wifi size={14} /> : <WifiOff size={14} />}
            {apiReachable ? "API ROUTED" : apiReachable === null ? "CHECKING" : "API OFFLINE"}
          </span>
          <button type="button" className="noxen-console-icon-button" onClick={exportTranscript} title="Export transcript" aria-label="Export transcript"><Download size={16} /></button>
          <button type="button" className="noxen-console-icon-button" onClick={clearConsole} title="Clear console" aria-label="Clear console"><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="noxen-console-shell">
        <div className="noxen-console-windowbar">
          <div className="noxen-console-windowdots" aria-hidden="true"><i /><i /><i /></div>
          <div className="noxen-console-window-title"><Terminal size={13} /> noxen://console/session</div>
          <span className="noxen-console-window-state"><span /> SESSION ACTIVE</span>
        </div>

        <div className="noxen-console-toolbar">
          <label className="noxen-console-model">
            <span><Cpu size={13} /> MODEL TARGET</span>
            <select value={selectedModel} onChange={event => onModelChange(event.target.value)} disabled={busy}>
              {models.map(model => <option key={model.name} value={model.name} disabled={model.locked}>{model.label}{model.locked ? " · locked" : ""}</option>)}
            </select>
          </label>
          <label className="noxen-console-auto">
            <input type="checkbox" checked={autoModelRouting} onChange={event => onAutoModelRoutingChange(event.target.checked)} disabled={busy} />
            <span className="noxen-console-toggle" />
            <span>AUTO ROUTE</span>
          </label>
          <div className="noxen-console-toolbar-meta">
            <span><Radio size={12} /> {busy ? "BUSY" : "READY"}</span>
            <span><Bot size={12} /> {messages.length} MSG</span>
            <span><Activity size={12} /> {lastLatencyMs === null ? "— ms" : lastLatencyMs + " ms"}</span>
          </div>
        </div>

        <div className="noxen-console-quickbar" aria-label="Quick commands">
          <button type="button" onClick={() => setInput("/ping")}><Activity size={13} /> Ping</button>
          <button type="button" onClick={() => setInput("/research ")}><Search size={13} /> Research</button>
          <button type="button" onClick={() => setInput("/youtube ")}><Youtube size={13} /> YouTube</button>
          <button type="button" onClick={() => setInput("/image ")}><ImageIcon size={13} /> Image</button>
          <button type="button" onClick={() => setInput("/bench ")}><Cpu size={13} /> Bench</button>
          <button type="button" onClick={() => setInput("/help")}><CircleHelp size={13} /> Help</button>
        </div>

        <div className="noxen-console-output" ref={outputRef} role="log" aria-live="polite" aria-label="Console output">
          <div className="noxen-console-welcome">
            <div className="noxen-console-welcome-mark"><Terminal size={18} /></div>
            <div>
              <strong>NOXEN CONSOLE <span>v2.0</span></strong>
              <p>Live chat · research · YouTube · site inspection · image tools · file analysis · benchmarks</p>
            </div>
          </div>

          {!events.length && !messages.length && (
            <div className="noxen-console-start">
              <div className="noxen-console-start-title">QUICK START</div>
              <p>Pick a model above, then choose a real NOXEN feature to test:</p>
              <div className="noxen-console-start-grid">
                <button type="button" onClick={() => setInput("/ping")}><code>/ping</code><span>Test a real model response</span></button>
                <button type="button" onClick={() => setInput("/bench Explain recursion with an example")}><code>/bench</code><span>Compare unlocked models</span></button>
                <button type="button" onClick={() => setInput("/research latest TypeScript release notes")}><code>/research</code><span>Research with live sources</span></button>
                <button type="button" onClick={() => setInput("/image a small robot in a greenhouse")}><code>/image</code><span>Generate an image</span></button>
                <button type="button" onClick={() => setInput("/inspect https://example.com")}><code>/inspect</code><span>Inspect a public website</span></button>
                <button type="button" onClick={() => setInput("/help")}><code>/help</code><span>Open every command</span></button>
              </div>
            </div>
          )}

          {events.map(event => (
            <div className={"noxen-console-event " + event.kind} key={event.id}>
              <span className="noxen-console-event-time">{formatTime(event.at)}</span>
              <pre>{event.text}</pre>
            </div>
          ))}

          {messages.map((message, index) => (
            <article className={"noxen-console-entry " + message.role} key={index}>
              {message.role === "user" ? (
                <>
                  <div className="noxen-console-entry-label"><span className="noxen-console-prompt-symbol">$</span> INPUT <small>{index + 1}</small></div>
                  <pre className="noxen-console-user-input">{message.text}</pre>
                  {!!message.files?.length && <div className="noxen-console-file-meta">{message.files.map((file, fileIndex) => <span key={file.name + fileIndex}><FileText size={12} /> {file.name}</span>)}</div>}
                </>
              ) : (
                <>
                  <div className="noxen-console-entry-label">
                    <span className="noxen-console-output-symbol">›</span> NOXEN OUTPUT
                    <span className="noxen-console-model-tag">{displayModel(message.model)}</span>
                  </div>
                  <div className="noxen-console-markdown markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                  </div>
                  {message.imageUrl && <a className="noxen-console-image-output" href={message.imageUrl} target="_blank" rel="noreferrer"><img src={message.imageUrl} alt="Generated by NOXEN" /><span>OPEN GENERATED IMAGE <ArrowUpRight size={13} /></span></a>}
                </>
              )}
            </article>
          ))}

          {activity && <div className="noxen-console-working"><Activity size={15} /><span>{activity}</span>{benchmarkRunning && <small>BENCHMARK RUNNING</small>}</div>}
          <div className="noxen-console-cursor-line" aria-hidden="true"><span>›</span><i /></div>
        </div>

        {!!attachments.length && (
          <div className="noxen-console-attachments" aria-label="Staged files">
            {attachments.map((item, index) => (
              <span className="noxen-console-attachment" key={item.name + index}>
                {item.dataUrl ? <ImageIcon size={13} /> : <FileText size={13} />}
                {item.name}
                <button type="button" aria-label={"Remove " + item.name} onClick={() => setAttachments(previous => previous.filter((_, i) => i !== index))}><X size={12} /></button>
              </span>
            ))}
            <button type="button" className="noxen-console-clear-files" onClick={() => setAttachments([])}>REMOVE ALL</button>
          </div>
        )}

        <form className="noxen-console-input-area" onSubmit={submit}>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.markdown,.csv,.tsv,.json,.js,.jsx,.ts,.tsx,.py,.html,.htm,.css,.xml,.yaml,.yml,.toml,.log,.sql,.c,.cpp,.h,.hpp,.java,.go,.rs,.sh"
            onChange={event => void selectFiles(event.target.files)}
          />
          <button type="button" className="noxen-console-attach-button" onClick={() => fileInputRef.current?.click()} disabled={busy} title="Attach an image or text/code file" aria-label="Attach file"><Paperclip size={16} /></button>
          <div className="noxen-console-input-prefix"><span>noxen</span><b>›</b></div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!busy) void execute(input);
              } else if (event.key === "ArrowUp" && !input.trim()) {
                event.preventDefault();
                const history = commandHistoryRef.current;
                if (history.length) {
                  const next = historyIndexRef.current < 0 ? history.length - 1 : Math.max(0, historyIndexRef.current - 1);
                  historyIndexRef.current = next;
                  setInput(history[next]);
                }
              } else if (event.key === "ArrowDown" && historyIndexRef.current >= 0) {
                event.preventDefault();
                const next = historyIndexRef.current + 1;
                historyIndexRef.current = next >= commandHistoryRef.current.length ? -1 : next;
                setInput(historyIndexRef.current < 0 ? "" : commandHistoryRef.current[historyIndexRef.current]);
              } else if (event.key === "Tab" && input.trim().startsWith("/")) {
                const token = input.trim().split(/\s/)[0];
                const match = COMMANDS.find(([name]) => name.startsWith(token));
                if (match) {
                  event.preventDefault();
                  setInput(match[0].split(" ")[0] + " ");
                }
              } else if (event.key.toLowerCase() === "l" && event.ctrlKey) {
                event.preventDefault();
                clearConsole();
              } else if (event.key.toLowerCase() === "c" && event.ctrlKey && busy) {
                event.preventDefault();
                benchmarkCancelRef.current = true;
                onStop();
                appendEvent("warning", "CANCEL SIGNAL SENT.");
              }
            }}
            rows={2}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Console command or prompt"
            placeholder={busy ? "NOXEN is processing… type /stop to cancel" : attachments.length ? "Ask NOXEN to analyse the attached files…  ·  /help" : "Enter a prompt or command…  ·  /help"}
          />
          {busy ? (
            <button type="button" className="noxen-console-run-button stop" onClick={() => {
              benchmarkCancelRef.current = true;
              onStop();
              appendEvent("warning", "CANCEL SIGNAL SENT.");
            }} aria-label="Stop current run" title="Stop current run"><Square size={15} fill="currentColor" /></button>
          ) : (
            <button type="submit" className="noxen-console-run-button" disabled={!input.trim() && !attachments.length} aria-label="Run command" title="Run command"><Play size={15} fill="currentColor" /></button>
          )}
        </form>

        <div className="noxen-console-footer">
          <span><ShieldCheck size={12} /> NOXEN app tools only · no host shell access</span>
          <span><Zap size={12} /> {autoModelRouting ? "AUTO ROUTING" : "MANUAL"} · {displayModel(selectedModel).toUpperCase()} · {attachments.length} FILE(S)</span>
        </div>
      </div>

      <div className="noxen-console-command-help">
        <div className="noxen-console-command-help-title"><Command size={15} /> COMMAND QUICK REFERENCE</div>
        <div className="noxen-console-command-grid">
          {[
            ["/ping", "Verify a real answer and measure latency"],
            ["/bench", "Compare Core, Nova, Swift, and Studio"],
            ["/research", "Search the web and cite sources"],
            ["/youtube", "Find and analyse a video"],
            ["/inspect", "Inspect a public website"],
            ["/reverse", "Map pages and build a site blueprint"],
            ["/image", "Generate a new image"],
            ["/images", "Find existing images"],
            ["/attach", "Analyse images and text/code files"],
            ["/model", "Switch the model"],
            ["/auto", "Toggle automatic routing"],
            ["/export", "Download the transcript"]
          ].map(([command, description]) => (
            <button type="button" key={command} onClick={() => { setInput(command + " "); inputRef.current?.focus(); }}>
              <code>{command}</code><span>{description}</span><ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
