import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity, ArrowUpRight, Bot, CircleHelp, Code2, Command, Cpu, Download,
  LoaderCircle, Play, Radio, Search, ShieldCheck, Square, Terminal, Trash2,
  Wifi, WifiOff, Zap
} from "lucide-react";
import "./workbench-console.css";

export type ConsoleRunOptions = { modelOverride?: string; isolateHistory?: boolean; toolOverride?: string; displayInput?: string };
type MediaKind = "image" | "video" | "audio" | "3d";
type ConsoleMessage = {
  role: "user" | "assistant"; text: string; model?: string; provider?: string;
  latencyMs?: number; mediaUrl?: string; mediaKind?: MediaKind; mediaName?: string;
};
type ConsoleModel = { name: string; label: string; description: string; locked?: boolean };
type ConsoleEvent = { id: number; kind: "command" | "system" | "success" | "warning"; text: string; at: number };
type Props = {
  messages: ConsoleMessage[]; models: ConsoleModel[]; selectedModel: string; autoModelRouting: boolean;
  isOnline: boolean; backendState: "not-checked" | "connected" | "error"; running: boolean; activity: string | null;
  onModelChange: (model: string) => void; onAutoModelRoutingChange: (enabled: boolean) => void;
  onRun: (prompt: string, options?: ConsoleRunOptions) => Promise<void>; onStop: () => void; onClear: () => void;
};
const COMMANDS = [
  ["/help", "Show the console command manual"],
  ["/ping", "Send a real request to the selected NOXEN model"],
  ["/status", "Show backend, model, request and latency status"],
  ["/capabilities", "List the real NOXEN features available here"],
  ["/models", "List model names and access state"],
  ["/model <name>", "Select Core, Nova, Swift or Studio"],
  ["/auto on|off", "Toggle automatic model routing"],
  ["/research <prompt>", "Ask a model and enable live web search"],
  ["/search <query>", "Run the standalone NOXEN web-search endpoint"],
  ["/youtube <query>", "Search YouTube and inspect the top result"],
  ["/inspect <url>", "Inspect a public webpage and its interface"],
  ["/reverse <url>", "Map multiple public pages into a rebuild report"],
  ["/code <prompt>", "Use the coding-focused response profile"],
  ["/write <prompt>", "Use the writing-focused response profile"],
  ["/study <prompt>", "Use the learning-focused response profile"],
  ["/data <prompt>", "Use the data-analysis response profile"],
  ["/ideas <prompt>", "Brainstorm with the selected model"],
  ["/bench <prompt>", "Run the same prompt across available models"],
  ["/image --confirm <prompt>", "Generate an image; provider credits may be used"],
  ["/video --confirm <prompt>", "Generate video; provider credits may be used"],
  ["/audio --confirm <prompt>", "Generate audio; provider credits may be used"],
  ["/3d --confirm <prompt>", "Generate a 3D asset; provider credits may be used"],
  ["/history", "Show recent entries in this local session"],
  ["/export", "Download this console transcript as Markdown"],
  ["/clear", "Clear this local console session"],
  ["/stop", "Abort a request or benchmark"]
] as const;
function displayModel(model?: string) { return String(model || "NOXEN").replace(/^NOXEN\s+/i, ""); }
function formatTime(timestamp: number) { return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

export default function WorkbenchConsole({
  messages, models, selectedModel, autoModelRouting, isOnline, backendState,
  running, activity, onModelChange, onAutoModelRoutingChange, onRun, onStop, onClear
}: Props) {
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<ConsoleEvent[]>([
    { id: 1, kind: "system", text: "NOXEN Console initialized. Type /help for the quick start.", at: Date.now() }
  ]);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const benchmarkCancelRef = useRef(false);
  const eventIdRef = useRef(2);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const appendEvent = useCallback((kind: ConsoleEvent["kind"], text: string) => {
    setEvents(previous => [...previous.slice(-48), { id: eventIdRef.current++, kind, text, at: Date.now() }]);
  }, []);
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [messages.length, events.length, running, benchmarkRunning, activity]);

  const clearConsole = useCallback(() => {
    onClear(); setEvents([]);
    appendEvent("success", "Session cleared. Console ready.");
    inputRef.current?.focus();
  }, [appendEvent, onClear]);

  const exportTranscript = useCallback(() => {
    const parts = [
      "# NOXEN Console transcript", "Exported: " + new Date().toLocaleString(), "",
      ...events.map(event => "[" + formatTime(event.at) + "] " + event.text), "",
      ...messages.map(message => message.role === "user"
        ? "## INPUT\n\n" + message.text
        : "## OUTPUT · " + displayModel(message.model) + (message.latencyMs ? " · " + message.latencyMs + " ms" : "") + "\n\n" + message.text)
    ];
    const blob = new Blob([parts.join("\n\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "noxen-console-" + new Date().toISOString().replace(/[:.]/g, "-") + ".md";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    appendEvent("success", "Transcript exported as Markdown.");
  }, [appendEvent, events, messages]);

  const runBenchmark = useCallback(async (prompt: string) => {
    const available = models.filter(model => !model.locked);
    if (!available.length) { appendEvent("warning", "No available models were found."); return; }
    benchmarkCancelRef.current = false; setBenchmarkRunning(true);
    appendEvent("system", "Benchmark started · " + available.length + " available models · sequential execution.");
    try {
      for (let index = 0; index < available.length; index += 1) {
        if (benchmarkCancelRef.current) break;
        const model = available[index];
        appendEvent("command", "BENCH " + (index + 1) + "/" + available.length + " · " + model.label);
        await onRun(prompt, { modelOverride: model.name, isolateHistory: true, displayInput: "/bench · " + model.label + " · " + prompt });
      }
      appendEvent(benchmarkCancelRef.current ? "warning" : "success",
        benchmarkCancelRef.current ? "Benchmark interrupted." : "Benchmark complete. Compare model labels and latency above.");
    } finally {
      setBenchmarkRunning(false); benchmarkCancelRef.current = false; inputRef.current?.focus();
    }
  }, [appendEvent, models, onRun]);

  const execute = useCallback(async (raw: string) => {
    const line = raw.trim();
    if (!line || ((running || benchmarkRunning) && line.toLowerCase() !== "/stop")) return;
    if (historyRef.current[historyRef.current.length - 1] !== line) historyRef.current = [...historyRef.current, line].slice(-40);
    historyIndexRef.current = -1; setInput(""); appendEvent("command", "$ " + line);
    if (!line.startsWith("/")) {
      appendEvent("system", "Dispatching through the live NOXEN chat endpoint.");
      await onRun(line); return;
    }
    const firstSpace = line.indexOf(" ");
    const command = (firstSpace < 0 ? line : line.slice(0, firstSpace)).toLowerCase();
    const argument = firstSpace < 0 ? "" : line.slice(firstSpace + 1).trim();
    switch (command) {
      case "/help":
      case "/?":
        appendEvent("system", [
          "NOXEN CONSOLE · QUICK START", "",
          "1. /ping — check a real model reply and latency.",
          "2. /models then /model nova — choose a model.",
          "3. Type a normal prompt — chat with that model.",
          "4. /research <question> — model answer with web search.",
          "5. /bench <same prompt> — compare all available models.",
          "6. /inspect <url> or /reverse <url> — inspect public websites.", "",
          "COMMAND MANUAL", COMMANDS.map(([name, description]) => name.padEnd(28) + " " + description).join("\n"), "",
          "Media generation needs --confirm because configured providers may consume credits. This separate session has no private memories, plugins, Studio Plus owner access or operating-system shell."
        ].join("\n"));
        return;
      case "/ping":
        appendEvent("system", "Sending a minimal live inference request to " + displayModel(selectedModel) + ".");
        await onRun("Reply with exactly PONG. This is a NOXEN Console connection test.", { isolateHistory: true, displayInput: "/ping · live inference probe" });
        appendEvent("success", "Probe completed. Check the response label and latency.");
        return;
      case "/status": {
        const latencies = messages.filter(message => message.role === "assistant" && typeof message.latencyMs === "number").map(message => message.latencyMs as number);
        const average = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) + " ms" : "NOT AVAILABLE";
        appendEvent("success", [
          "NETWORK: " + (isOnline ? "ONLINE" : "OFFLINE"),
          "NOXEN BACKEND: " + backendState.toUpperCase().replace("-", " "),
          "SELECTED MODEL: " + displayModel(selectedModel),
          "ROUTING: " + (autoModelRouting ? "AUTOMATIC" : "MANUAL"),
          "RUN STATE: " + (running || benchmarkRunning ? "BUSY" : "READY"),
          "MODEL RESPONSES: " + messages.filter(message => message.role === "assistant").length,
          "AVERAGE LATENCY: " + average,
          "BENCHMARK: " + (benchmarkRunning ? "ACTIVE" : "IDLE"),
          "SESSION: LOCAL · " + messages.length + " TRANSCRIPT ENTRIES"
        ].join("\n"));
        return;
      }
      case "/capabilities":
        appendEvent("system", [
          "NOXEN LIVE CAPABILITY REGISTRY", "",
          "MODEL INFERENCE     /ping · normal prompts",
          "MODEL COMPARISON    /bench · sequential requests",
          "WEB RESEARCH        /research · model answer + live search",
          "WEB SEARCH          /search · direct result list",
          "YOUTUBE             /youtube · public search + metadata",
          "SITE INSPECTOR      /inspect · public page and interface inventory",
          "SITE MAPPER         /reverse · multi-page public inspection",
          "CODING / WRITING    /code /write",
          "LEARNING / DATA     /study /data",
          "BRAINSTORMING       /ideas",
          "MEDIA               /image /video /audio /3d · --confirm required", "",
          "Not connected: private memory, account plugins, Studio Plus owner session, local files and host shell."
        ].join("\n"));
        return;
      case "/version":
        appendEvent("success", "NOXEN CONSOLE LAB v1.2\nLIVE API ROUTES · LOCAL TRANSCRIPT · TERMINAL COMMANDS");
        return;
      case "/history": {
        const recent = messages.slice(-12);
        appendEvent("system", "RECENT SESSION OUTPUT\n" + (recent.length ? recent.map((message, index) =>
          (index + 1) + ". " + message.role.toUpperCase() + (message.model ? " [" + displayModel(message.model) + "]" : "") + " · " + message.text.replace(/\s+/g, " ").slice(0, 180)
        ).join("\n") : "No model requests in this session yet."));
        return;
      }
      case "/models":
        appendEvent("system", "MODEL REGISTRY\n" + models.map(model =>
          (model.locked ? "[LOCKED] " : "[AVAILABLE] ") + model.label + " · " + model.name + "\n  " + model.description
        ).join("\n"));
        return;
      case "/model": {
        if (!argument) { appendEvent("warning", "Usage: /model <core|nova|swift|studio>. Example: /model nova"); return; }
        const target = argument.toLowerCase().replace(/^noxen\s+/, "").trim();
        const aliases: Record<string, string> = {
          core: "NOXEN Core 1.0", "core 1.0": "NOXEN Core 1.0",
          nova: "NOXEN Core 1.5", "core 1.5": "NOXEN Core 1.5",
          swift: "NOXEN Swift", studio: "NOXEN Studio", "studio plus": "NOXEN Studio Plus"
        };
        const model = models.find(item => item.name.toLowerCase() === target || item.label.toLowerCase() === target) || models.find(item => item.name === aliases[target]);
        if (!model) { appendEvent("warning", "Unknown model. Use /models to list options."); return; }
        if (model.locked) { appendEvent("warning", "Studio Plus requires the verified owner session on the main NOXEN site."); return; }
        onModelChange(model.name); onAutoModelRoutingChange(false);
        appendEvent("success", "Selected model: " + model.label + ". Auto routing is off.");
        return;
      }
      case "/auto": {
        const value = argument.toLowerCase();
        if (value !== "on" && value !== "off") { appendEvent("warning", "Usage: /auto on or /auto off"); return; }
        onAutoModelRoutingChange(value === "on");
        appendEvent("success", "Automatic model routing " + (value === "on" ? "enabled." : "disabled."));
        return;
      }
      case "/bench":
        if (!argument) { appendEvent("warning", "Usage: /bench <prompt>"); return; }
        await runBenchmark(argument);
        return;
      case "/research":
      case "/code":
      case "/write":
      case "/study":
      case "/data":
      case "/ideas": {
        if (!argument) { appendEvent("warning", "Add a prompt after " + command + "."); return; }
        const profile = command.slice(1);
        appendEvent("system", "Dispatching to NOXEN with the " + profile + " profile.");
        await onRun(argument, { toolOverride: profile, displayInput: line });
        appendEvent("success", "Profile request returned.");
        return;
      }
      case "/search":
        if (!argument) { appendEvent("warning", "Usage: /search <query>"); return; }
        appendEvent("system", "Calling NOXEN's standalone web-search endpoint.");
        await onRun(argument, { toolOverride: "search", isolateHistory: true, displayInput: line });
        appendEvent("success", "Search request returned.");
        return;
      case "/youtube":
        if (!argument) { appendEvent("warning", "Usage: /youtube <query>"); return; }
        appendEvent("system", "Calling NOXEN YouTube search and public metadata lookup.");
        await onRun(argument, { toolOverride: "youtube", isolateHistory: true, displayInput: line });
        appendEvent("success", "YouTube lookup returned.");
        return;
      case "/inspect":
      case "/reverse": {
        if (!/^https?:\/\//i.test(argument) && !/^[\w.-]+\.[a-z]{2,}/i.test(argument)) {
          appendEvent("warning", "Usage: " + command + " <public URL>"); return;
        }
        const tool = command === "/inspect" ? "inspect" : "reverse";
        appendEvent("system", tool === "inspect" ? "Running the public-page inspector." : "Mapping multiple public pages.");
        await onRun(argument, { toolOverride: tool, isolateHistory: true, displayInput: line });
        appendEvent("success", tool === "inspect" ? "Website inspection finished." : "Website map report returned.");
        return;
      }
      case "/image":
      case "/video":
      case "/audio":
      case "/3d": {
        if (!argument.startsWith("--confirm ")) {
          appendEvent("warning", "MEDIA GENERATION MAY USE PROVIDER CREDITS. Re-run as " + command + " --confirm <description>.");
          return;
        }
        const prompt = argument.slice("--confirm ".length).trim();
        if (!prompt) { appendEvent("warning", "Add a description after --confirm."); return; }
        const tool = command.slice(1);
        appendEvent("system", "Explicit confirmation received · requesting " + tool + " generation.");
        await onRun(prompt, { toolOverride: tool, isolateHistory: true, displayInput: command + " " + prompt });
        appendEvent("success", "Media request returned.");
        return;
      }
      case "/export":
        exportTranscript();
        return;
      case "/clear":
      case "/cls":
      case "/new":
        clearConsole();
        return;
      case "/stop":
        benchmarkCancelRef.current = true; onStop();
        appendEvent("warning", "Interrupt signal sent.");
        return;
      default:
        appendEvent("warning", "Unknown command: " + command + ". Type /help. Shell commands are not available.");
        return;
    }
  }, [
    appendEvent, autoModelRouting, backendState, benchmarkRunning, clearConsole, exportTranscript,
    isOnline, messages, models, onAutoModelRoutingChange, onModelChange, onRun, onStop,
    running, runBenchmark, selectedModel
  ]);

  const busy = running || benchmarkRunning;
  const submit = (event: React.FormEvent) => { event.preventDefault(); void execute(input); };
  return (
    <section className="content-page noxen-console-page" aria-label="NOXEN Console">
      <div className="noxen-console-heading">
        <div>
          <span className="noxen-console-eyebrow"><Terminal size={14} /> NOXEN DEVELOPER WORKSPACE</span>
          <h1>Console<span>.</span></h1>
          <p>Live model inference, tool commands, benchmarks and response inspection.</p>
        </div>
        <div className="noxen-console-heading-actions">
          <span className={"noxen-console-status " + (backendState === "connected" ? "online" : backendState === "error" ? "offline" : "testing")}>
            {backendState === "connected" ? <Wifi size={14} /> : backendState === "error" ? <WifiOff size={14} /> : <Radio size={14} />}
            {backendState === "connected" ? "BACKEND READY" : backendState === "error" ? "API ERROR" : isOnline ? "NOT PROBED" : "OFFLINE"}
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
            <span className="noxen-console-toggle" /><span>AUTO ROUTE</span>
          </label>
          <div className="noxen-console-toolbar-meta">
            <span><Radio size={12} /> {busy ? "BUSY" : "READY"}</span>
            <span><Bot size={12} /> {messages.length} MSG</span>
          </div>
        </div>
        <div className="noxen-console-quickbar" aria-label="Quick commands">
          <button type="button" onClick={() => setInput("/ping")}><Radio size={13} /> Ping</button>
          <button type="button" onClick={() => setInput("/research ")}><Search size={13} /> Research</button>
          <button type="button" onClick={() => setInput("/youtube ")}><Activity size={13} /> YouTube</button>
          <button type="button" onClick={() => setInput("/inspect ")}><ShieldCheck size={13} /> Inspect</button>
          <button type="button" onClick={() => setInput("/bench ")}><Cpu size={13} /> Benchmark</button>
          <button type="button" onClick={() => setInput("/help")}><CircleHelp size={13} /> Help</button>
        </div>
        {input.startsWith("/") && !input.includes(" ") && (
          <div className="noxen-console-suggestions" aria-label="Command suggestions">
            {COMMANDS.filter(([name]) => name.toLowerCase().startsWith(input.toLowerCase())).slice(0, 6).map(([name, description]) => (
              <button type="button" key={name} onClick={() => { setInput(name.split(" ")[0] + " "); inputRef.current?.focus(); }}>
                <code>{name}</code><span>{description}</span>
              </button>
            ))}
          </div>
        )}
        <div className="noxen-console-output" ref={outputRef} role="log" aria-live="polite" aria-label="Console output">
          <div className="noxen-console-welcome">
            <div className="noxen-console-welcome-mark"><Terminal size={18} /></div>
            <div><strong>NOXEN CONSOLE <span>v1.2</span></strong><p>Live model runtime · tool dispatch · response inspection</p></div>
          </div>
          {events.map(event => (
            <div className={"noxen-console-event " + event.kind} key={event.id}>
              <span className="noxen-console-event-time">{formatTime(event.at)}</span><pre>{event.text}</pre>
            </div>
          ))}
          {messages.map((message, index) => (
            <article className={"noxen-console-entry " + message.role} key={index}>
              {message.role === "user" ? (
                <><div className="noxen-console-entry-label"><span className="noxen-console-prompt-symbol">$</span> INPUT <small>{index + 1}</small></div><pre className="noxen-console-user-input">{message.text}</pre></>
              ) : (
                <>
                  <div className="noxen-console-entry-label">
                    <span className="noxen-console-output-symbol">›</span> NOXEN OUTPUT
                    <span className="noxen-console-model-tag">{displayModel(message.model)}</span>
                    {typeof message.latencyMs === "number" && <small className="noxen-console-latency">{message.latencyMs.toLocaleString()} ms</small>}
                  </div>
                  <div className="noxen-console-markdown markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>
                  {message.mediaUrl && message.mediaKind === "image" && <img className="noxen-console-media-image" src={message.mediaUrl} alt={message.mediaName || "Generated by NOXEN"} />}
                  {message.mediaUrl && message.mediaKind === "video" && <video className="noxen-console-media-video" src={message.mediaUrl} controls playsInline />}
                  {message.mediaUrl && message.mediaKind === "audio" && <audio className="noxen-console-media-audio" src={message.mediaUrl} controls />}
                  {message.mediaUrl && message.mediaKind === "3d" && <a className="noxen-console-download" href={message.mediaUrl} download={message.mediaName || "noxen-generated.glb"}>Download generated 3D asset · GLB</a>}
                  {message.provider && <small className="noxen-console-provider">Provider route · {message.provider}</small>}
                </>
              )}
            </article>
          ))}
          {activity && <div className="noxen-console-working"><LoaderCircle size={15} className="noxen-console-spin" /><span>{activity}</span>{benchmarkRunning && <small>BENCHMARK RUNNING</small>}</div>}
          {!events.length && !messages.length && !activity && <div className="noxen-console-empty"><span>NO OUTPUT YET</span><p>Enter a prompt or type <code>/help</code> to begin.</p></div>}
          <div className="noxen-console-cursor-line" aria-hidden="true"><span>›</span><i /></div>
        </div>
        <form className="noxen-console-input-area" onSubmit={submit}>
          <div className="noxen-console-input-prefix"><span>noxen</span><b>›</b></div>
          <textarea
            ref={inputRef} value={input} onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.ctrlKey && event.key.toLowerCase() === "l") { event.preventDefault(); clearConsole(); return; }
              if (event.ctrlKey && event.key.toLowerCase() === "c") {
                event.preventDefault();
                if (busy) { benchmarkCancelRef.current = true; onStop(); appendEvent("warning", "Interrupt signal sent."); }
                else setInput("");
                return;
              }
              if (event.key === "Tab" && input.startsWith("/") && !input.includes(" ")) {
                const match = COMMANDS.find(([name]) => name.toLowerCase().startsWith(input.toLowerCase()));
                if (match) { event.preventDefault(); setInput(match[0].split(" ")[0] + " "); }
                return;
              }
              if (event.key === "ArrowUp" && !event.shiftKey && inputRef.current?.selectionStart === 0) {
                if (historyRef.current.length) {
                  event.preventDefault();
                  historyIndexRef.current = Math.min(historyRef.current.length - 1, historyIndexRef.current < 0 ? historyRef.current.length - 1 : historyIndexRef.current + 1);
                  setInput(historyRef.current[historyIndexRef.current]);
                }
                return;
              }
              if (event.key === "ArrowDown" && !event.shiftKey && inputRef.current?.selectionStart === input.length) {
                if (historyIndexRef.current >= 0) {
                  event.preventDefault(); historyIndexRef.current -= 1;
                  setInput(historyIndexRef.current >= 0 ? historyRef.current[historyIndexRef.current] : "");
                }
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!busy) void execute(input); }
            }}
            rows={2} spellCheck={false} autoCapitalize="off" autoCorrect="off"
            aria-label="Console command or prompt"
            placeholder={busy ? "NOXEN is processing your request…" : "Enter a prompt or command…  ·  /help"}
          />
          {busy
            ? <button type="button" className="noxen-console-run-button stop" onClick={() => { benchmarkCancelRef.current = true; onStop(); appendEvent("warning", "Stop signal sent."); }} aria-label="Stop current run" title="Stop current run"><Square size={15} fill="currentColor" /></button>
            : <button type="submit" className="noxen-console-run-button" disabled={!input.trim()} aria-label="Run command" title="Run command"><Play size={15} fill="currentColor" /></button>}
        </form>
        <div className="noxen-console-footer">
          <span><ShieldCheck size={12} /> APP COMMANDS ONLY · HOST SHELL DISABLED</span>
          <span><Zap size={12} /> {autoModelRouting ? "AUTO ROUTE" : "MANUAL"} · {displayModel(selectedModel).toUpperCase()} · ↑ HISTORY · TAB COMPLETE</span>
        </div>
      </div>
      <div className="noxen-console-command-help">
        <div className="noxen-console-command-help-title"><Command size={15} /> COMMAND QUICK REFERENCE</div>
        <div className="noxen-console-command-grid">
          {[
            ["/ping", "Check that a real model answers"],
            ["/research", "Ask a model with live web search"],
            ["/search", "Return direct web results"],
            ["/youtube", "Find a public YouTube video"],
            ["/inspect", "Inspect a public webpage"],
            ["/reverse", "Map a website's public pages"],
            ["/bench", "Compare model responses"],
            ["/capabilities", "Show every connected capability"]
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
