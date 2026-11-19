# NOXEN Console Test Lab

A standalone Vite + React playground for the NOXEN terminal console component.

## What it does

- Hosts the reusable `WorkbenchConsole` component.
- Lets you try the command parser, model selector, automatic-routing toggle, transcript, export, clear, stop, and sequential benchmark UI.
- Runs in console-only test mode: command and model target diagnostics are logged, while model replies, API calls, external tools, and inference are disabled.

## Important runtime boundary

This is a UI and command-flow test harness only. It is not connected to NOXEN's private API, Supabase session, production model providers, search, image generation, or other live tools. Normal prompts are logged as terminal diagnostics, but no AI response is generated. Tool commands are recognized then blocked, and `/bench` is a dry run that lists model targets without inference. The playground deliberately has no production credentials.

The real app integration remains in the NOXEN repository. Keep live model execution and tool credentials inside the authenticated NOXEN application.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
