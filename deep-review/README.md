# Deep Review Extension

Run a 2-phase deep PR review flow inside your current Pi session:

1. Context packing via nested `pi -p` + `/skill:pr-context-packer`
2. Direct OpenAI Responses API streaming (thinking + final answer)

## Commands

- `/deep-review <query> [options]`
- `/deep-review-stop`

## Defaults

- Model: `gpt-5.2`
- Reasoning effort: `xhigh`
- Summary: `auto` (shows readable reasoning summary deltas)
- Verbosity: `medium`
- Base ref: auto-detected by `pr-context-packer`

## Options

- `--query <text>` (alternative to positional query; cannot be combined with positional query text)
- `--project <path>`
- `--base <ref>`
- `--model <id>`
- `--effort minimal|low|medium|high|xhigh`
- `--verbosity low|medium|high`
- `--summary auto|detailed|null`
- `--no-summary` (shortcut for `--summary null`)
- `--org <id>`
- `--project-id <id>`
- `--debug`
- `--help`

## Example

```text
/deep-review "find bugs and regressions"
```

## Notes

- The context-pack subprocess is launched with an explicit skill scope:
  - `--no-skills --skill <resolved-pr-context-packer-skill>`
  - Resolution order: `DEEP_REVIEW_CONTEXT_PACKER_SKILL`, project-local candidates, then common home-dir candidates
  - `~` is expanded in `DEEP_REVIEW_CONTEXT_PACKER_SKILL`
- Scribe expansion stays enabled in context-packer (no disable flag in this extension).
- Use `--no-summary` if you want parity mode without readable reasoning summary text.
- The command updates Pi UI live with a compact status widget (phase + stream progress).
- Streamed thinking/answer text is not previewed live in the widget; full markdown answer is posted at completion.
- Context-pack stage output is posted into the current session.
- Final response includes duration, token usage, and estimated cost.
- Final answer/thinking/report are written to a temp output folder and linked in the result.
- The extension attempts to copy the final answer to clipboard automatically.
- For auth, `OPENAI_API_KEY` is recommended.
