# NOXEN Console Test Workstation

A terminal-first workspace for exercising the real NOXEN services through the official production API.

## Commands

| Command | What it tests |
| --- | --- |
| `/ping` | Real model response and request latency |
| `/models`, `/model <name>`, `/auto on/off` | Model selection and automatic routing |
| `/bench <prompt>` | Sequential comparison of Core, Nova, Swift, and Studio |
| `/research <prompt>` | Live web research through NOXEN chat |
| `/code`, `/write`, `/study`, `/data`, `/ideas` | NOXEN task-specific response profiles |
| `/youtube <query>` | YouTube result lookup, public metadata, and model analysis |
| `/inspect <url>` | Public HTML inspection and heuristic security indicators |
| `/reverse <url>` | Multi-page public-site inspection and reconstruction blueprint |
| `/image <prompt>` | NOXEN image generation |
| `/images <query>` | Existing web image lookup |
| Attach button or `/attach` | Up to 3 compressed images and text/code files for analysis |
| `/ping`, `/status`, `/help`, `/export`, `/clear`, `/stop` | Diagnostics and session controls |

## Free GPU inference lab\n\nThe workstation includes an experimental AirLLM test panel for a DeepSeek-based Studio Plus worker and a separate Kimi worker. It uses authenticated server-side proxy routes; worker API keys are never sent to browser code. Setup, Vercel environment variables, worker deployment notes, and model-size limitations are documented in [`docs/FREE_GPU_AIRLLM_KIMI.md`](docs/FREE_GPU_AIRLLM_KIMI.md). This isolated lab does not unlock Studio Plus on the production NOXEN site or bypass its verified-owner access check.\n\n## Model access

Core, Nova, Swift, and Studio use the existing production chat endpoint. Studio Plus remains locked because its endpoint requires a verified owner session. The standalone playground does not bypass that rule.

## Isolation and security

- The terminal transcript is held in browser memory and is not synced to a NOXEN account.
- The playground does not load Supabase sessions, saved memories, private chats, or connected plugin grants.
- API keys remain on NOXEN's production server; they are never included in browser code.
- Website inspection uses NOXEN's existing public-URL validation and read-only scanner.
- Arbitrary operating-system shell commands are not executed.
- Text/code attachments are read locally in the browser and sent as part of the selected prompt; images are compressed client-side and posted to NOXEN's existing vision path.

## Hosting

Standalone Vite + React project deployed as `noxen-console-lab`.
Only the explicit routes in `vercel.json` are proxied to `https://noxenlabs.vercel.app`.
