/**
 * Pi Notify Extension
 *
 * Sends a desktop notification once Pi has finished and is waiting for input.
 * Picks the protocol from the terminal, or from PI_NOTIFY_PROTOCOL:
 * - OSC 777: Ghostty, WezTerm, rxvt-unicode (Windows Terminal 1.26+ with PI_NOTIFY_PROTOCOL=osc777)
 * - OSC 9: iTerm2
 * - OSC 99: Kitty
 * - Windows toast through PowerShell: Windows Terminal
 * - tmux passthrough wrapper for OSC notifications
 * - Optional sound hook via PI_NOTIFY_SOUND_CMD
 *
 * In Rex it sends no notification: Pi reports its status to Rex itself (OSC 7501), and Rex notifies from that.
 * Other extensions can cancel or change a notification through the "pi-notify:before-notify" event.
 */

import { execFile, spawn } from "node:child_process";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROTOCOLS = ["osc777", "osc9", "osc99", "toast"] as const;
type Protocol = (typeof PROTOCOLS)[number];

function wrapForTmux(sequence: string): string {
    if (!process.env.TMUX) return sequence;

    // tmux passthrough: wrap in DCS and escape inner ESC bytes.
    const escaped = sequence.split("\x1b").join("\x1b\x1b");
    return `\x1bPtmux;${escaped}\x1b\\`;
}

function notifyOSC777(title: string, body: string): void {
    const sequence = `\x1b]777;notify;${title};${body}\x07`;
    process.stdout.write(wrapForTmux(sequence));
}

function notifyOSC9(message: string): void {
    const sequence = `\x1b]9;${message}\x07`;
    process.stdout.write(wrapForTmux(sequence));
}

function notifyOSC99(title: string, body: string): void {
    // Kitty OSC 99: i=notification id, d=0 means not done yet, p=body for second part
    const titleSequence = `\x1b]99;i=1:d=0;${title}\x1b\\`;
    const bodySequence = `\x1b]99;i=1:p=body;${body}\x1b\\`;
    process.stdout.write(wrapForTmux(titleSequence));
    process.stdout.write(wrapForTmux(bodySequence));
}

function notifyToast(message: string): void {
    // PowerShell treats curly single quotes as quotes too; doubling any of them escapes it.
    const quoted = `'${message.replace(/['\u2018\u2019\u201a\u201b]/g, "$&$&")}'`;
    const type = "Windows.UI.Notifications";
    const script = [
        `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime] > $null`,
        `$xml = [${type}.ToastNotificationManager]::GetTemplateContent([${type}.ToastTemplateType]::ToastText01)`,
        `$xml.GetElementsByTagName('text').Item(0).AppendChild($xml.CreateTextNode(${quoted})) > $null`,
        `[${type}.ToastNotificationManager]::CreateToastNotifier('Pi').Show([${type}.ToastNotification]::new($xml))`,
    ].join("; ");
    // -EncodedCommand takes base64 UTF-16LE, so no command-line quoting gets in the way.
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    execFile("powershell.exe", ["-NoProfile", "-EncodedCommand", encoded]);
}

function runSoundHook(): void {
    const command = process.env.PI_NOTIFY_SOUND_CMD?.trim();
    if (!command) return;

    try {
        const child = spawn(command, {
            shell: true,
            detached: true,
            stdio: "ignore",
        });
        child.unref();
    } catch {
        // Ignore hook errors to avoid breaking notifications
    }
}

/** Returns undefined in Rex, which notifies from Pi's status by itself. */
function pickProtocol(): Protocol | undefined {
    const env = process.env;
    const override = PROTOCOLS.find((protocol) => protocol === env.PI_NOTIFY_PROTOCOL);
    if (override) return override;

    if (env.TERM_PROGRAM === "rex") return undefined;
    if (env.WT_SESSION) return "toast";
    if (env.KITTY_WINDOW_ID) return "osc99";
    if (env.TERM_PROGRAM === "iTerm.app" || env.ITERM_SESSION_ID || env.LC_TERMINAL === "iTerm2") return "osc9";
    return "osc777";
}

/** Control characters end an escape sequence early, and `;` separates OSC 777's fields. */
function sanitize(text: string): string {
    return text.replace(/[\p{Cc};]/gu, " ");
}

function notify(pi: ExtensionAPI, title: string, body: string): void {
    // Listeners run synchronously inside emit, so they can set cancel or change title/body before we send.
    const notification = { title, body, cancel: false };
    pi.events.emit("pi-notify:before-notify", notification);
    if (notification.cancel) return;

    const safeTitle = sanitize(notification.title);
    const safeBody = sanitize(notification.body);

    switch (pickProtocol()) {
        case "osc777":
            notifyOSC777(safeTitle, safeBody);
            break;
        case "osc9":
            notifyOSC9(`${safeTitle}: ${safeBody}`);
            break;
        case "osc99":
            notifyOSC99(safeTitle, safeBody);
            break;
        case "toast":
            notifyToast(`${safeTitle}: ${safeBody}`);
            break;
    }

    runSoundHook();
}

export default function (pi: ExtensionAPI) {
    // agent_settled fires once nothing else will run on its own: no retry, compaction, or queued message.
    pi.on("agent_settled", (event, ctx) => {
        // Esc means you're at the keyboard; print, JSON, and RPC runs have no terminal to notify.
        if (event.aborted || ctx.mode !== "tui") return;

        const name = pi.getSessionName() || path.basename(ctx.cwd);
        notify(pi, name ? `Pi (${name})` : "Pi", "Ready for input");
    });
}
