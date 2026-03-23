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

When Pi's agent finishes (`agent_end` event), the extension sends a notification via the appropriate protocol:

- **OSC 777** (Ghostty, WezTerm, rxvt-unicode): Native escape sequence
- **OSC 9** (iTerm2): iTerm2 notification protocol, detected via `TERM_PROGRAM=iTerm.app`
- **OSC 99** (Kitty): Kitty's notification protocol, detected via `KITTY_WINDOW_ID`
- **tmux passthrough**: OSC sequences are wrapped automatically when `TMUX` is set
- **Windows toast** (Windows Terminal): PowerShell notification, detected via `WT_SESSION`

Clicking the notification focuses the terminal window/tab.

## Pausing notifications from other extensions

Extensions can temporarily disable all pi-notify deliveries and enable them again later:

```typescript
// pause notifications
pi.events.emit("pi-notify:pause");

// resume notifications
pi.events.emit("pi-notify:unpause");
```

This suppresses both the default `agent_end` notification and notifications triggered via `pi-notify:send` until unpaused.

If you want to react to pause state changes, listen for:

```typescript
pi.events.on("pi-notify:paused", ({ paused }) => {
    console.log(paused ? "Notifications paused" : "Notifications resumed");
});
```

## Customizing title & body

By default the notification title is **Pi** and the body is **{folder} — ready for input** (where `{folder}` is the basename of the working directory).

### Environment variables

Set `PI_NOTIFY_TITLE` and/or `PI_NOTIFY_BODY` to override the defaults:

```bash
export PI_NOTIFY_TITLE="Pi ({folder})"
export PI_NOTIFY_BODY="Done in {folder}"
```

### Template placeholders

Both title and body support `{placeholder}` templates resolved at notification time:

| Placeholder | Value                              |
| ----------- | ---------------------------------- |
| `{cwd}`     | Full working directory path        |
| `{folder}`  | Basename of the working directory  |

Unknown placeholders are left as-is, so literal braces in your text won't break anything.

### Dynamic customization from other extensions

Other pi extensions can hook into the `pi-notify:customize` event via `pi.events` to dynamically change the notification or add custom template variables:

```typescript
// in another extension
export default function (pi: ExtensionAPI) {
    pi.events.on("pi-notify:customize", (notification) => {
        // Override title/body
        notification.title = "My Project";
        notification.body  = "{folder} on {branch} — done!";

        // Add custom template variables
        notification.vars.branch = getCurrentGitBranch();
    });
}
```

The `notification` object has this shape:

```typescript
interface PiNotifyCustomization {
    title: string;                    // notification title (supports templates)
    body: string;                     // notification body  (supports templates)
    vars: Record<string, string>;     // template variables ({key} → value)
}
```

**Execution order:**
1. Defaults are read from `PI_NOTIFY_TITLE` / `PI_NOTIFY_BODY` env vars (or hardcoded fallbacks)
2. Built-in vars (`cwd`, `folder`) are populated
3. Pause check — if `pi-notify` is paused, the notification is suppressed
4. `pi-notify:customize` event fires — handlers can mutate title, body, and vars
5. `{placeholder}` templates are resolved
6. Notification is sent

### Sending notifications from other extensions

Other extensions can trigger a notification at any time via the `pi-notify:send` event:

```typescript
// Simple notification
pi.events.emit("pi-notify:send", {
    title: "My Extension",
    body: "Build finished in {folder}!",
});

// With custom template vars and no sound
pi.events.emit("pi-notify:send", {
    title: "Deploy",
    body: "{env} deploy complete ({duration}s)",
    vars: { env: "production", duration: "42" },
    silent: true,
});

```

The `pi-notify:send` payload:

```typescript
interface PiNotifySend {
    title?: string;    // defaults to PI_NOTIFY_TITLE env var or "Pi"
    body?: string;     // defaults to "Notification"
    vars?: Record<string, string>;  // merged with built-in vars (cwd, folder)
    silent?: boolean;  // skip the sound hook
}
```

Built-in vars (`cwd`, `folder`) are always available. The `pi-notify:customize` hook also runs for sent notifications, so global customizations apply everywhere.

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

## What's OSC 777/99/9?

OSC = Operating System Command, part of ANSI escape sequences. Terminals use these for things beyond text formatting (change title, colors, notifications, etc.).

`777` is the number rxvt-unicode picked for notifications. Ghostty and WezTerm adopted it. iTerm2 uses `9` instead, and Kitty uses `99` with a more extensible protocol.

## Known Limitations

- **tmux** works only with passthrough enabled (`set -g allow-passthrough on`).
- **zellij/screen** are still unsupported for OSC notifications.

## License

MIT
