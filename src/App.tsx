import React, { useCallback, useState } from "react";
import { Activity, AlertTriangle, FlaskConical, ShieldCheck, WifiOff } from "lucide-react";
import WorkbenchConsole from "./WorkbenchConsole";

type Message = {
  role: "user" | "assistant";
  text: string;
  model?: string;
};

const MODELS = [
  { name: "NOXEN Core 1.0", label: "Core", description: "General-purpose model target · no runtime attached" },
  { name: "NOXEN Core 1.5", label: "Nova", description: "Research and coding target · no runtime attached" },
  { name: "NOXEN Swift", label: "Swift", description: "Fast model target · no runtime attached" },
  { name: "NOXEN Studio", label: "Studio", description: "Creative model target · no runtime attached" },
  { name: "NOXEN Studio Plus", label: "Studio Plus", description: "Advanced model target · no runtime attached" }
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].name);
  const [autoModelRouting, setAutoModelRouting] = useState(true);

  // Intentionally inert: the public playground must never fabricate or send AI requests.
  const run = useCallback(async () => {}, []);
  const stop = useCallback(() => {}, []);
  const clear = useCallback(() => setMessages([]), []);

  return (
    <main className="playground">
      <header className="playground-header">
        <a className="brand" href="/" aria-label="NOXEN Console Test Lab home">
          <span className="brand-icon"><FlaskConical size={18} /></span>
          <span>NOXEN <b>CONSOLE</b></span>
        </a>
        <span className="top-pill"><span className="pulse-dot" /> TEST LAB</span>
      </header>

      <section className="playground-intro">
        <div className="intro-copy">
          <div className="eyebrow"><Activity size={14} /> STANDALONE PLAYGROUND</div>
          <h1>Test the console.<br /><span>Not the live models.</span></h1>
          <p>A dedicated test bench for console commands, model target selection, and terminal diagnostics. No AI responses are generated.</p>
        </div>
        <div className="runtime-card">
          <div className="runtime-card-title"><WifiOff size={15} /> BACKEND STATUS</div>
          <strong>NOT CONNECTED</strong>
          <small>Console diagnostics only · inference disabled</small>
        </div>
      </section>

      <section className="notice" role="note">
        <AlertTriangle size={17} />
        <div>
          <strong>Demo mode only</strong>
          <p>Model execution is disabled. Normal prompts and AI/tool commands are recorded as terminal diagnostics only. No fake answers, model calls, searches, or image generation occur here.</p>
        </div>
      </section>

      <WorkbenchConsole
        messages={messages}
        models={MODELS}
        selectedModel={selectedModel}
        autoModelRouting={autoModelRouting}
        isOnline={false}
        running={false}
        activity={null}
        testingMode
        onModelChange={setSelectedModel}
        onAutoModelRoutingChange={setAutoModelRouting}
        onRun={run}
        onStop={stop}
        onClear={clear}
      />

      <footer className="playground-footer">
        <span><ShieldCheck size={13} /> Isolated test harness · no production data access</span>
        <span>Built for NOXEN Console UI testing</span>
      </footer>
    </main>
  );
}
