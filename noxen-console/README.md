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
