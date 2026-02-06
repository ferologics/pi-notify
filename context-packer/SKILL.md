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
2. Excludes common junk (generated files, prior dumps, lockfiles unless requested)
3. Builds a fenced text dump (`path + ``` + contents`) for all selected files
4. Writes dump to `<project>/prompt/<output>.txt`
5. Writes a manifest of included files next to the dump
6. Counts tokens with `tokencount --encoding o200k-base`
7. Reports whether it fits the provided budget

## Command

```bash
$HOME/dev/pi-skills/context-packer/prepare-context.sh <project_dir> [options]
```

## Common invocations

```bash
# Default budget (272000), code-focused pack
$HOME/dev/pi-skills/context-packer/prepare-context.sh ~/dev/pui

# Include docs/
$HOME/dev/pi-skills/context-packer/prepare-context.sh ~/dev/pui --with-docs

# Custom budget and output name
$HOME/dev/pi-skills/context-packer/prepare-context.sh ~/dev/pui \
    --with-docs \
    --budget 272000 \
    --output pui-gpt5.txt

# Fail with exit code 2 if over budget
$HOME/dev/pi-skills/context-packer/prepare-context.sh ~/dev/pui --fail-over-budget
```

## Options

- `--output <name>` output filename under `<project>/prompt/` (default: `context-dump.txt`)
- `--budget <tokens>` token budget (default: `272000`)
- `--with-docs` include `docs/`
- `--with-tests` include test files (`__tests__`, `*.test.*`, `*.spec.*`)
- `--include-lockfiles` include lockfiles (`pnpm-lock.yaml`, `Cargo.lock`, etc.)
- `--no-clipboard` do not refresh clipboard from output file
- `--fail-over-budget` return non-zero if budget exceeded
- `--install-tools` install missing `tokencount` via cargo

## Requirements

- `tokencount` installed (`cargo install tokencount`)
- Optional helper utility: [`copy_files`](https://github.com/tulushev/copy_files) (not required by this skill)
- Optional clipboard tools:
  - macOS: `pbcopy`
  - Linux Wayland: `wl-copy`

If no clipboard tool is available, the script still writes output files; it just skips clipboard copy.
