# NOXEN Console Test Lab

A standalone terminal-first test site for the real NOXEN chat models.

## Live behavior

- Sends text prompts to the official NOXEN production chat API through a same-origin Vercel rewrite.
- Streams no typing effect: the completed response is rendered immediately as terminal output.
- Supports manual model selection and automatic model routing.
- `/bench` runs the same prompt sequentially across unlocked models and labels each response with the actual returned model.
- `/research` enables the backend's web-search path.
- `/help`, `/status`, `/models`, `/model`, `/auto`, `/export`, `/clear`, and `/stop` are local console commands.

## Model access

Core, Nova, Swift, and Studio requests use the existing production chat service. Studio Plus is displayed as locked because the production endpoint requires a verified owner access token; this standalone playground does not bypass that control.

## Account isolation

The console keeps its transcript in the browser session and does not load NOXEN Supabase memories, prior account chats, or connected plugin grants. Requests are processed by NOXEN's production AI backend. No API keys are stored in this repository or sent from the browser.

## Hosting

This is a Vite + React app deployed as a separate Vercel project named `noxen-console-lab`. The project rewrite in `vercel.json` forwards only `/api/chat` to `https://noxenlabs.vercel.app/api/chat`.
