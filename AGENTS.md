# Agent Guidelines for pi-notify

## What this project is

A Pi coding agent extension that sends desktop notifications when the agent finishes a task.
Single-file extension (`index.ts`) with pure testable logic and cross-platform notification delivery.

## Running tests

```bash
bun test
```

Expected: `15 pass, 0 fail`

## Key files

| File | Purpose |
|---|---|
| `index.ts` | The extension — delivery functions (OSC/Windows) + pure suppression logic |
| `index.test.ts` | Unit tests for all pure exported functions |
| `package.json` | `bun test` script + `bun-types` devDep |

## Architecture rules

- **Never modify** the delivery functions: `notifyOSC777`, `notifyOSC9`, `notifyOSC99`, `notifyWindows`, `wrapForTmux`, `runSoundHook`, `notify`. They are cross-platform and stable.
- **Pure exported functions** (`createState`, `recordInput`, `shouldNotify`, `buildBody`, `buildTitle`) must remain side-effect-free and fully testable without a pi runtime.
- `isFocused()` is the only function allowed to shell out — it reads `PI_NOTIFY_FOCUS_CMD`.
- There is no build step. Pi loads `index.ts` directly via its TypeScript runtime.

## Commit conventions

- `feat:` for logic/behaviour changes
- `test:` for test-only changes
- `docs:` for README/AGENTS.md changes
- `fix:` for bug fixes
