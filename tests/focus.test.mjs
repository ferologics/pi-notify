import assert from "node:assert/strict";
import { test } from "node:test";
import { isTmuxPaneFocused } from "../focus.ts";

const env = { TMUX: "/tmp/test-tmux,123,0", TMUX_PANE: "%12" };

function query(clients, focusEvents = "on\n") {
    return async (args) => args[0] === "show-options" ? focusEvents : clients;
}

for (const [name, clients, expected] of [
    ["focused current pane", "%12\tattached,focused,UTF-8\n", true],
    ["unfocused current pane", "%12\tattached,UTF-8\n", false],
    ["focused different pane or window", "%13\tattached,focused,UTF-8\n", false],
    ["different pane plus unfocused current pane", "%13\tattached,focused\n%12\tattached\n", false],
    ["one of multiple clients focuses current pane", "%12\tattached\n%12\tattached,focused\n", true],
    ["focused client views a different session", "%88\tattached,focused\n%12\tattached\n", false],
    ["suspended client", "%12\tattached,focused,suspended\n", false],
    ["control-mode client", "%12\tattached,focused,control-mode\n", false],
    ["client is not attached", "%12\tfocused,UTF-8\n", false],
    ["no clients", "", false],
    ["missing flags", "%12\n", false],
    ["malformed output", "unexpected output\n", false],
    ["focus flag must match exactly", "%12\tattached,unfocused\n", false],
    ["pane ID must match exactly", "%123\tattached,focused\n", false],
]) {
    test(name, async () => {
        assert.equal(await isTmuxPaneFocused(env, query(clients)), expected);
    });
}

for (const setting of ["off\n", "", "unknown\n"]) {
    test(`unreliable focus-events setting ${JSON.stringify(setting)} fails open`, async () => {
        assert.equal(await isTmuxPaneFocused(env, query("%12\tattached,focused\n", setting)), false);
    });
}

for (const values of [
    {}, { TMUX: env.TMUX }, { TMUX_PANE: env.TMUX_PANE },
    { ...env, TMUX_PANE: "invalid" }, { ...env, PI_NOTIFY_FOCUS: "0" },
]) {
    test(`no focus query for ${JSON.stringify(values)}`, async () => {
        let called = false;
        assert.equal(await isTmuxPaneFocused(values, async () => { called = true; throw new Error(); }), false);
        assert.equal(called, false);
    });
}

for (const command of ["show-options", "list-clients"]) {
    test(`${command} failure preserves notification`, async () => {
        assert.equal(await isTmuxPaneFocused(env, async (args) => {
            if (args[0] === command) throw new Error("query failed or timed out");
            return query("%12\tattached,focused\n")(args);
        }), false);
    });
}

test("queries run in parallel and use the client's active pane, not the server's current pane", async () => {
    const calls = [];
    const pending = [];
    const result = isTmuxPaneFocused(env, (args) => {
        calls.push(args);
        return new Promise((resolve) => pending.push(resolve));
    });
    assert.deepEqual(calls, [
        ["show-options", "-gv", "focus-events"],
        ["list-clients", "-F", "#{pane_id}\t#{client_flags}"],
    ]);
    pending[0]("on\n");
    pending[1]("%12\tattached,focused\n");
    assert.equal(await result, true);
});
