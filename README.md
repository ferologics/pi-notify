# pi-notify

A [Pi](https://github.com/badlogic/pi-mono) extension that sends a native desktop notification when the agent finishes and is waiting for input.

## Compatibility

| Terminal | Support | Protocol |
|----------|---------|----------|
| Ghostty | ✓ | OSC 777 |
| iTerm2 | ✓ | OSC 777 |
| WezTerm | ✓ | OSC 777 |
| rxvt-unicode | ✓ | OSC 777 |
| Kitty | ✓ | OSC 99 |
| Windows Terminal | ✓ | PowerShell toast |
| Terminal.app | ✗ | — |
| Alacritty | ✗ | — |

## Install

```bash
pi install git:github.com/ferologics/pi-notify
```

Restart Pi.

## How it works

When Pi's agent finishes (`agent_end` event), the extension sends a notification via the appropriate protocol:

- **OSC 777** (Ghostty, iTerm2, WezTerm, rxvt-unicode): Native escape sequence
- **OSC 99** (Kitty): Kitty's notification protocol, detected via `KITTY_WINDOW_ID`
- **Windows toast** (Windows Terminal): PowerShell notification, detected via `WT_SESSION`

Clicking the notification focuses the terminal window/tab.

## What's OSC 777/99?

OSC = Operating System Command, part of ANSI escape sequences. Terminals use these for things beyond text formatting (change title, colors, notifications, etc.).

`777` is the number rxvt-unicode picked for notifications. Ghostty, iTerm2, WezTerm adopted it. Kitty uses `99` with a more extensible protocol.

## Known Limitations

Terminal multiplexers (zellij, tmux, screen) create their own PTY and typically don't pass through OSC notification sequences. Run pi directly in your terminal for notifications to work.

## License

MIT
