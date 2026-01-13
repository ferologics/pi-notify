---
name: video-compress
description: Compress videos to a target file size using ffmpeg two-pass encoding. Useful for Discord/Slack upload limits.
---

# Video Compress Skill

Compress videos to a target file size using ffmpeg two-pass encoding.

## Usage

```bash
~/.pi/repos/pi-skills/video-compress/compress.sh <input> <output> [options]
```

**Options:**
- `--target MB` - Target size in MB (default: 10)
- `--scale WIDTH` - Scale to width, 0 to disable (default: 1920)
- `--no-audio` - Remove audio track (good for screen recordings)

## Examples

```bash
# Discord upload (10MB, no audio)
compress.sh recording.mov out.mp4 --no-audio

# Slack (25MB with audio)
compress.sh video.mov out.mp4 --target 25

# Keep original resolution
compress.sh video.mov out.mp4 --scale 0

# Lower res for very long videos
compress.sh long.mov out.mp4 --target 10 --scale 1280
```

## How it works

1. Gets video duration via ffprobe
2. Calculates target bitrate at 95% of target (to stay safely under)
3. Runs two-pass x264 encoding
4. Scales to 1920px width and 30fps by default
