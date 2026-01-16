# badlogic-is-blind

Aligns the input editor text with message content padding.

## The Problem

The input editor starts flush left while message content has `paddingX: 1`. This creates a visual misalignment that *some people* can't see. 🙄

## Installation

Symlink to your extensions folder:

```bash
ln -s ~/.pi/repos/pi-extensions/badlogic-is-blind ~/.pi/agent/extensions/
```

## What it does

Sets `paddingX: 1` on the editor so your cursor aligns with the chat content above it.
