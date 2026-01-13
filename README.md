# Pi Skills

My custom skills for [Pi](https://github.com/badlogic/pi-mono).

## Skills

| Skill | Description | Source |
|-------|-------------|--------|
| **brave-search** | Web search via Brave Search API | [badlogic/pi-skills](https://github.com/badlogic/pi-skills/tree/main/brave-search) |
| **code-review** | Local PR review for bugs, style, guidelines | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-review) |
| **code-simplifier** | Simplify/refine code for clarity | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-simplifier) |
| **markdown-converter** | Convert files to Markdown via `uvx markitdown` | [steipete/agent-scripts](https://github.com/steipete/agent-scripts/tree/main/skills/markdown-converter) |
| **session-analyzer** | Mine session transcripts for automation patterns | [badlogic gist](https://gist.github.com/badlogic/55d996b4afc4bd084ce55bb8ddd34594) |
| **video-compress** | Compress videos to target size via `ffmpeg` | Original |
| **youtube-transcript** | Fetch YouTube transcripts (any language) via `yt-dlp` | Original |

## Install

Symlink skills to Pi:

```bash
ln -sf /path/to/pi-skills/brave-search ~/.pi/agent/skills/
ln -sf /path/to/pi-skills/code-review ~/.pi/agent/skills/
ln -sf /path/to/pi-skills/code-simplifier ~/.pi/agent/skills/
ln -sf /path/to/pi-skills/markdown-converter ~/.pi/agent/skills/
ln -sf /path/to/pi-skills/session-analyzer ~/.pi/agent/skills/
ln -sf /path/to/pi-skills/video-compress ~/.pi/agent/skills/
ln -sf /path/to/pi-skills/youtube-transcript ~/.pi/agent/skills/
```

For brave-search:
```bash
cd /path/to/pi-skills/brave-search && npm install
```

For session-analyzer:
```bash
cd /path/to/pi-skills/session-analyzer && npm install
```

For video-compress:
```bash
brew install ffmpeg
```

For youtube-transcript:
```bash
brew install yt-dlp jq
```

## Disable per-repo

Add to `.pi/settings.json` in any repo:
```json
{
  "ignoredSkills": ["*"]
}
```

## License

MIT (except where noted from source)
