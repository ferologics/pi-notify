# pi-notify

A simple [Pi](https://github.com/badlogic/pi-mono) extension that sends a native desktop notification when the agent finishes and is waiting for input.

Uses **OSC 777** escape sequence - no external dependencies.

## Compatibility

OSC 777 is terminal-dependent, not OS-dependent. Works on macOS, Linux, etc. if your terminal supports it.

| Terminal | Support | Notes |
|----------|---------|-------|
| Ghostty | ✓ | Native |
| iTerm2 | ✓ | Native |
| WezTerm | ✓ | Native |
| rxvt-unicode | ✓ | Originated here |
| Kitty | ✗ | Uses OSC 99 instead |
| Terminal.app | ✗ | No support |
| Windows Terminal | ✗ | No support |
| Alacritty | ✗ | No support |

## Install

Copy to Pi extensions:

```bash
cp index.ts ~/.pi/agent/extensions/pi-notify.ts
```

Or symlink for easy updates:

```bash
ln -s /path/to/pi-notify/index.ts ~/.pi/agent/extensions/pi-notify.ts
```

Add to `~/.pi/agent/extensions` in `~/.pi/agent/settings.json`:

```json
{
  "extensions": [
    "~/.pi/agent/extensions/pi-notify.ts"
  ]
}
```

Restart Pi.

## How it works

When Pi's agent finishes (`agent_end` event), the extension writes an OSC 777 escape sequence to stdout:

```
ESC ] 777 ; notify ; Pi ; Ready for input BEL
```

The terminal interprets this and shows a native notification. Clicking the notification focuses the terminal window/tab.

## What's OSC 777?

OSC = Operating System Command, part of ANSI escape sequences. Terminals use these for things beyond text formatting (change title, colors, notifications, etc.).

`777` is the number rxvt-unicode picked for notifications. Ghostty, iTerm2, WezTerm adopted it. Kitty went their own way with OSC 99.

## License

MIT
