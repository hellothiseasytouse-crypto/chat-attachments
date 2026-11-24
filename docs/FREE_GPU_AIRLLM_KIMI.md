# NOXEN Console — free GPU inference lab

This integration adds a **separate, experimental** inference path to the standalone Console test workstation. It does not change the production NOXEN API, does not grant Studio Plus access on the production website, and does not bypass the verified-owner check in the main NOXEN app.

## Architecture

```text
NOXEN Console browser
  ├─ x-console-token (entered by the operator; held in component state)
  ▼
Vercel serverless proxy
  ├─ validates NOXEN_CONSOLE_ACCESS_TOKEN
  ├─ keeps worker API keys server-side
  └─ forwards only to the selected configured worker
       ├─ Studio Plus test route → DeepSeek checkpoint + AirLLM
       └─ Kimi test route        → Kimi checkpoint + AirLLM
```

The browser never receives the worker URL's API key. The console token is not persisted to localStorage or sessionStorage.

## Free-GPU reality

Free notebook GPU sessions are temporary, may disconnect, have changing GPU availability, and often have limited disk space and outbound networking. AirLLM reduces GPU memory pressure by streaming layers from disk; it does **not** make model weights, download time, host RAM, disk capacity, or inference latency disappear. First model load can take a long time.

Kimi K2 is an open-weight 1-trillion-parameter MoE model with 32B activated parameters. That is not a 2-trillion-parameter model. Kimi K3 has been described by current AirLLM documentation as a 2.8T model, but do not assume an arbitrary free notebook can load it. Confirm the exact official checkpoint ID, license, AirLLM version, and hardware before selecting it. Start by proving the worker with a smaller DeepSeek checkpoint.

## Server environment variables

Configure these in the **Console project's** Vercel environment settings (not the production NOXEN project):

| Variable | Purpose |
| --- | --- |
| `NOXEN_CONSOLE_ACCESS_TOKEN` | Shared operator token required by both Console proxy routes |
| `NOXEN_STUDIO_PLUS_GPU_URL` | Base URL of the Studio Plus test worker |
| `NOXEN_STUDIO_PLUS_GPU_API_KEY` | Secret sent only from the server to that worker |
| `NOXEN_STUDIO_PLUS_GPU_MODEL` | Optional display/model ID; defaults to `deepseek-airllm` |
| `NOXEN_KIMI_GPU_URL` | Base URL of the separate Kimi worker |
| `NOXEN_KIMI_GPU_API_KEY` | Secret sent only from the server to that worker |
| `NOXEN_KIMI_GPU_MODEL` | Optional display/model ID; defaults to `kimi-k3-airllm` |

Set the access token and worker API keys to different long random values. Do not commit real values, paste them into chat, or put them in Vite variables.

## Worker deployment contract

The repository includes `gpu-worker/server.py`, a small FastAPI service that wraps AirLLM and exposes. It defaults to a small DeepSeek distillation checkpoint for a smoke test; set `MODEL_ID=moonshotai/Kimi-K3` only on a suitably provisioned Kimi worker:

- `GET /health` — authenticated worker status
- `POST /v1/chat/completions` — authenticated, non-streaming OpenAI-compatible completion

Install `gpu-worker/requirements.txt` for the DeepSeek smoke-test worker. For Kimi K3, use the separate `gpu-worker/requirements-kimi-k3.txt` profile and match its PyTorch/CUDA/FlashAttention build to the host. Set `WORKER_API_KEY`, `MODEL_ID`, and the resource limits from `gpu-worker/.env.example`, then start:

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

For a free notebook session, run the worker in that session and expose its port using a secure HTTPS tunnel supported by the notebook environment. Copy the HTTPS base URL into the matching Console Vercel environment variable. Do not expose the worker without its API key. A notebook restart changes its tunnel URL and requires updating the Console environment variable.

The worker loads its model at startup. The API will be unavailable until that completes. For two model routes, run two separate worker sessions or switch the worker's `MODEL_ID` and update the matching server-side route configuration.

## Console use

1. Configure the Console project's server environment variables.
2. Deploy the Console project so `/api/console/health` and `/api/console/chat` are available.
3. Start the worker and configure its base URL and key in the Console project's server environment.
4. Open **Free GPU Lab** in the Console page.
5. Enter the operator token, choose the route, click **Check worker**, then send a short prompt.

A worker status of offline is expected when a free session is stopped or its tunnel URL expires.

## Important boundaries

- This is a test harness, not production Studio Plus authentication.
- The standalone Console remains isolated from NOXEN account history, Supabase sessions, memories, and private chats.
- The worker currently handles text only and does not provide tool execution, browsing, or image understanding.
- Keep request limits low on free hardware. Avoid sending private or sensitive data to a temporary notebook worker.
- Review each model's license and usage terms before deployment. Open weights do not mean zero compute cost or unlimited usage.
