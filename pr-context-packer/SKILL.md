---
name: pr-context-packer
description: Build PR-focused context packs (PR description + git diff + full changed files + related files via Scribe), then token-check with o200k-base against a budget.
---

# PR Context Packer

Use this skill when the user wants high-signal PR context for an LLM:
- include GitHub PR title/body by default,
- include the actual diff,
- include full current code for changed files,
- optionally expand with related files discovered via Scribe,
- verify fit against a context window budget.

## What it does

`prepare-pr-context.sh`:
1. Resolves PR base (`--base` or auto-detect)
2. Pulls GitHub PR title/body by default (via `gh`, with graceful fallback)
3. Captures changed files + full git diff (`base...HEAD`)
4. Includes full current content of changed files (safe filters applied)
5. Optionally expands related files using Scribe covering-set (dependents included by default)
6. Writes a single final text file plus manifests (changed/related/omitted)
7. Counts tokens with `tokencount --encoding o200k-base`

## Command

```bash
$HOME/dev/pi-skills/pr-context-packer/prepare-pr-context.sh <project_dir> [options]
```

## Common invocations

```bash
# Typical PR pack (tmp output by default)
$HOME/dev/pi-skills/pr-context-packer/prepare-pr-context.sh ~/dev/mobile-1 --base origin/main

# Disable Scribe expansion (diff + changed files only)
$HOME/dev/pi-skills/pr-context-packer/prepare-pr-context.sh ~/dev/mobile-1 --base origin/main --no-scribe

# Keep output in repo prompt/ instead of /tmp
$HOME/dev/pi-skills/pr-context-packer/prepare-pr-context.sh ~/dev/mobile-1 --base origin/main --in-project-output

# Tight budget + fail if over
$HOME/dev/pi-skills/pr-context-packer/prepare-pr-context.sh ~/dev/mobile-1 --base origin/main --budget 180000 --fail-over-budget
```

## Key options

- `--base <ref>` base ref to diff against (default: auto-detect)
- `--pr <ref>` explicit PR number/url/branch for `gh pr view` lookup
- `--no-pr-description` skip GitHub PR title/body section
- `--tmp-output` write output to `/tmp/context-packer/...` (default)
- `--in-project-output` write output to `<repo>/prompt/`
- `--no-scribe` disable Scribe related-file expansion
- `--no-dependents` disable dependent-file expansion (dependents are included by default)
- `--scribe-max-depth <n>` and `--scribe-max-files <n>` control each covering-set query
- `--scribe-target-limit <n>` cap number of changed files used as Scribe targets (default: `0` = all)
- `--max-related <n>` cap final related files list
- `--budget <tokens>` token budget (default: `272000`)
- `--fail-over-budget` return non-zero when over budget
- `--include-lockfiles`, `--include-env`, `--include-secrets` for explicit opt-ins

## Requirements

- `tokencount` (`cargo install tokencount`)
- Optional GitHub CLI (`gh`) for auto PR title/body inclusion
- Optional Scribe for related-file expansion:
  - `npm i -g @sibyllinesoft/scribe`, or
  - `cargo install scribe-cli`, or
  - `npx @sibyllinesoft/scribe` available
- Optional clipboard tools:
  - macOS: `pbcopy`
  - Linux Wayland: `wl-copy`
