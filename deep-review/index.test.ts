import { beforeAll, describe, expect, it, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";

vi.mock("@mariozechner/pi-ai", () => ({
    calculateCost: vi.fn(),
    getModel: vi.fn(),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
    getMarkdownTheme: vi.fn(() => ({})),
}));

vi.mock("@mariozechner/pi-tui", () => ({
    Markdown: class {},
}));

let splitArgs: (input: string, platform?: NodeJS.Platform) => string[];
let parseOptions: (rawArgs: string, cwd: string) => { ok: boolean; message?: string };
let extractContextPackPath: (output: string) => Promise<string | undefined>;
let normalizeSectionLikeBoldMarkdown: (markdown: string) => string;
let parseSseStream: (
    body: ReadableStream<Uint8Array>,
) => AsyncGenerator<{ type?: string; [key: string]: unknown }, void, void>;

beforeAll(async () => {
    const mod = await import("./index.js");
    splitArgs = mod.splitArgs;
    parseOptions = mod.parseOptions;
    extractContextPackPath = mod.extractContextPackPath;
    normalizeSectionLikeBoldMarkdown = mod.normalizeSectionLikeBoldMarkdown;
    parseSseStream = mod.parseSseStream;
});

describe("splitArgs", () => {
    it("keeps Windows backslashes on win32", () => {
        const tokens = splitArgs('--project C:\\repo --query "review"', "win32");
        expect(tokens).toEqual(["--project", "C:\\repo", "--query", "review"]);
    });

    it("supports escaped spaces on posix", () => {
        const tokens = splitArgs("--project /tmp/my\\ repo --query test", "darwin");
        expect(tokens).toEqual(["--project", "/tmp/my repo", "--query", "test"]);
    });
});

describe("parseOptions", () => {
    it("rejects positional + --query together", () => {
        const parsed = parseOptions('positional --query "flag"', "/tmp");
        expect(parsed.ok).toBe(false);
        expect(parsed.message).toContain("both positionally and via --query");
    });
});

describe("extractContextPackPath", () => {
    it("returns an existing candidate path", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "deep-review-test-"));
        const realPath = path.join(dir, "pr-context.txt");
        await writeFile(realPath, "test", "utf8");

        const output = `Output: /nope/pr-context.txt\nOutput: ${realPath}`;
        const extracted = await extractContextPackPath(output);

        expect(extracted).toBe(realPath);
    });
});

describe("normalizeSectionLikeBoldMarkdown", () => {
    it("converts standalone bold lines to headings", () => {
        const input = "**Overview**\nBody text";
        const output = normalizeSectionLikeBoldMarkdown(input);
        expect(output).toContain("### Overview");
        expect(output).toContain("Body text");
    });
});

describe("parseSseStream", () => {
    it("parses JSON SSE events and ignores DONE", async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode('data: {"type":"response.created"}\n\n'));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
            },
        });

        const events: Array<{ type?: string }> = [];
        for await (const event of parseSseStream(stream)) {
            events.push(event);
        }

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("response.created");
    });
});
