# pi-notify

A [Pi](https://github.com/badlogic/pi-mono) extension that sends a native desktop notification when the agent finishes and is waiting for input.

![pi-notify demo](demo.gif)

## Compatibility

| Terminal                       | Support | Protocol                      |
| ------------------------------ | ------- | ----------------------------- |
| Ghostty                        | ✓       | OSC 777                       |
| iTerm2                         | ✓       | OSC 777                       |
| WezTerm                        | ✓       | OSC 777                       |
| rxvt-unicode                   | ✓       | OSC 777                       |
| Kitty                          | ✓       | OSC 99                        |
| tmux (inside a supported term) | ✓*      | tmux passthrough + OSC 777/99 |
| Windows Terminal               | ✓       | PowerShell toast              |
| Terminal.app                   | ✗       | —                             |
| Alacritty                      | ✗       | —                             |

\* tmux requires passthrough enabled in your tmux config:

```tmux
set -g allow-passthrough on
```

## Install

```bash
pi install npm:pi-notify
```

Or via git:

```bash
pi install git:github.com/ferologics/pi-notify
```

Restart Pi.

## How it works

When Pi's agent finishes (`agent_end` event), the extension sends a notification via the appropriate protocol:

- **OSC 777** (Ghostty, iTerm2, WezTerm, rxvt-unicode): Native escape sequence
- **OSC 99** (Kitty): Kitty's notification protocol, detected via `KITTY_WINDOW_ID`
- **tmux passthrough**: OSC sequences are wrapped automatically when `TMUX` is set
- **Windows toast** (Windows Terminal): PowerShell notification, detected via `WT_SESSION`

Clicking the notification focuses the terminal window/tab.

## Optional: Custom sound hook

You can run a custom command whenever a notification is sent by setting `PI_NOTIFY_SOUND_CMD`.

This keeps the extension tiny and cross-platform: you choose the command for your OS.

> Note: This is an additional sound hook. It does not replace native terminal/system notification sounds.

### Example (macOS)

```fish
set -Ux PI_NOTIFY_SOUND_CMD 'afplay ~/Library/Sounds/Glass.aiff'
```

### Example (Linux)

```bash
export PI_NOTIFY_SOUND_CMD='paplay /usr/share/sounds/freedesktop/stereo/complete.oga'
```

### Example (Windows PowerShell)

```powershell
$env:PI_NOTIFY_SOUND_CMD = 'powershell -NoProfile -Command "[console]::beep(880,180)"'
```

The command is run in the background (`shell: true`, detached) so it won't block Pi.

## What's OSC 777/99?

OSC = Operating System Command, part of ANSI escape sequences. Terminals use these for things beyond text formatting (change title, colors, notifications, etc.).

`777` is the number rxvt-unicode picked for notifications. Ghostty, iTerm2, WezTerm adopted it. Kitty uses `99` with a more extensible protocol.

## Known Limitations

- **tmux** works only with passthrough enabled (`set -g allow-passthrough on`).
- **zellij/screen** are still unsupported for OSC notifications.

## License

MIT
