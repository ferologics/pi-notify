---
name: context-packer
description: Build LLM-ready code dumps with optional docs, then count tokens with tokencount (o200k-base) against a context budget (for example 272k for GPT-5).
---

# Context Packer

Use this skill when the user wants to:
- copy a project into an LLM-friendly single text file,
- include/exclude docs, tests, lockfiles, etc.,
- verify token count against a model context window.

## What it does

`prepare-context.sh`:
1. Selects relevant project files (tracked files by default)
2. Excludes common junk (generated files, prior dumps, lockfiles/env/sensitive files unless requested)
3. Builds a fenced text dump (`path + ``` + contents`) for all selected files
4. Writes dump to `<project>/prompt/<output>.txt` (or `/tmp/context-packer/...` with `--tmp-output`)
5. Writes a manifest of included files next to the dump
6. Counts tokens with `tokencount --encoding o200k-base`
7. Reports whether it fits the provided budget

## Command

```bash
$HOME/dev/pi-skills/context-packer/prepare-context.sh <project_dir> [options]
```

## Common invocations

```bash
# Default budget (272000), code + docs + tests pack
$HOME/dev/pi-skills/context-packer/prepare-context.sh ~/dev/pui

# Code-focused pack (exclude docs and tests)
$HOME/dev/pi-skills/context-packer/prepare-context.sh ~/dev/pui --no-docs --no-tests

# Include env/sensitive files explicitly (off by default for safety)
$HOME/dev/pi-skills/context-packer/prepare-context.sh ~/dev/pui --include-env --include-secrets

# Custom budget and output name
$HOME/dev/pi-skills/context-packer/prepare-context.sh ~/dev/pui \
    --budget 272000 \
    --output pui-gpt5.txt

# Fail with exit code 2 if over budget
$HOME/dev/pi-skills/context-packer/prepare-context.sh ~/dev/pui --fail-over-budget
```

## Options

- `--output <name>` output filename (default: `context-dump.txt`)
- `--tmp-output` write output to `/tmp/context-packer/...` instead of `<project>/prompt/`
- `--budget <tokens>` token budget (default: `272000`)
- `--with-docs` include `docs/` (default: on)
- `--with-tests` include test files (`__tests__`, `tests/`, `test/`, `*.test.*`, `*.spec.*`, etc.) (default: on)
- `--no-docs` exclude `docs/`
- `--no-tests` exclude test files (`__tests__`, `tests/`, `test/`, `*.test.*`, `*.spec.*`, etc.)
- `--include-lockfiles` include lockfiles (`pnpm-lock.yaml`, `Cargo.lock`, etc.)
- `--include-env` include env files (`.env`, `.env.*`, `.envrc`) (default: off)
- `--include-secrets` include potentially sensitive files (`.npmrc`, `.netrc`, keys/certs, cloud credential files, etc.) (default: off)
- `--no-clipboard` do not refresh clipboard from output file
- `--fail-over-budget` return non-zero if budget exceeded
- `--install-tools` install missing `tokencount` via cargo

## Requirements

- `tokencount` installed (`cargo install tokencount`)
- Optional helper utility: [`copy_files`](https://github.com/tulushev/copy_files) (not required)
- Optional clipboard tools:
  - macOS: `pbcopy`
  - Linux Wayland: `wl-copy`

If no clipboard tool is available, the script still writes output files; it just skips clipboard copy.
