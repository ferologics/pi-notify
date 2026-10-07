import { execFile } from "node:child_process";

type TmuxQuery = (args: string[]) => Promise<string>;

function queryTmux(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile("tmux", args, { encoding: "utf8", timeout: 500, maxBuffer: 64 * 1024, windowsHide: true },
            (error, stdout) => error ? reject(error) : resolve(stdout));
    });
}

/** Suppress only when a focused, attached client is viewing this exact pane. */
export async function isTmuxPaneFocused(
    env: NodeJS.ProcessEnv = process.env,
    query: TmuxQuery = queryTmux,
): Promise<boolean> {
    if (env.PI_NOTIFY_FOCUS === "0" || !env.TMUX || !env.TMUX_PANE || !/^%\d+$/.test(env.TMUX_PANE)) return false;

    try {
        const [focusEvents, clients] = await Promise.all([
            query(["show-options", "-gv", "focus-events"]),
            query(["list-clients", "-F", "#{pane_id}\t#{client_flags}"]),
        ]);
        // Without focus reporting tmux can retain "focused" after the terminal loses focus.
        if (focusEvents.trim() !== "on") return false;

        return clients.trim().split("\n").some((line) => {
            const [pane, flags] = line.split("\t");
            if (pane !== env.TMUX_PANE || !flags) return false;
            const values = flags.split(",");
            return values.includes("attached") && values.includes("focused")
                && !values.includes("suspended") && !values.includes("control-mode");
        });
    } catch {
        // Missing tmux, old versions, timeouts and query errors must not lose notifications.
        return false;
    }
}
