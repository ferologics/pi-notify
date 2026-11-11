# pi-notify

A [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) extension that sends a native desktop notification when the agent finishes and is waiting for input.

![pi-notify demo](demo.gif)

## Compatibility

| Terminal                       | Support | Protocol                        |
| ------------------------------ | ------- | ------------------------------- |
| Ghostty                        | ✓       | OSC 777                         |
| Rex                            | ✓†      | none: Rex notifies by itself    |
| iTerm2                         | ✓       | OSC 9                           |
| WezTerm                        | ✓       | OSC 777                         |
| rxvt-unicode                   | ✓       | OSC 777                         |
| Kitty                          | ✓       | OSC 99                          |
| tmux (inside a supported term) | ✓*      | tmux passthrough + OSC 777/99/9 |
| Windows Terminal               | ✓       | Windows toast (PowerShell)      |
| Windows Terminal 1.26+ Preview | ✓       | OSC 777, opt-in                 |
| Terminal.app                   | ✗       | —                               |
| Alacritty                      | ✗       | —                               |

† Pi reports its status to Rex (OSC 7501), and Rex's Program Activity settings turn that into notifications, so pi-notify sends none there (only the sound hook runs).

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

Restart Pi. Needs Pi 0.80.4 or newer.

## How it works

The notification fires on Pi's `agent_settled` event: once the run is over and nothing else will start on its own (no retry, compaction, or queued message). It does not fire when:

- you stop the run with Esc
- Pi runs without its terminal UI (`pi -p`, piped output, JSON or RPC mode), so nested and scripted runs stay quiet

The title names the session, or the folder Pi runs in if the session has no name: `Pi (my-project)`.

The protocol comes from the terminal:

- **OSC 777** (Ghostty, WezTerm, rxvt-unicode): the default
- **OSC 9** (iTerm2): detected via `TERM_PROGRAM=iTerm.app`, `ITERM_SESSION_ID`, or `LC_TERMINAL=iTerm2` (which SSH passes along)
- **OSC 99** (Kitty): detected via `KITTY_WINDOW_ID`
- **Windows toast** (Windows Terminal): a PowerShell notification, detected via `WT_SESSION`
- **tmux passthrough**: OSC sequences are wrapped automatically when `TMUX` is set

Clicking an OSC notification focuses the terminal window/tab. Clicking a Windows toast does not take you back to the tab.

### Choosing the protocol

If detection picks the wrong one (for example inside a long-running tmux session started from another terminal), set `PI_NOTIFY_PROTOCOL` to `osc777`, `osc9`, `osc99`, or `toast`:

```bash
export PI_NOTIFY_PROTOCOL=osc9
```

## Windows Terminal

By default pi-notify shows a Windows toast through PowerShell.

Windows Terminal 1.26+ (currently Preview) can show OSC 777 notifications itself, and clicking one jumps to the tab that sent it. To use that:

1. Install Preview:

   ```powershell
   winget install --id Microsoft.WindowsTerminal.Preview --exact --source winget
   ```

2. Turn on notifications in Preview's settings JSON (in `profiles.defaults` or your Pi profile):

   ```json
   "compatibility.allowOSC777": true
   ```

3. Tell pi-notify to use OSC 777:

   ```bash
   export PI_NOTIFY_PROTOCOL=osc777
   ```

If clicking also opens an extra window, turn off **Run this profile as Administrator** for that profile, then reopen Preview normally.

### WSL in other terminals

Outside Windows Terminal (VS Code's terminal, the classic console), pi-notify can't tell which terminal you're in, so it sends OSC 777, which those terminals ignore. Use the toast instead:

```bash
export PI_NOTIFY_PROTOCOL=toast
```

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

## For extension authors: cancel or change a notification

Before sending, pi-notify emits `pi-notify:before-notify` on Pi's event bus with `{ title, body, cancel }`. Set `cancel` to skip the notification (the sound hook is skipped too), or change `title`/`body`:

```typescript
pi.events.on("pi-notify:before-notify", (data) => {
    const notification = data as { title: string; body: string; cancel: boolean };
    if (backgroundWorkRunning()) notification.cancel = true;
});
```

Decide synchronously: anything set after an `await` comes too late.

## What's OSC 777/99/9?

OSC = Operating System Command, part of ANSI escape sequences. Terminals use these for things beyond text formatting (change title, colors, notifications, etc.).

`777` is the number rxvt-unicode picked for notifications. Ghostty and WezTerm adopted it. iTerm2 uses `9` instead, and Kitty uses `99` with a more extensible protocol.

## Known Limitations

- **tmux** works only with passthrough enabled (`set -g allow-passthrough on`).
- **zellij/screen** are still unsupported for OSC notifications.

## License

MIT
