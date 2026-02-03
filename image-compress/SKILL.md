---
name: image-compress
description: Compress images to a target file size using macOS sips. No dependencies required.
---

# Image Compress Skill

Compress images to a target file size using macOS built-in `sips`. Works with PNG, JPEG, HEIC, TIFF, and more.

## Usage

```bash
~/dev/pi-skills/image-compress/compress.sh <input> [output] [options]
```

**Options:**
- `--target MB` - Target size in MB (default: 5)
- `--width WIDTH` - Scale to width (maintains aspect ratio)
- `--format FORMAT` - Convert to format: jpeg, png, heic, tiff (default: keep original)
- `--quality 0-100` - JPEG/HEIC quality (default: 85)

If no output is specified, creates `<input>_compressed.<ext>` in the same directory.

## Examples

```bash
# Compress to 5MB (default), auto-resize
compress.sh photo.png

# Target 2MB
compress.sh photo.png out.png --target 2

# Convert to JPEG (often much smaller)
compress.sh photo.png out.jpg --format jpeg

# Specific width
compress.sh photo.png out.png --width 2000

# High quality JPEG
compress.sh photo.png out.jpg --format jpeg --quality 95
```

## How it works

1. Gets current dimensions and file size
2. If format conversion requested, converts first
3. Calculates required scale factor to hit target size
4. Iteratively resizes until under target (binary search approach)
5. Reports final dimensions and size
