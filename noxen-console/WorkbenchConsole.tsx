import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity, ArrowUpRight, Bot, CircleHelp, Code2, Command, Cpu, Download,
  LoaderCircle, Play, Radio, Search, ShieldCheck, Square, Terminal, Trash2,
  Wifi, WifiOff, Zap
} from "lucide-react";
import "./workbench-console.css";

export type ConsoleRunOptions = {
  modelOverride?: string;
  isolateHistory?: boolean;
  toolOverride?: string;
};

type ConsoleMessage = {
  role: "user" | "assistant";
  text: string;
  model?: string;
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

export type StudioPlusArenaModelResult = {
  ok: boolean;
  model: string;
  answer?: string;
  provider?: string;
  durationMs?: number;
  error?: string;
};

export type StudioPlusArenaResult = {
  original: StudioPlusArenaModelResult;
  v2: StudioPlusArenaModelResult;
};

type Props = {
  messages: ConsoleMessage[];
  models: ConsoleModel[];
  selectedModel: string;
  autoModelRouting: boolean;
  isOnline: boolean;
  running: boolean;
  activity: string | null;
  onModelChange: (model: string) => void;
  onAutoModelRoutingChange: (enabled: boolean) => void;
  onRun: (prompt: string, options?: ConsoleRunOptions) => Promise<void>;
  onRunStudioPlusArena?: (prompt: string, signal: AbortSignal) => Promise<StudioPlusArenaResult>;
  onStop: () => void;
  onClear: () => void;
};

const COMMANDS = [
  ["/help", "Show available console commands"],
  ["/status", "Show connection, routing, and session status"],
  ["/models", "List model options and access"],
  ["/model <name>", "Select Core, Nova, Swift, Studio, or Studio Plus"],
  ["/auto on|off", "Toggle automatic model routing"],
  ["/research <prompt>", "Run a request with the web-research tool"],
  ["/code <prompt>", "Run a coding-focused request"],
  ["/write <prompt>", "Run a writing-focused request"],
  ["/study <prompt>", "Run a study-focused request"],
  ["/data <prompt>", "Run a data-focused request"],
  ["/ideas <prompt>", "Run a brainstorming request"],
  ["/youtube <query>", "Search for YouTube videos"],
  ["/inspect <url>", "Inspect a public website"],
  ["/reverse <url>", "Build a read-only public-site reconstruction report"],
  ["/image <prompt>", "Generate an image through NOXEN"],
  ["/bench <prompt>", "Run the same prompt across available models, one at a time"],
  ["/arena <prompt>", "Compare Studio Plus and Studio Plus V2 side by side on the same prompt"],
  ["/export", "Download this console transcript as Markdown"],
  ["/clear", "Clear the console transcript"],
  ["/stop", "Stop the current response or benchmark"]
] as const;

function displayModel(model?: string) {
  return String(model || "NOXEN").replace(/^NOXEN\s+/i, "");
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function WorkbenchConsole({
  messages,
  models,
  selectedModel,
  autoModelRouting,
  isOnline,
  running,
  activity,
  onModelChange,
  onAutoModelRoutingChange,
  onRun,
  onRunStudioPlusArena,
  onStop,
  onClear
}: Props) {
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<ConsoleEvent[]>([
    { id: 1, kind: "system", text: "NOXEN Console initialized. Type /help to inspect available commands.", at: Date.now() }
  ]);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [arenaOpen, setArenaOpen] = useState(false);
  const [arenaPrompt, setArenaPrompt] = useState("");
  const [arenaRunning, setArenaRunning] = useState(false);
  const [arenaResults, setArenaResults] = useState<StudioPlusArenaResult | null>(null);
  const [arenaError, setArenaError] = useState("");
  const arenaControllerRef = useRef<AbortController | null>(null);
  const benchmarkCancelRef = useRef(false);
  const eventIdRef = useRef(2);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const appendEvent = useCallback((kind: ConsoleEvent["kind"], text: string) => {
    const event = { id: eventIdRef.current++, kind, text, at: Date.now() };
    setEvents(previous => [...previous.slice(-48), event]);
  }, []);

  useEffect(() => {
    const output = outputRef.current;
    if (!output) return;
    output.scrollTop = output.scrollHeight;
  }, [messages.length, events.length, running, benchmarkRunning, arenaRunning, arenaResults, activity]);

  useEffect(() => () => {
    arenaControllerRef.current?.abort();
  }, []);

  const clearConsole = useCallback(() => {
    arenaControllerRef.current?.abort();
    arenaControllerRef.current = null;
    setArenaRunning(false);
    setArenaResults(null);
    setArenaError("");
    onClear();
    setEvents([]);
    appendEvent("success", "Transcript cleared. Console session is ready.");
    inputRef.current?.focus();
  }, [appendEvent, onClear]);

  const exportTranscript = useCallback(() => {
    const sections = [
      "# NOXEN Console transcript",
      "",
      "Exported: " + new Date().toLocaleString(),
      "",
      ...events.map(event => "[" + formatTime(event.at) + "] " + event.text),
      "",
      ...messages.map(message => message.role === "user"
        ? "## COMMAND / INPUT\n\n" + message.text
        : "## NOXEN OUTPUT · " + displayModel(message.model) + "\n\n" + message.text)
    ];
    const blob = new Blob([sections.join("\n\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "noxen-console-" + new Date().toISOString().replace(/[:.]/g, "-") + ".md";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    appendEvent("success", "Transcript export created as a Markdown file.");
  }, [appendEvent, events, messages]);

  const runModelBenchmark = useCallback(async (prompt: string) => {
    const available = models.filter(model => !model.locked);
    if (!available.length) {
      appendEvent("warning", "No available models were found for this benchmark.");
      return;
    }
    benchmarkCancelRef.current = false;
    setBenchmarkRunning(true);
    appendEvent("system", "Benchmark started · " + available.length + " model(s) · sequential execution");
    try {
      for (let index = 0; index < available.length; index += 1) {
        if (benchmarkCancelRef.current) break;
        const model = available[index];
        appendEvent("command", "BENCH " + (index + 1) + "/" + available.length + " · " + model.label);
        await onRun(prompt, {
          modelOverride: model.name,
          isolateHistory: true,
          toolOverride: "none"
        });
        if (benchmarkCancelRef.current) break;
      }
      appendEvent(benchmarkCancelRef.current ? "warning" : "success",
        benchmarkCancelRef.current ? "Benchmark stopped by user." : "Benchmark completed. Compare the model-labelled responses above.");
    } finally {
      setBenchmarkRunning(false);
      benchmarkCancelRef.current = false;
      inputRef.current?.focus();
    }
  }, [appendEvent, models, onRun]);

  const runStudioPlusArena = useCallback(async (prompt: string) => {
    const text = prompt.trim();
    setArenaOpen(true);
    if (!text) {
      appendEvent("warning", "ARENA USAGE · enter one prompt to send to both Studio Plus models.");
      return;
    }
    setArenaPrompt(text);
    setArenaResults(null);
    setArenaError("");
    if (!onRunStudioPlusArena) {
      const message = "Arena dispatch is not connected. The host must provide onRunStudioPlusArena so both models can be called securely.";
      setArenaError(message);
      appendEvent("warning", message);
      return;
    }

    const controller = new AbortController();
    arenaControllerRef.current?.abort();
    arenaControllerRef.current = controller;
    setArenaRunning(true);
    appendEvent("system", "STUDIO PLUS ARENA STARTED · same prompt · parallel execution · isolated context");
    try {
      const result = await onRunStudioPlusArena(text, controller.signal);
      if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      setArenaResults(result);
      const passed = Number(result.original?.ok) + Number(result.v2?.ok);
      appendEvent(
        passed === 2 ? "success" : "warning",
        "ARENA FINISHED · " + passed + "/2 responses received. Compare the two panels below."
      );
    } catch (error) {
      const cancelled = error instanceof Error && error.name === "AbortError";
      const detail = error instanceof Error ? error.message : "Unknown Arena error.";
      setArenaError(cancelled ? "Comparison stopped." : detail);
      appendEvent("warning", cancelled ? "ARENA CANCELLED." : "ARENA FAILED · " + detail);
    } finally {
      if (arenaControllerRef.current === controller) {
        arenaControllerRef.current = null;
        setArenaRunning(false);
      }
      inputRef.current?.focus();
    }
  }, [appendEvent, onRunStudioPlusArena]);

  const execute = useCallback(async (raw: string) => {
    const line = raw.trim();
    if (!line || ((running || benchmarkRunning) && line.toLowerCase() !== "/stop")) return;
    setInput("");
    appendEvent("command", "$ " + line);

    if (!line.startsWith("/")) {
      appendEvent("system", "Dispatching request through the standard NOXEN response pipeline.");
      await onRun(line, { toolOverride: "none" });
      appendEvent("success", "Request returned. See the model-labelled response in the output stream.");
      return;
    }

    const firstSpace = line.indexOf(" ");
    const command = (firstSpace < 0 ? line : line.slice(0, firstSpace)).toLowerCase();
    const argument = firstSpace < 0 ? "" : line.slice(firstSpace + 1).trim();

    switch (command) {
      case "/help":
      case "/?":
        appendEvent("system", "AVAILABLE COMMANDS\n" + COMMANDS.map(([name, description]) => name.padEnd(25) + " " + description).join("\n") + "\n\nCommands are NOXEN app actions. Arbitrary operating-system shell commands are not executed.");
        return;
      case "/status":
        appendEvent("success", [
          "CONNECTION: " + (isOnline ? "ONLINE" : "OFFLINE"),
          "SELECTED MODEL: " + displayModel(selectedModel),
          "ROUTING: " + (autoModelRouting ? "AUTOMATIC" : "MANUAL"),
          "RUN STATE: " + (running || benchmarkRunning ? "BUSY" : "READY"),
          "TRANSCRIPT MESSAGES: " + messages.length,
          "BENCHMARK: " + (benchmarkRunning ? "ACTIVE" : "IDLE")
        ].join("\n"));
        return;
      case "/models":
        appendEvent("system", "MODEL REGISTRY\n" + models.map(model =>
          (model.locked ? "[LOCKED] " : "[READY]  ") + model.label + " · " + model.name + "\n          " + model.description
        ).join("\n"));
        return;
      case "/model": {
        if (!argument) {
          appendEvent("warning", "Usage: /model <name>. Example: /model nova");
          return;
        }
        const target = argument.toLowerCase().replace(/^noxen\s+/, "").trim();
        const aliases: Record<string, string> = {
          core: "NOXEN Core 1.0",
          "core 1.0": "NOXEN Core 1.0",
          "nova": "NOXEN Core 1.5",
          "core 1.5": "NOXEN Core 1.5",
          swift: "NOXEN Swift",
          studio: "NOXEN Studio",
          "studio plus": "NOXEN Studio Plus"
        };
        const model = models.find(item => item.name.toLowerCase() === target || item.label.toLowerCase() === target)
          || models.find(item => item.name === aliases[target]);
        if (!model) {
          appendEvent("warning", "Unknown model. Use /models to list the available names.");
          return;
        }
        if (model.locked) {
          appendEvent("warning", model.label + " is unavailable for this account.");
          return;
        }
        onModelChange(model.name);
        onAutoModelRoutingChange(false);
        appendEvent("success", "Manual model selected: " + model.label + ". Automatic routing is now off.");
        return;
      }
      case "/auto": {
        const value = argument.toLowerCase();
        if (value !== "on" && value !== "off") {
          appendEvent("warning", "Usage: /auto on  or  /auto off");
          return;
        }
        onAutoModelRoutingChange(value === "on");
        appendEvent("success", "Automatic model routing " + (value === "on" ? "enabled." : "disabled."));
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
      case "/stop":
        benchmarkCancelRef.current = true;
        arenaControllerRef.current?.abort();
        onStop();
        appendEvent("warning", "Stop signal sent.");
        return;
      case "/arena":
        if (!argument) {
          setArenaOpen(true);
          appendEvent("system", "STUDIO PLUS ARENA · enter one prompt in the Arena panel, then run both models together.");
          return;
        }
        await runStudioPlusArena(argument);
        return;
      case "/bench":
        if (!argument) {
          appendEvent("warning", "Usage: /bench <prompt>. This runs sequentially across available models.");
          return;
        }
        await runModelBenchmark(argument);
        return;
      case "/research":
      case "/code":
      case "/write":
      case "/study":
      case "/data":
      case "/ideas": {
        if (!argument) {
          appendEvent("warning", "Add a prompt after " + command + ".");
          return;
        }
        const tool = command === "/research" ? "web" : command.slice(1);
        appendEvent("system", "Dispatching with the " + tool + " tool profile.");
        await onRun(argument, { toolOverride: tool });
        appendEvent("success", "Tool request returned. Inspect the response above.");
        return;
      }
      case "/youtube":
        if (!argument) {
          appendEvent("warning", "Usage: /youtube <search query>");
          return;
        }
        await onRun("Search YouTube for " + argument + " videos", { toolOverride: "none" });
        appendEvent("success", "YouTube search request returned.");
        return;
      case "/inspect":
        if (!/^https?:\/\//i.test(argument) && !/^[\w.-]+\.[a-z]{2,}/i.test(argument)) {
          appendEvent("warning", "Usage: /inspect <public URL>");
          return;
        }
        await onRun("Inspect this website: " + argument, { toolOverride: "none" });
        appendEvent("success", "Website inspection request returned.");
        return;
      case "/reverse":
        if (!/^https?:\/\//i.test(argument) && !/^[\w.-]+\.[a-z]{2,}/i.test(argument)) {
          appendEvent("warning", "Usage: /reverse <public URL>");
          return;
        }
        await onRun("Reverse engineer this public website: " + argument, { toolOverride: "none" });
        appendEvent("success", "Read-only website reconstruction request returned.");
        return;
      case "/image":
        if (!argument) {
          appendEvent("warning", "Usage: /image <description>");
          return;
        }
        await onRun("Generate an image showing " + argument, { toolOverride: "none" });
        appendEvent("success", "Image generation request returned.");
        return;
      default:
        appendEvent("warning", "Unknown command: " + command + ". Type /help to see the command registry. Shell commands are not available in this console.");
        return;
    }
  }, [
    appendEvent, autoModelRouting, benchmarkRunning, clearConsole, exportTranscript,
    isOnline, messages.length, models, onAutoModelRoutingChange, onModelChange,
    onRun, onStop, running, runModelBenchmark, runStudioPlusArena, selectedModel
  ]);

  const busy = running || benchmarkRunning || arenaRunning;
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
          <p>A terminal-style surface for running NOXEN models, tools, and controlled benchmarks.</p>
        </div>
        <div className="noxen-console-heading-actions">
          <span className={"noxen-console-status " + (isOnline ? "online" : "offline")}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline ? "ONLINE" : "OFFLINE"}
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
          </div>
        </div>

        <div className="noxen-console-quickbar" aria-label="Quick commands">
          <button type="button" onClick={() => setInput("/help")}><CircleHelp size={13} /> Help</button>
          <button type="button" onClick={() => setInput("/research ")}><Search size={13} /> Research</button>
          <button type="button" onClick={() => setInput("/code ")}><Code2 size={13} /> Code</button>
          <button type="button" onClick={() => setInput("/bench ")}><Activity size={13} /> Benchmark</button>
          <button type="button" onClick={() => setInput("/models")}><Cpu size={13} /> Models</button>
          <button type="button" className={arenaOpen ? "active" : ""} onClick={() => setArenaOpen(value => !value)}><Activity size={13} /> Studio Plus Arena</button>
        </div>

        {arenaOpen && (
          <section className="noxen-console-arena" aria-label="Studio Plus model comparison">
            <div className="noxen-console-arena-heading">
              <div>
                <span className="noxen-console-arena-eyebrow">PARALLEL MODEL TEST</span>
                <h2>Studio Plus Arena<span>.</span></h2>
                <p>One prompt is sent to both models at the same time. Each answer is shown independently.</p>
              </div>
              <button type="button" className="noxen-console-arena-close" onClick={() => setArenaOpen(false)} disabled={arenaRunning}>Close</button>
            </div>

            <form className="noxen-console-arena-form" onSubmit={event => { event.preventDefault(); void runStudioPlusArena(arenaPrompt); }}>
              <label htmlFor="noxen-studio-arena-prompt">SHARED PROMPT</label>
              <textarea
                id="noxen-studio-arena-prompt"
                value={arenaPrompt}
                onChange={event => setArenaPrompt(event.target.value)}
                placeholder="Enter one prompt for both Studio Plus models…"
                rows={3}
                maxLength={12000}
                disabled={arenaRunning}
              />
              <div className="noxen-console-arena-form-footer">
                <span>{onRunStudioPlusArena ? "Both model calls use the same prompt and isolated context." : "Connect the secure Arena runner in the host app to enable model execution."}</span>
                {arenaRunning ? (
                  <button type="button" className="noxen-console-arena-run stop" onClick={() => {
                    arenaControllerRef.current?.abort();
                    onStop();
                  }}><Square size={14} /> Stop comparison</button>
                ) : (
                  <button type="submit" className="noxen-console-arena-run" disabled={!arenaPrompt.trim() || !onRunStudioPlusArena}>
                    <Play size={14} fill="currentColor" /> Run both models
                  </button>
                )}
              </div>
            </form>

            {arenaError && <div className="noxen-console-arena-error" role="alert">{arenaError}</div>}

            <div className="noxen-console-arena-grid" aria-live="polite">
              <article className="noxen-console-arena-card">
                <div className="noxen-console-arena-card-head">
                  <div><h3>Studio Plus</h3><p>Existing NOXEN route · AirLLM</p></div>
                  <span className={"noxen-console-arena-state " + (arenaRunning ? "running" : arenaResults?.original?.ok ? "success" : arenaResults ? "failed" : "idle")}>
                    {arenaRunning ? "RUNNING" : arenaResults ? (arenaResults.original?.ok ? "COMPLETE" : "FAILED") : "READY"}
                  </span>
                </div>
                {arenaResults?.original?.provider && <div className="noxen-console-arena-meta">PROVIDER · {arenaResults.original.provider}</div>}
                {arenaResults?.original?.durationMs !== undefined && <div className="noxen-console-arena-meta">TIME · {arenaResults.original.durationMs} ms</div>}
                {arenaResults ? (
                  arenaResults.original?.ok ? (
                    <div className="noxen-console-markdown noxen-console-arena-answer"><ReactMarkdown remarkPlugins={[remarkGfm]}>{arenaResults.original.answer || "The model returned an empty answer."}</ReactMarkdown></div>
                  ) : <p className="noxen-console-arena-failure">{arenaResults.original?.error || "Studio Plus did not return a response."}</p>
                ) : <p className="noxen-console-arena-placeholder">{arenaRunning ? "Waiting for the original Studio Plus route…" : "The original Studio Plus answer will appear here."}</p>}
              </article>

              <article className="noxen-console-arena-card">
                <div className="noxen-console-arena-card-head">
                  <div><h3>Studio Plus V2</h3><p>Kimi K3.1 Pro</p></div>
                  <span className={"noxen-console-arena-state " + (arenaRunning ? "running" : arenaResults?.v2?.ok ? "success" : arenaResults ? "failed" : "idle")}>
                    {arenaRunning ? "RUNNING" : arenaResults ? (arenaResults.v2?.ok ? "COMPLETE" : "FAILED") : "READY"}
                  </span>
                </div>
                {arenaResults?.v2?.provider && <div className="noxen-console-arena-meta">PROVIDER · {arenaResults.v2.provider}</div>}
                {arenaResults?.v2?.durationMs !== undefined && <div className="noxen-console-arena-meta">TIME · {arenaResults.v2.durationMs} ms</div>}
                {arenaResults ? (
                  arenaResults.v2?.ok ? (
                    <div className="noxen-console-markdown noxen-console-arena-answer"><ReactMarkdown remarkPlugins={[remarkGfm]}>{arenaResults.v2.answer || "The model returned an empty answer."}</ReactMarkdown></div>
                  ) : <p className="noxen-console-arena-failure">{arenaResults.v2?.error || "Studio Plus V2 did not return a response."}</p>
                ) : <p className="noxen-console-arena-placeholder">{arenaRunning ? "Waiting for Studio Plus V2 / Kimi…" : "The Studio Plus V2 answer will appear here."}</p>}
              </article>
            </div>
          </section>
        )}

        <div className="noxen-console-output" ref={outputRef} role="log" aria-live="polite" aria-label="Console output">
          <div className="noxen-console-welcome">
            <div className="noxen-console-welcome-mark"><Terminal size={18} /></div>
            <div>
              <strong>NOXEN CONSOLE <span>v1.0</span></strong>
              <p>Unified model runtime · tool dispatch · response inspection</p>
            </div>
          </div>

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
                </>
              )}
            </article>
          ))}

          {activity && (
            <div className="noxen-console-working">
              <LoaderCircle size={15} className="noxen-console-spin" />
              <span>{activity}</span>
              {benchmarkRunning && <small>BENCHMARK RUNNING</small>}
            </div>
          )}

          {!events.length && !messages.length && !activity && (
            <div className="noxen-console-empty">
              <span>NO OUTPUT YET</span>
              <p>Enter a prompt or type <code>/help</code> to begin.</p>
            </div>
          )}
          <div className="noxen-console-cursor-line" aria-hidden="true"><span>›</span><i /></div>
        </div>

        <form className="noxen-console-input-area" onSubmit={submit}>
          <div className="noxen-console-input-prefix"><span>noxen</span><b>›</b></div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!busy) void execute(input);
              }
            }}
            rows={2}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Console command or prompt"
            placeholder={busy ? "NOXEN is processing your request…" : "Enter a prompt or command…  ·  /help"}
            disabled={false}
          />
          {busy ? (
            <button type="button" className="noxen-console-run-button stop" onClick={() => {
              benchmarkCancelRef.current = true;
              arenaControllerRef.current?.abort();
              onStop();
              appendEvent("warning", "Stop signal sent.");
            }} aria-label="Stop current run" title="Stop current run"><Square size={15} fill="currentColor" /></button>
          ) : (
            <button type="submit" className="noxen-console-run-button" disabled={!input.trim()} aria-label="Run command" title="Run command"><Play size={15} fill="currentColor" /></button>
          )}
        </form>

        <div className="noxen-console-footer">
          <span><ShieldCheck size={12} /> NOXEN-managed commands only · no host shell access</span>
          <span><Zap size={12} /> {autoModelRouting ? "AUTOMATIC ROUTING" : "MANUAL MODEL"} · {displayModel(selectedModel).toUpperCase()}</span>
        </div>
      </div>

      <div className="noxen-console-command-help">
        <div className="noxen-console-command-help-title"><Command size={15} /> COMMAND QUICK REFERENCE</div>
        <div className="noxen-console-command-grid">
          {[
            ["/bench", "Compare available models with one prompt"],
            ["/inspect", "Inspect a public website"],
            ["/reverse", "Build a read-only site blueprint"],
            ["/research", "Run live web research"],
            ["/export", "Save the transcript as Markdown"],
            ["/status", "Inspect active runtime settings"]
          ].map(([command, description]) => (
            <button type="button" key={command} onClick={() => setInput(command + " ")}>
              <code>{command}</code><span>{description}</span><ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
