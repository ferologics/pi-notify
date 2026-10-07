import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { test, mock } from "node:test";
import extension from "../index.ts";

async function complete({ clients, focusEvents = "on\n", tmux = true, fail = false, sound = false, focus = undefined, backend = "iterm" }) {
    const env = { ...process.env };
    const previousRequire = Object.getOwnPropertyDescriptor(globalThis, "require");
    const writes = [];
    const commands = [];
    const sounds = [];
    const handlers = new Map();
    try {
        delete process.env.WT_SESSION;
        delete process.env.KITTY_WINDOW_ID;
        delete process.env.PI_NOTIFY_SOUND_CMD;
        delete process.env.PI_NOTIFY_FOCUS;
        delete process.env.ITERM_SESSION_ID;
        process.env.TERM_PROGRAM = backend === "iterm" ? "iTerm.app" : "ghostty";
        if (backend === "kitty") process.env.KITTY_WINDOW_ID = "1";
        if (backend === "windows") process.env.WT_SESSION = "test-session";
        if (sound) process.env.PI_NOTIFY_SOUND_CMD = "test-sound";
        if (focus !== undefined) process.env.PI_NOTIFY_FOCUS = focus;
        // Pi's jiti loader provides require for the existing sound and Windows backends.
        globalThis.require = createRequire(import.meta.url);
        mock.method(childProcess, "spawn", (command) => {
            sounds.push(command);
            return { unref() {} };
        });
        if (tmux) {
            process.env.TMUX = "/tmp/test-tmux,123,0";
            process.env.TMUX_PANE = "%12";
        } else {
            delete process.env.TMUX;
            delete process.env.TMUX_PANE;
        }
        mock.method(childProcess, "execFile", (file, args, options, callback) => {
            commands.push({ file, args, options });
            const output = args[0] === "show-options" ? focusEvents : clients;
            callback(fail ? new Error("tmux unavailable") : null, output, "");
        });
        syncBuiltinESMExports();
        mock.method(process.stdout, "write", (text) => {
            writes.push(text);
            return true;
        });
        extension({ on(event, handler) { handlers.set(event, handler); } });
        await handlers.get("agent_end")({}, { hasUI: true, mode: "tui" });
        return { writes, commands, sounds };
    } finally {
        if (previousRequire) Object.defineProperty(globalThis, "require", previousRequire);
        else delete globalThis.require;
        mock.restoreAll();
        syncBuiltinESMExports();
        for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
        Object.assign(process.env, env);
    }
}

const notification = "\x1bPtmux;\x1b\x1b]9;Pi: Ready for input\x07\x1b\\";

test("agent completion suppresses notification when this tmux pane is focused", async () => {
    const result = await complete({ clients: "%12\tattached,focused,UTF-8\n" });
    assert.deepEqual(result.writes, []);
});

test("another focused pane does not suppress this pane's notification", async () => {
    const result = await complete({ clients: "%13\tattached,focused,UTF-8\n" });
    assert.deepEqual(result.writes, [notification]);
});

test("an unfocused terminal still receives the notification", async () => {
    const result = await complete({ clients: "%12\tattached,UTF-8\n" });
    assert.deepEqual(result.writes, [notification]);
});

test("tmux query failure does not lose the notification", async () => {
    const result = await complete({ clients: "", fail: true });
    assert.deepEqual(result.writes, [notification]);
});

test("disabled focus reporting preserves notifications", async () => {
    const result = await complete({ clients: "%12\tattached,focused,UTF-8\n", focusEvents: "off\n" });
    assert.deepEqual(result.writes, [notification]);
});

test("outside tmux the existing notification protocol is unchanged", async () => {
    const result = await complete({ clients: "", tmux: false });
    assert.deepEqual(result.writes, ["\x1b]9;Pi: Ready for input\x07"]);
    assert.deepEqual(result.commands, []);
});

for (const backend of ["iterm", "kitty", "ghostty", "windows"]) {
    test(`focused pane suppresses the ${backend} backend and sound hook`, async () => {
        const result = await complete({ clients: "%12\tattached,focused\n", sound: true, backend });
        assert.deepEqual(result.writes, []);
        assert.deepEqual(result.sounds, []);
        assert.equal(result.commands.length, 2);
        assert.ok(result.commands.every(({ file }) => file === "tmux"));
    });
}

test("unfocused pane still runs the custom sound hook", async () => {
    const result = await complete({ clients: "%12\tattached\n", sound: true });
    assert.deepEqual(result.writes, [notification]);
    assert.deepEqual(result.sounds, ["test-sound"]);
});

test("explicit opt-out restores always-notify behavior without queries", async () => {
    const result = await complete({ clients: "%12\tattached,focused\n", focus: "0", sound: true });
    assert.deepEqual(result.writes, [notification]);
    assert.deepEqual(result.sounds, ["test-sound"]);
    assert.deepEqual(result.commands, []);
});

test("read-only tmux subprocesses are bounded and do not use a shell", async () => {
    const result = await complete({ clients: "%12\tattached,focused\n" });
    for (const { file, options } of result.commands) {
        assert.equal(file, "tmux");
        assert.equal(options.timeout, 500);
        assert.equal(options.maxBuffer, 64 * 1024);
        assert.equal(options.encoding, "utf8");
        assert.equal(options.shell, undefined);
    }
});
