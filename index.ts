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
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import { execSync } from "node:child_process";

function isWSL(): boolean {
    return Boolean(process.env.WSLENV) || process.platform === "linux";
}

function resolveIconPath(iconRelative: string): string {
    // Resolve the path relative to this file's directory
    const localPath = path.resolve(__dirname, iconRelative);

    // If we're in WSL, convert Linux path to Windows path for PowerShell
    if (isWSL() && localPath.startsWith("/mnt/")) {
        try {
            return execSync(`wslpath -w "${localPath}"`, { encoding: "utf8" }).trim();
        } catch {
            return localPath;
        }
    }

    return localPath;
}

function windowsToastScript(title: string, body: string, iconPath: string = ""): string {
    const type = "Windows.UI.Notifications";
    const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
    
    // ToastImageAndText02: Image, Title, Body | ToastText02: Title, Body
    const templateType = iconPath ? "ToastImageAndText02" : "ToastText02";
    const template = `[${type}.ToastTemplateType]::${templateType}`;

    const safeTitle = title.replace(/'/g, "''");
    const safeBody = body.replace(/'/g, "''");

    const script = [
        `${mgr} > $null`,
        `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
        `$t = $xml.SelectNodes('//text')`,
        `$t[0].InnerText = '${safeTitle}'`,
        `$t[1].InnerText = '${safeBody}'`
    ];

    if (iconPath) {
        const safeIconPath = iconPath.replace(/'/g, "''");
        script.push(`$imageNodes = $xml.GetElementsByTagName('image')`);
        script.push(`$imageNodes[0].SetAttribute('src', '${safeIconPath}') > $null`);
    }

    script.push(`[${type}.ToastNotificationManager]::CreateToastNotifier('Pi Agent').Show([${type}.ToastNotification]::new($xml))`);

    return script.join("; ");
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

function notifyWindows(title: string, body: string, iconPath?: string): void {
    const { execFile } = require("node:child_process");
    const args = ["-NoProfile", "-Command", windowsToastScript(title, body, iconPath)];
    
    // Try pwsh first, fallback to powershell.exe
    execFile("pwsh", args, (err: Error | null) => {
        if (err) {
            execFile("powershell.exe", args);
        }
    });
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

function notify(title: string, body: string, iconPath?: string): void {
    const isIterm2 = process.env.TERM_PROGRAM === "iTerm.app" || Boolean(process.env.ITERM_SESSION_ID);

    if (process.env.WT_SESSION) {
        notifyWindows(title, body, iconPath);
    } else if (process.env.KITTY_WINDOW_ID) {
        notifyOSC99(title, body);
    } else if (isIterm2) {
        notifyOSC9(`${title}: ${body}`);
    } else {
        notifyOSC777(title, body);
    }

    runSoundHook();
}

export default function (pi: ExtensionAPI) {
    pi.on("agent_end", async () => {
        // Resolve logo.png relative to this extension's location
        // Windows: C:\path\to\logo.png
        // WSL: Converted via wslpath -w to C:\path\to\logo.png
        const iconPath = resolveIconPath("logo.png");
        notify("Pi", "Ready for input", iconPath);
    });
}