import React, { useCallback, useRef, useState } from "react";
import { Activity, FlaskConical, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import WorkbenchConsole, { type ConsoleRunOptions } from "./WorkbenchConsole";

type Message = {
  role: "user" | "assistant";
  text: string;
  model?: string;
};

const MODELS = [
  { name: "NOXEN Core 1.0", label: "Core", description: "Original general-purpose NOXEN model" },
  { name: "NOXEN Core 1.5", label: "Nova", description: "Balanced chat, reasoning, and coding" },
  { name: "NOXEN Swift", label: "Swift", description: "Fast, concise responses" },
  { name: "NOXEN Studio", label: "Studio", description: "Reasoning and creative work" },
  { name: "NOXEN Studio Plus", label: "Studio Plus", description: "Requires a verified NOXEN owner session", locked: true }
];

function routeTaskToModel(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/\b(research|investigate|fact.?check|latest|current|today|recent|sources?)\b/i.test(text)) return "NOXEN Core 1.5";
  if (/\b(architecture|audit|deep reasoning|comprehensive|complex|strategy|roadmap)\b/i.test(text)) return "NOXEN Studio";
  if (/\b(code|coding|debug|typescript|javascript|python|sql|react|api|function|component|github)\b/i.test(text)) return "NOXEN Core 1.5";
  if (/\b(quick|briefly|simple|define|translate|calculate)\b/i.test(text)) return "NOXEN Swift";
  return "NOXEN Core 1.5";
}

const TOOL_PREFIX: Record<string, string> = {
  web: "Research this request using live web sources. Cite useful sources and distinguish verified information from uncertainty.\n\n",
  code: "Focus on the programming task. Provide working code and explain important implementation details.\n\n",
  write: "Act as a writing assistant. Produce the requested draft directly.\n\n",
  study: "Explain this as a study topic, step by step, with clear examples where useful.\n\n",
  data: "Analyze and organize the information clearly. Use a table where useful.\n\n",
  ideas: "Brainstorm several distinct ideas and briefly compare them.\n\n"
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState("NOXEN Core 1.5");
  const [autoModelRouting, setAutoModelRouting] = useState(true);
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const activeController = useRef<AbortController | null>(null);

  React.useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const run = useCallback(async (prompt: string, options?: ConsoleRunOptions) => {
    const controller = new AbortController();
    activeController.current = controller;
    const model = options?.modelOverride || (autoModelRouting ? routeTaskToModel(prompt) : selectedModel);
    const message = (TOOL_PREFIX[options?.toolOverride || ""] || "") + prompt.trim();
    const history = options?.isolateHistory
      ? []
      : messages.slice(-16).map(item => ({
          role: item.role,
          content: item.text.slice(-7000),
          model: item.model
        }));

    setMessages(previous => [...previous, { role: "user", text: prompt, model }]);
    setRunning(true);
    setActivity("NOXEN API · waiting for model response");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          attachments: [],
          requestModel: model,
          responseStylePreference: "direct-concise",
          feedbackMemory: "",
          profileName: "",
          profileHandle: "",
          context: "",
          search: false,
          searchResults: [],
          agentMode: true,
          studioProvider: "huggingface"
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof payload?.error === "string" ? payload.error : "NOXEN chat API returned HTTP " + response.status + ".";
        throw new Error(detail);
      }
      const answer = typeof payload?.answer === "string" ? payload.answer.trim() : "";
      if (!answer) throw new Error("NOXEN returned an empty response. Try again.");
      const actualModel = String(payload.noxenModel || payload.model || model);
      setMessages(previous => [...previous, { role: "assistant", text: answer, model: actualModel }]);
      setActivity(null);
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
      const detail = error instanceof Error ? error.message : "Unknown request failure.";
      setMessages(previous => [...previous, { role: "assistant", text: "**Request failed**\n\n" + detail, model: "NOXEN API" }]);
      setActivity(null);
    } finally {
      if (activeController.current === controller) {
        activeController.current = null;
        setRunning(false);
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
        <span className="top-pill"><span className="pulse-dot" /> LIVE TEST BENCH</span>
      </header>

      <section className="playground-intro">
        <div className="intro-copy">
          <div className="eyebrow"><Activity size={14} /> LIVE MODEL WORKSPACE</div>
          <h1>NOXEN Console.<br /><span>Test the real models.</span></h1>
          <p>A terminal-style workspace connected to NOXEN's live response API. Commands, model selection, and actual responses all stay in the console.</p>
        </div>
        <div className="runtime-card">
          <div className="runtime-card-title">{isOnline ? <Wifi size={15} /> : <WifiOff size={15} />} BACKEND STATUS</div>
          <strong>{isOnline ? "CONNECTION AVAILABLE" : "DEVICE OFFLINE"}</strong>
          <small>{isOnline ? "NOXEN live API relay · keys remain server-side" : "Reconnect to send model requests"}</small>
        </div>
      </section>

      <section className="notice" role="note">
        <ShieldCheck size={17} />
        <div>
          <strong>Live NOXEN models · isolated console UI</strong>
          <p>Responses come from NOXEN's production model backend through a server-side relay. Provider credentials remain on NOXEN's server and are never copied into this site. Studio Plus remains locked without its verified owner session.</p>
        </div>
      </section>

      <WorkbenchConsole
        messages={messages}
        models={MODELS}
        selectedModel={selectedModel}
        autoModelRouting={autoModelRouting}
        isOnline={isOnline}
        running={running}
        activity={activity}
        onModelChange={setSelectedModel}
        onAutoModelRoutingChange={setAutoModelRouting}
        onRun={run}
        onStop={stop}
        onClear={clear}
      />

      <footer className="playground-footer">
        <span><ShieldCheck size={13} /> Server-side model relay · no provider keys in browser</span>
        <span>Separate console project · main NOXEN UI unchanged</span>
      </footer>
    </main>
  );
}
