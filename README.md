# NOXEN Console Test Lab

A standalone Vite + React playground for the NOXEN terminal console component.

## What it does

- Hosts the reusable `WorkbenchConsole` component.
- Lets you try the command parser, model selector, automatic-routing toggle, transcript, export, clear, stop, and sequential benchmark UI.
- Uses a local demo adapter that returns clearly labelled simulator output.

## Important runtime boundary

This is a UI and command-flow test harness only. It is not connected to NOXEN's private API, Supabase session, production model providers, search, image generation, or other live tools. Responses are simulated locally and do not measure AI intelligence. The playground deliberately has no production credentials.

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
