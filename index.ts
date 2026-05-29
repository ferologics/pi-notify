/**
 * Pi Notify Extension
 *
 * Sends a native terminal notification when Pi agent is done and waiting for input.
 * Supports multiple terminal protocols:
 * - OSC 777: Ghostty, WezTerm, rxvt-unicode
 * - OSC 9: iTerm2
 * - OSC 99: Kitty
 * - tmux passthrough wrapper for OSC notifications
 * - Windows toast: Windows Terminal (WSL)
 * - Optional sound hook via PI_NOTIFY_SOUND_CMD
 * - Optional focus suppression via PI_NOTIFY_FOCUS_CMD
 */

import type { ExtensionAPI, InputEvent } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";

function windowsToastScript(title: string, body: string): string {
    const type = "Windows.UI.Notifications";
    const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
    const template = `[${type}.ToastTemplateType]::ToastText01`;
    const toast = `[${type}.ToastNotification]::new($xml)`;
    return [
        `${mgr} > $null`,
        `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
        `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${body}')) > $null`,
        `[${type}.ToastNotificationManager]::CreateToastNotifier('${title}').Show(${toast})`,
    ].join("; ");
}

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

function notifyWindows(title: string, body: string): void {
    const { execFile } = require("node:child_process");
    execFile("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)]);
}

function runSoundHook(): void {
    const command = process.env.PI_NOTIFY_SOUND_CMD?.trim();
    if (!command) return;

    try {
        const { spawn } = require("node:child_process");
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

function notify(title: string, body: string): void {
    const isIterm2 = process.env.TERM_PROGRAM === "iTerm.app" || Boolean(process.env.ITERM_SESSION_ID);

    if (process.env.WT_SESSION) {
        notifyWindows(title, body);
    } else if (process.env.KITTY_WINDOW_ID) {
        notifyOSC99(title, body);
    } else if (isIterm2) {
        notifyOSC9(`${title}: ${body}`);
    } else {
        notifyOSC777(title, body);
    }

    runSoundHook();
}

// ---------------------------------------------------------------------------
// Streaming-aware suppression
// ---------------------------------------------------------------------------

export const COOLDOWN_MS = 30_000;   // 30 seconds between notifications
export const ENGAGEMENT_MS = 15_000; // user counts as "present" for 15s after a steer

export interface NotifyState {
    /** Most recent idle interactive prompt text, used for notification context. */
    lastIdlePromptText: string;
    /** True when a follow-up was queued during the current run. */
    followUpQueuedSinceStart: boolean;
    /** Timestamp (ms) of the most recent mid-stream steer. */
    lastSteerAt: number;
    /** Timestamp (ms) of the last notification we sent (cooldown). */
    lastNotifiedAt: number;
}

export function createState(): NotifyState {
    return {
        lastIdlePromptText: "",
        followUpQueuedSinceStart: false,
        lastSteerAt: 0,
        lastNotifiedAt: 0,
    };
}

/** Update engagement state from an input event. Only interactive input counts. */
export function recordInput(state: NotifyState, event: InputEvent, now: number): void {
    if (event.source !== "interactive") return;
    if (event.streamingBehavior === "steer") {
        state.lastSteerAt = now;
    } else if (event.streamingBehavior === "followUp") {
        state.followUpQueuedSinceStart = true;
    } else {
        state.lastIdlePromptText = event.text;
    }
}

/**
 * Decide whether to notify at agent_end. Cheap checks run first; isFocused()
 * (which may shell out) is only invoked if nothing else suppresses.
 */
export function shouldNotify(state: NotifyState, now: number, isFocused: () => boolean): boolean {
    if (state.followUpQueuedSinceStart) return false; // not a real stop
    if (now - state.lastSteerAt < ENGAGEMENT_MS) return false;  // user is present
    if (now - state.lastNotifiedAt < COOLDOWN_MS) return false; // cooldown
    if (isFocused()) return false; // terminal is frontmost
    return true;
}

/** Build the notification body from the most recent idle prompt. */
export function buildBody(promptText: string): string {
    const cleaned = promptText.trim().replace(/\s+/g, " ");
    if (!cleaned) return "Task complete. Ready for input.";
    const snippet = cleaned.length > 60 ? cleaned.slice(0, 60) + "…" : cleaned;
    return `Done: "${snippet}"`;
}

/** Build the notification title, including session name when available. */
export function buildTitle(sessionName: string | undefined): string {
    return sessionName ? `Pi — ${sessionName}` : "Pi Agent";
}

/**
 * Returns true if the terminal is currently focused.
 * Runs PI_NOTIFY_FOCUS_CMD as a shell command; exit 0 means focused (suppress).
 * If the env var is unset, always returns false (never suppress based on focus).
 */
function isFocused(): boolean {
    const cmd = process.env.PI_NOTIFY_FOCUS_CMD?.trim();
    if (!cmd) return false;
    try {
        execSync(cmd, { timeout: 3000, stdio: "ignore" });
        return true;  // exit 0 = terminal is focused
    } catch {
        return false; // non-zero exit or error = not focused
    }
}

export default function (pi: ExtensionAPI) {
    const state = createState();

    pi.on("input", async (event) => {
        recordInput(state, event, Date.now());
        return { action: "continue" };
    });

    pi.on("agent_start", async () => {
        state.followUpQueuedSinceStart = false;
    });

    pi.on("agent_end", async () => {
        const now = Date.now();
        if (!shouldNotify(state, now, isFocused)) return;
        state.lastNotifiedAt = now;
        notify(buildTitle(pi.getSessionName()), buildBody(state.lastIdlePromptText));
    });
}
