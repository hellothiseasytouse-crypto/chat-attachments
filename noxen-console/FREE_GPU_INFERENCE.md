# NOXEN Console — free-GPU inference integration

This is the Console-side integration contract. It deliberately does not pretend that a notebook GPU is a permanent inference server or that a model is loaded merely because an endpoint URL exists.

## Current repository facts

- The NOXEN production repository already contains a private AirLLM worker for Studio Plus with `reasoning` (DeepSeek R1 Distill Qwen 32B) and `general` (Qwen 3.8 27B) aliases.
- The production chat API already routes Studio Plus text requests to that worker when `NOXEN_STUDIO_PLUS_GPU_URL` and `NOXEN_STUDIO_PLUS_GPU_API_KEY` are configured. Owner authentication is checked by the production API before routing.
- This `chat-attachments` repository is a Console source/playground bundle. Its Vercel rewrites send ordinary chat requests to the canonical NOXEN site. It does not itself provision GPUs or bypass production owner authentication.

## Free-GPU reality

Kaggle and Colab provide temporary notebook runtimes, not an always-on service. GPU availability and quotas vary, sessions end, and an HTTPS endpoint/tunnel disappears when the notebook stops. Use a free notebook for experiments and manual testing only; do not advertise Studio Plus as continuously available on that basis.

Recommended first experiment:

1. Start with the existing DeepSeek/Qwen AirLLM worker, but test a smaller model profile first if the free notebook's VRAM, RAM, disk, or session limits cannot accommodate the configured 32B/27B weights.
2. Keep model files and AirLLM shard caches on persistent storage where the provider permits it; never assume notebook-local storage survives a reset.
3. Start the worker only during a test session and expose it through a trusted HTTPS endpoint. Keep the worker bearer key in server-side secrets only.
4. Set `NOXEN_STUDIO_PLUS_GPU_URL` and `NOXEN_STUDIO_PLUS_GPU_API_KEY` in the NOXEN server environment, not in Vite variables or browser code.
5. Verify `/health`, then perform an authenticated Studio Plus request through the existing production `/api/chat` route. Stop the notebook when finished.

## Kimi K2.5 feasibility and route

The official `moonshotai/Kimi-K2.5` model card lists **1 trillion total parameters** and **32 billion activated parameters**. Activated parameters per token are not the full memory footprint: the expert weights still need to be available to the inference system. The model card recommends vLLM, SGLang, or KTransformers for deployment and documents native INT4 quantization. A pair of ordinary free notebook GPUs is not a realistic host for the complete K2.5 model.

The Console status endpoint supports a future private, OpenAI-compatible Kimi inference endpoint using these server-only variables:

- `NOXEN_KIMI_GPU_URL` — HTTPS base URL for a separately hosted Kimi-compatible inference service.
- `NOXEN_KIMI_GPU_API_KEY` — server-side bearer key; never expose it to the browser.
- `NOXEN_KIMI_MODEL_ID` — optional model identifier; defaults to `moonshotai/Kimi-K2.5`.

This status check only verifies that `/v1/models` responds. It does **not** install, load, or run Kimi. No OpenRouter or paid API fallback is included. Until a suitable inference host exists, Kimi must remain marked unavailable rather than silently routing to DeepSeek or another model.

## Console status commands

- `/gpu status` checks the configured Studio Plus AirLLM worker through the Console's same-origin status endpoint.
- `/kimi status` checks whether a private Kimi-compatible endpoint is configured and reachable.
- Both endpoints return sanitized status only. Neither exposes server URLs, API keys, signed storage URLs, or raw worker diagnostics.

## Vercel environment variables

Configure these in the Console deployment only if you intend to use its status panel. The production NOXEN chat route still needs its own `NOXEN_STUDIO_PLUS_GPU_URL` and `NOXEN_STUDIO_PLUS_GPU_API_KEY` secrets.

| Variable | Purpose |
| --- | --- |
| `NOXEN_STUDIO_PLUS_GPU_URL` | AirLLM worker HTTPS base URL |
| `NOXEN_KIMI_GPU_URL` | Optional Kimi-compatible worker HTTPS base URL |
| `NOXEN_KIMI_GPU_API_KEY` | Optional Kimi worker bearer key |
| `NOXEN_KIMI_MODEL_ID` | Optional Kimi model ID |

Never put a secret in a `VITE_*` variable, a committed `.env` file, Console transcript, or browser request body.
