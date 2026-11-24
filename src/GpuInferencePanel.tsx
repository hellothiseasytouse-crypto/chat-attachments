import React, { useState } from "react";
import "./gpu-inference.css";
import { Activity, Cpu, KeyRound, Play, RefreshCw, Server, ShieldCheck, Zap } from "lucide-react";

type Provider = "studio-plus" | "kimi-k3";

export default function GpuInferencePanel() {
  const [provider, setProvider] = useState<Provider>("studio-plus");
  const [accessToken, setAccessToken] = useState("");
  const [prompt, setPrompt] = useState("Explain how mixture-of-experts models route tokens to experts.");
  const [status, setStatus] = useState("Not checked");
  const [workerInfo, setWorkerInfo] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const checkWorker = async () => {
    if (!accessToken.trim()) {
      setStatus("Enter the console access token first.");
      return;
    }
    setBusy(true);
    setStatus("Checking worker…");
    setWorkerInfo("");
    try {
      const response = await fetch("/api/console/health?provider=" + provider, {
        headers: { "x-console-token": accessToken.trim() },
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Health check failed.");
      setStatus("ONLINE");
      setWorkerInfo(JSON.stringify(payload.worker || {}, null, 2));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Worker check failed.");
    } finally {
      setBusy(false);
    }
  };

  const runInference = async () => {
    if (!accessToken.trim()) {
      setStatus("Enter the console access token first.");
      return;
    }
    if (!prompt.trim()) {
      setStatus("Enter a test prompt.");
      return;
    }
    setBusy(true);
    setAnswer("");
    setStatus("Sending request to the free GPU worker…");
    try {
      const response = await fetch("/api/console/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-console-token": accessToken.trim()
        },
        body: JSON.stringify({ provider, prompt: prompt.trim(), maxTokens: 512 }),
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Inference failed.");
      setAnswer(payload.answer || "");
      setStatus("Inference complete · " + (payload.model || provider));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Inference failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gpu-lab" aria-label="Free GPU inference lab">
      <div className="gpu-lab-heading">
        <div>
          <span className="gpu-lab-eyebrow"><Cpu size={13} /> EXPERIMENTAL INFERENCE</span>
          <h2>Free GPU Lab<span>.</span></h2>
          <p>Test the separate AirLLM worker routes without exposing model keys in the browser.</p>
        </div>
        <span className="gpu-lab-state"><Activity size={13} /> {busy ? "RUNNING" : "READY"}</span>
      </div>

      <div className="gpu-lab-notice">
        <ShieldCheck size={16} />
        <div><strong>Isolated console testing only</strong><p>This lab does not unlock Studio Plus on the production NOXEN site or replace its verified-owner check. Free GPU sessions are temporary; a disconnected session must be restarted.</p></div>
      </div>

      <div className="gpu-lab-grid">
        <label className="gpu-lab-field">
          <span>INFERENCE ROUTE</span>
          <select value={provider} onChange={event => setProvider(event.target.value as Provider)} disabled={busy}>
            <option value="studio-plus">Studio Plus · DeepSeek + AirLLM</option>
            <option value="kimi-k3">Kimi K3 · AirLLM</option>
          </select>
        </label>
        <label className="gpu-lab-field">
          <span><KeyRound size={12} /> CONSOLE ACCESS TOKEN</span>
          <input type="password" autoComplete="off" value={accessToken} onChange={event => setAccessToken(event.target.value)} placeholder="Server-configured token" disabled={busy} />
        </label>
      </div>

      <label className="gpu-lab-field gpu-lab-prompt">
        <span>TEST PROMPT</span>
        <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} maxLength={12000} disabled={busy} />
      </label>

      <div className="gpu-lab-actions">
        <button type="button" className="gpu-lab-secondary" onClick={checkWorker} disabled={busy}><RefreshCw size={14} /> Check worker</button>
        <button type="button" className="gpu-lab-primary" onClick={runInference} disabled={busy}><Play size={14} fill="currentColor" /> Run inference</button>
      </div>

      <div className="gpu-lab-status"><Server size={14} /><span>{status}</span></div>
      {workerInfo && <pre className="gpu-lab-output">{workerInfo}</pre>}
      {answer && <div className="gpu-lab-answer"><div><Zap size={13} /> MODEL RESPONSE</div><pre>{answer}</pre></div>}
    </section>
  );
}
