import { createEventBus } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
    execFile: (...args: unknown[]) => execFileMock(...args),
    spawn: vi.fn(),
}));

type SettledHandler = (event: { aborted: boolean }, ctx: { mode: string; cwd: string }) => void;
type Notification = { title: string; body: string; cancel: boolean };

const TERMINAL_ENV = [
    "ITERM_SESSION_ID",
    "KITTY_WINDOW_ID",
    "LC_TERMINAL",
    "PI_NOTIFY_PROTOCOL",
    "PI_NOTIFY_SOUND_CMD",
    "TERM_PROGRAM",
    "TMUX",
    "WT_SESSION",
];

let written: string[];

beforeEach(() => {
    for (const name of TERMINAL_ENV) vi.stubEnv(name, undefined);
    written = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        written.push(String(chunk));
        return true;
    });
    execFileMock.mockReset();
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

async function settle(
    options: {
        aborted?: boolean;
        mode?: string;
        sessionName?: string;
        onBeforeNotify?: (n: Notification) => void;
    } = {},
): Promise<void> {
    const { default: notifyExtension } = await import("./index.js");
    const events = createEventBus();
    const { onBeforeNotify } = options;
    if (onBeforeNotify) events.on("pi-notify:before-notify", (data) => onBeforeNotify(data as Notification));

    let handler: SettledHandler | undefined;
    const pi = {
        events,
        getSessionName: () => options.sessionName,
        on: (event: string, h: SettledHandler) => {
            if (event === "agent_settled") handler = h;
        },
    };
    notifyExtension(pi as never);
    handler?.({ aborted: options.aborted ?? false }, { mode: options.mode ?? "tui", cwd: "/home/me/proj" });
}

function toastScript(): string {
    const args = execFileMock.mock.calls[0][1] as string[];
    return Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
}

describe("pi-notify", () => {
    it.each([
        ["no known terminal", {}, ["\x1b]777;notify;Pi (proj);Ready for input\x07"]],
        [
            "Kitty",
            { KITTY_WINDOW_ID: "1" },
            ["\x1b]99;i=1:d=0;Pi (proj)\x1b\\", "\x1b]99;i=1:p=body;Ready for input\x1b\\"],
        ],
        ["iTerm2", { TERM_PROGRAM: "iTerm.app" }, ["\x1b]9;Pi (proj): Ready for input\x07"]],
        [
            "iTerm2 over SSH in tmux (LC_TERMINAL only)",
            { LC_TERMINAL: "iTerm2", TERM_PROGRAM: "tmux", TMUX: "/tmp/tmux" },
            ["\x1bPtmux;\x1b\x1b]9;Pi (proj): Ready for input\x07\x1b\\"],
        ],
        ["Rex", { TERM_PROGRAM: "rex" }, []],
        [
            "Windows Terminal with the osc777 override",
            { WT_SESSION: "x", PI_NOTIFY_PROTOCOL: "osc777" },
            ["\x1b]777;notify;Pi (proj);Ready for input\x07"],
        ],
    ])("%s", async (_name, env, expected) => {
        for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
        await settle();
        expect(written).toEqual(expected);
        expect(execFileMock).not.toHaveBeenCalled();
    });

    it("sends a PowerShell toast in Windows Terminal, quoting the text", async () => {
        vi.stubEnv("WT_SESSION", "x");
        await settle({ sessionName: "it's done" });
        expect(written).toEqual([]);
        expect(execFileMock.mock.calls[0][0]).toBe("powershell.exe");
        expect(toastScript()).toContain(
            ".Item(0).AppendChild($xml.CreateTextNode('Pi (it''s done): Ready for input'))",
        );
    });

    it.each([
        ["an aborted run", { aborted: true }],
        ["print mode", { mode: "print" }],
        ["rpc mode", { mode: "rpc" }],
    ])("stays quiet for %s", async (_name, options) => {
        await settle(options);
        expect(written).toEqual([]);
    });

    it("lets other extensions cancel or change the notification", async () => {
        await settle({ onBeforeNotify: (n) => (n.cancel = true) });
        expect(written).toEqual([]);

        await settle({ onBeforeNotify: (n) => (n.body = "Waiting on subagents") });
        expect(written).toEqual(["\x1b]777;notify;Pi (proj);Waiting on subagents\x07"]);
    });

    it("strips separators and control characters from the session name", async () => {
        await settle({ sessionName: "fix;notify\nbug" });
        expect(written).toEqual(["\x1b]777;notify;Pi (fix notify bug);Ready for input\x07"]);
    });
});
