# NOXEN Console source bundle

This folder contains the NOXEN terminal-style developer console component and its stylesheet, copied from the NOXEN implementation branch.

## Files

- `WorkbenchConsole.tsx` — React console UI, command parser, sequential model benchmark UI, transcript export, model selector, and response output.
- `workbench-console.css` — responsive terminal styling.

## Integration requirements

This is a reusable component source bundle, not a standalone deployed app. The component expects to be mounted by the NOXEN application and receives its runtime through props:

- current transcript messages and model registry
- selected model and automatic-routing state
- online / running / activity status
- callbacks to dispatch a request through NOXEN's existing `send()` pipeline, stop a request, clear the console transcript, and update model/routing state

The parent NOXEN application remains responsible for API credentials, server requests, tool permissions, safety checks, and actual model execution. The console does not implement a separate backend and does not run arbitrary operating-system shell commands.

## Dependencies

The consuming React app needs:

- `react`
- `react-markdown`
- `remark-gfm`
- `lucide-react`

The component imports `./workbench-console.css` from the same folder.

## Where the integrated implementation lives

The app-level integration (navigation entry, isolated console transcript, and adapter to NOXEN's existing request pipeline) is maintained in the NOXEN repository, in the `feat/noxen-terminal-console` branch / PR #72. Copying these source files into this attachments repository does not deploy or activate the console on the production NOXEN website.

Production NOXEN: https://noxenlabs.vercel.app/


## Studio Plus Arena

The source bundle includes an optional side-by-side Arena panel. It accepts one shared prompt and renders the original Studio Plus result beside Studio Plus V2.

The consuming app can enable the panel by passing `onRunStudioPlusArena(prompt, signal)`. That callback must dispatch both requests in parallel and return:

```ts
{
  original: { ok, model, answer?, provider?, durationMs?, error? },
  v2: { ok, model, answer?, provider?, durationMs?, error? }
}
```

Keep the original Studio Plus request on the existing authenticated NOXEN route/provider path (AirLLM); do not replace or reroute it. Route Studio Plus V2 to the configured Kimi K3.1 Pro provider through a server-side endpoint. Keep provider keys out of this source bundle and browser code. Each side should return its own error so one failure does not hide the other model's answer.

The UI remains disabled until the consuming app supplies this secure adapter. This keeps the attachment bundle independent from production app credentials and prevents it from bypassing owner access controls.
