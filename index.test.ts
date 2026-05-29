import { test, expect } from "bun:test";
import {
    createState,
    recordInput,
    shouldNotify,
    buildBody,
    buildTitle,
    ENGAGEMENT_MS,
    COOLDOWN_MS,
} from "./index.ts";

// Minimal InputEvent stub — avoids importing from @mariozechner/pi-coding-agent at test time
type InputEvent = { source: string; text: string; streamingBehavior?: "steer" | "followUp" };

function inputEvent(partial: Partial<InputEvent>): InputEvent {
    return { source: "interactive", text: "", ...partial };
}

// --- buildBody ---

test("buildBody: empty text falls back to generic message", () => {
    expect(buildBody("")).toBe("Task complete. Ready for input.");
    expect(buildBody("   \n  ")).toBe("Task complete. Ready for input.");
});

test("buildBody: short text becomes a quoted snippet", () => {
    expect(buildBody("fix the auth bug")).toBe('Done: "fix the auth bug"');
});

test("buildBody: collapses whitespace", () => {
    expect(buildBody("fix\n  the   bug")).toBe('Done: "fix the bug"');
});

test("buildBody: truncates text longer than 60 chars with ellipsis", () => {
    const long = "a".repeat(70);
    expect(buildBody(long)).toBe(`Done: "${"a".repeat(60)}…"`);
});

// --- buildTitle ---

test("buildTitle: no session name falls back to 'Pi Agent'", () => {
    expect(buildTitle(undefined)).toBe("Pi Agent");
});

test("buildTitle: session name is included in title", () => {
    expect(buildTitle("my-project")).toBe("Pi — my-project");
});

// --- recordInput ---

test("recordInput: steer updates lastSteerAt", () => {
    const s = createState();
    recordInput(s, inputEvent({ streamingBehavior: "steer" }), 1000);
    expect(s.lastSteerAt).toBe(1000);
});

test("recordInput: followUp sets the queued flag", () => {
    const s = createState();
    recordInput(s, inputEvent({ streamingBehavior: "followUp" }), 1000);
    expect(s.followUpQueuedSinceStart).toBe(true);
});

test("recordInput: idle prompt stores the text", () => {
    const s = createState();
    recordInput(s, inputEvent({ text: "do the thing" }), 1000);
    expect(s.lastIdlePromptText).toBe("do the thing");
});

test("recordInput: non-interactive source is ignored", () => {
    const s = createState();
    recordInput(s, inputEvent({ text: "x", source: "extension" }), 1000);
    expect(s.lastIdlePromptText).toBe("");
});

// --- shouldNotify ---

test("shouldNotify: queued follow-up suppresses and never probes focus", () => {
    const s = createState();
    s.followUpQueuedSinceStart = true;
    let probed = false;
    const result = shouldNotify(s, 1_000_000, () => { probed = true; return false; });
    expect(result).toBe(false);
    expect(probed).toBe(false);
});

test("shouldNotify: recent steer suppresses and never probes focus", () => {
    const s = createState();
    s.lastSteerAt = 1_000_000;
    let probed = false;
    const result = shouldNotify(s, 1_000_000 + ENGAGEMENT_MS - 1, () => { probed = true; return false; });
    expect(result).toBe(false);
    expect(probed).toBe(false);
});

test("shouldNotify: within cooldown suppresses and never probes focus", () => {
    const s = createState();
    s.lastNotifiedAt = 1_000_000;
    let probed = false;
    const result = shouldNotify(s, 1_000_000 + COOLDOWN_MS - 1, () => { probed = true; return false; });
    expect(result).toBe(false);
    expect(probed).toBe(false);
});

test("shouldNotify: focused terminal suppresses", () => {
    const s = createState();
    const result = shouldNotify(s, 1_000_000, () => true);
    expect(result).toBe(false);
});

test("shouldNotify: all clear returns true", () => {
    const s = createState();
    const result = shouldNotify(s, 1_000_000, () => false);
    expect(result).toBe(true);
});
