import React, { useCallback, useRef, useState } from "react";
import { Activity, AlertTriangle, Cpu, FlaskConical, ShieldCheck, Wifi } from "lucide-react";
import WorkbenchConsole, { type ConsoleRunOptions } from "./WorkbenchConsole";

type Message = {
  role: "user" | "assistant";
  text: string;
  model?: string;
};

const MODELS = [
  { name: "NOXEN Core 1.0", label: "Core", description: "Original Core model · live NOXEN inference" },
  { name: "NOXEN Core 1.5", label: "Nova", description: "Balanced reasoning and coding · live NOXEN inference" },
  { name: "NOXEN Swift", label: "Swift", description: "Fast response model · live NOXEN inference" },
  { name: "NOXEN Studio", label: "Studio", description: "Advanced analysis and coding · live NOXEN inference" },
  { name: "NOXEN Studio Plus", label: "Studio Plus", description: "Requires the verified NOXEN owner session", locked: true }
];

function chooseModel(prompt: string): string {
  const value = prompt.toLowerCase();
  if (/\b(deep research|architecture|complex|comprehensive|strategy|roadmap|audit)\b/.test(value)) return "NOXEN Studio";
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

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState("NOXEN Core 1.5");
  const [autoModelRouting, setAutoModelRouting] = useState(false);
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const activeController = useRef<AbortController | null>(null);

  const run = useCallback(async (prompt: string, options?: ConsoleRunOptions) => {
    const message = prompt.trim();
    if (!message) return;

    const model = options?.modelOverride || (autoModelRouting ? chooseModel(message) : selectedModel);
    if (model === "NOXEN Studio Plus") {
      setMessages(previous => [...previous,
        { role: "user", text: message },
        { role: "assistant", text: "Studio Plus requires a verified, signed-in owner session. Select another model or open NOXEN's main website to use that account-only model.", model: "ACCESS CONTROL" }
      ]);
      return;
    }

    const history = options?.isolateHistory
      ? []
      : messages.slice(-12).map(item => ({
          role: item.role,
          content: item.text,
          model: item.model
        }));

    const controller = new AbortController();
    activeController.current = controller;
    setMessages(previous => [...previous, { role: "user", text: message, model }]);
    setRunning(true);
    setActivity("NOXEN " + modelLabel(model) + " · waiting for model response");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history,
          requestModel: model,
          selectedModel: model,
          attachments: [],
          search: options?.toolOverride === "web",
          searchResults: [],
          responseStylePreference: "direct-concise",
          profileHandle: "console-user",
          profileName: "NOXEN Console User",
          profileBio: "",
          context: "",
          feedbackMemory: "",
          studioProvider: "huggingface",
          preferences: { playfulBanter: false },
          agentMode: true
        })
      });

      const raw = await response.text();
      const payload = parseResponse(raw, response.status);
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "NOXEN chat returned HTTP " + response.status + ".");
      }
      if (typeof payload.answer !== "string" || !payload.answer.trim()) {
        throw new Error("NOXEN's chat API returned no answer.");
      }

      const actualModel = String(payload.noxenModel || payload.model || model);
      setMessages(previous => [...previous, {
        role: "assistant",
        text: payload.answer.trim(),
        model: actualModel
      }]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const detail = error instanceof Error ? error.message : "Unknown NOXEN request error.";
      setMessages(previous => [...previous, {
        role: "assistant",
        text: "## NOXEN request failed\n\n" + detail,
        model: "API ERROR"
      }]);
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
    setMessages([]);
    setRunning(false);
    setActivity(null);
  }, []);

  return (
    <main className="playground">
      <header className="playground-header">
        <a className="brand" href="/" aria-label="NOXEN Console Test Lab home">
          <span className="brand-icon"><FlaskConical size={18} /></span>
          <span>NOXEN <b>CONSOLE</b></span>
        </a>
        <span className="top-pill"><span className="pulse-dot live" /> LIVE BACKEND</span>
      </header>

      <section className="playground-intro">
        <div className="intro-copy">
          <div className="eyebrow"><Activity size={14} /> DEVELOPER TEST BENCH</div>
          <h1>NOXEN Console<span>.</span></h1>
          <p>A terminal-first workspace for testing real NOXEN models. Responses render directly in the output stream—no typewriter effect or chat bubbles.</p>
        </div>
        <div className="runtime-card">
          <div className="runtime-card-title"><Wifi size={15} /> MODEL BACKEND</div>
          <strong>CONNECTED</strong>
          <small>Uses the existing NOXEN chat API</small>
        </div>
      </section>

      <section className="notice" role="note">
        <ShieldCheck size={17} />
        <div>
          <strong>Live inference · isolated test transcript</strong>
          <p>Prompts are sent to NOXEN's production chat backend. This test lab does not read your NOXEN account memories or connected plugins. Studio Plus stays locked because it requires the verified owner sign-in.</p>
        </div>
      </section>

      <div className="backend-meta">
        <span><Cpu size={13} /> CORE · NOVA · SWIFT · STUDIO</span>
        <span><AlertTriangle size={13} /> NO HOST SHELL ACCESS</span>
      </div>

      <WorkbenchConsole
        messages={messages}
        models={MODELS}
        selectedModel={selectedModel}
        autoModelRouting={autoModelRouting}
        isOnline={true}
        running={running}
        activity={activity}
        onModelChange={setSelectedModel}
        onAutoModelRoutingChange={setAutoModelRouting}
        onRun={run}
        onStop={stop}
        onClear={clear}
      />

      <footer className="playground-footer">
        <span><ShieldCheck size={13} /> Separate console transcript · not synced to NOXEN account history</span>
        <span>Smiling Cat Lab · NOXEN Developer Test Bench</span>
      </footer>
    </main>
  );
}
