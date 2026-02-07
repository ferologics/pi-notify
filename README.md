# Pi Skills

My custom skills for [Pi](https://github.com/badlogic/pi-mono).

## Skills

| Skill | Description | Source |
|-------|-------------|--------|
| [**brave-search**](./brave-search/) | Web search via Brave Search API | [badlogic/pi-skills](https://github.com/badlogic/pi-skills/tree/main/brave-search) |
| [**code-review**](./code-review/) | Local PR review for bugs, style, guidelines | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-review) |
| [**code-simplifier**](./code-simplifier/) | Simplify/refine code for clarity | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-simplifier) |
| [**context-packer**](./context-packer/) | Build LLM-ready code dumps and count tokens with `o200k-base` | Original |
| [**image-compress**](./image-compress/) | Compress images to target size via `sips` | Original |
| [**markdown-converter**](./markdown-converter/) | Convert files to Markdown via `uvx markitdown` | [steipete/agent-scripts](https://github.com/steipete/agent-scripts/tree/main/skills/markdown-converter) |
| [**multi-review**](./multi-review/) | 3-model parallel PR review, then synthesize | Original |
| [**pr-context-packer**](./pr-context-packer/) | Build PR packs (diff + full changed files + related files) with token budgeting | Original |
| [**session-analyzer**](./session-analyzer/) | Mine session transcripts for automation patterns | [badlogic gist](https://gist.github.com/badlogic/55d996b4afc4bd084ce55bb8ddd34594) |
| [**video-compress**](./video-compress/) | Compress videos to target size via `ffmpeg` | Original |
| [**youtube-transcript**](./youtube-transcript/) | Fetch YouTube transcripts (any language) via `yt-dlp` | Original |

## Install

```bash
pi install npm:@ferologics/pi-skills
```

Or via git (always latest):

```bash
pi install git:github.com/ferologics/pi-skills
```

### Dependencies

Some skills need extra setup:

```bash
# brave-search
cd ~/dev/pi-skills/brave-search && npm install
# Also set BRAVE_API_KEY env var

# context-packer
cargo install tokencount
# Optional helper: https://github.com/tulushev/copy_files
# Optional: pbcopy (macOS) or wl-copy (Linux) for clipboard copy
# Tip: use --tmp-output to avoid writing dumps into the target repo

# pr-context-packer
cargo install tokencount
npm install -g @sibyllinesoft/scribe  # optional but recommended
# (or rely on npx @sibyllinesoft/scribe)
brew install gh                        # optional: auto-include PR title/body
# Optional: pbcopy (macOS) or wl-copy (Linux)

# image-compress
# No deps - uses macOS built-in sips

# session-analyzer
cd ~/dev/pi-skills/session-analyzer && npm install

# video-compress
brew install ffmpeg

# youtube-transcript
brew install yt-dlp jq
```

## License

MIT (except where noted from source)
