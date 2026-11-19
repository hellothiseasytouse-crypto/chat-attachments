# NOXEN Console Test Lab

A standalone terminal-style workspace for trying actual NOXEN model and tool endpoints.

## Start here

- `/ping` — send a real inference request and measure response time.
- `/models` and `/model nova` — inspect and choose the model.
- Type a normal prompt — chat with the selected model.
- `/bench <prompt>` — compare the same prompt across available models.
- `/help` — display the built-in manual and examples.

## Live NOXEN features

- Model inference for Core, Nova, Swift and Studio through `/api/chat`.
- Web research through `/research` and direct web results through `/search`.
- YouTube search and public metadata through `/youtube`.
- Public webpage inspection through `/inspect`.
- Multi-page public website reconstruction through `/reverse`.
- Coding, writing, study, data and idea response profiles.
- Image, video, audio and 3D generation through `/image`, `/video`, `/audio`, `/3d`. These require `--confirm` because the configured media provider may consume credits.

## Terminal behavior

- Tab completes command names.
- Up and Down navigate recent commands.
- Ctrl+L clears the session.
- Ctrl+C stops the active request.
- `/history`, `/export`, `/clear`, `/stop` manage the local transcript.

## Not connected

The separate console does not load personal NOXEN memories, connected Google plugins, prior account conversations or the Studio Plus owner session. It does not provide arbitrary operating-system shell access. No provider API keys are stored in this repository or sent to the browser.

## Hosting

This Vite + React app is a separate Vercel project. Same-origin API rewrites forward supported requests to `https://noxenlabs.vercel.app/api/*`.
