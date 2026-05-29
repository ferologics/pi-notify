# pi-notify

A [Pi](https://github.com/badlogic/pi-mono) extension that sends a native desktop notification when the agent finishes and is waiting for input.

![pi-notify demo](demo.gif)

## Compatibility

| Terminal                       | Support | Protocol                        |
| ------------------------------ | ------- | ------------------------------- |
| Ghostty                        | ✓       | OSC 777                         |
| iTerm2                         | ✓       | OSC 9                           |
| WezTerm                        | ✓       | OSC 777                         |
| rxvt-unicode                   | ✓       | OSC 777                         |
| Kitty                          | ✓       | OSC 99                          |
| tmux (inside a supported term) | ✓*      | tmux passthrough + OSC 777/99/9 |
| Windows Terminal               | ✓       | PowerShell toast                |
| Terminal.app                   | ✗       | —                               |
| Alacritty                      | ✗       | —                               |

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

When Pi's agent finishes (`agent_end` event), the extension checks suppression signals and — if notification is warranted — sends a notification via the appropriate protocol:

- **OSC 777** (Ghostty, WezTerm, rxvt-unicode): Native escape sequence
- **OSC 9** (iTerm2): iTerm2 notification protocol, detected via `TERM_PROGRAM=iTerm.app`
- **OSC 99** (Kitty): Kitty's notification protocol, detected via `KITTY_WINDOW_ID`
- **tmux passthrough**: OSC sequences are wrapped automatically when `TMUX` is set
- **Windows toast** (Windows Terminal): PowerShell notification, detected via `WT_SESSION`

Clicking the notification focuses the terminal window/tab.

## Notification content

- **Title:** `Pi — <session name>` when a Pi session name is set, otherwise `Pi Agent`
- **Body:** `Done: "your last prompt"` (truncated to 60 characters), or `Task complete. Ready for input.` if no prompt text is available

## Smart suppression

The extension suppresses notifications to avoid noise. Checks run cheapest-first:

| Signal | Threshold | Reason |
| --- | --- | --- |
| Queued follow-up | any | `agent_end` is not a real stop — another turn is coming |
| Recent steer | 15 seconds | User sent a mid-stream message — they are present |
| Cooldown | 30 seconds | Deduplicates rapid back-to-back completions |
| Focus detection | `PI_NOTIFY_FOCUS_CMD` exit 0 | Terminal is frontmost — user is already watching |

## Optional: Custom sound hook

You can run a custom command whenever a notification is sent by setting `PI_NOTIFY_SOUND_CMD`.

This keeps the extension tiny and cross-platform: you choose the command for your OS.

> Note: This is an additional sound hook. It does not replace native terminal/system notification sounds.

### Example (macOS)

```fish
set -Ux PI_NOTIFY_SOUND_CMD 'afplay /System/Library/Sounds/Crystal.aiff'
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

## Optional: Focus suppression

Set `PI_NOTIFY_FOCUS_CMD` to a shell command that exits **0 when your terminal is frontmost**. When it exits 0, the notification is suppressed (you're already watching).

### Example (macOS — suppress when iTerm2, Ghostty, kitty, or Terminal is frontmost)

```fish
set -Ux PI_NOTIFY_FOCUS_CMD \
  "osascript -e 'tell application \"System Events\" to get name of first application process whose frontmost is true' | grep -qE 'iTerm2|Ghostty|kitty|Terminal'"
```

### Example (Linux — suppress when a terminal has focus via xdotool)

```bash
export PI_NOTIFY_FOCUS_CMD='xdotool getactivewindow getwindowname | grep -qiE "terminal|kitty|alacritty"'
```

If `PI_NOTIFY_FOCUS_CMD` is unset, focus detection is skipped and the cooldown + streaming signals alone gate notifications.

## What's OSC 777/99/9?

OSC = Operating System Command, part of ANSI escape sequences. Terminals use these for things beyond text formatting (change title, colors, notifications, etc.).

`777` is the number rxvt-unicode picked for notifications. Ghostty and WezTerm adopted it. iTerm2 uses `9` instead, and Kitty uses `99` with a more extensible protocol.

## Known Limitations

- **tmux** works only with passthrough enabled (`set -g allow-passthrough on`).
- **zellij/screen** are still unsupported for OSC notifications.

## License

MIT
