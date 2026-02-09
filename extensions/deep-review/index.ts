import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { calculateCost, getModel, type Model, type Usage } from "@mariozechner/pi-ai";
import { getMarkdownTheme, type ExtensionAPI, type ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Markdown } from "@mariozechner/pi-tui";

type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
type TextVerbosity = "low" | "medium" | "high";
type ReasoningSummary = "auto" | "detailed" | null;

type DeepReviewOptions = {
    query: string;
    projectDir: string;
    baseRef?: string;
    model: string;
    effort: ReasoningEffort;
    verbosity: TextVerbosity;
    summary: ReasoningSummary;
    organization?: string;
    projectId?: string;
    debug: boolean;
};

type ParseResult =
    | {
          ok: true;
          options: DeepReviewOptions;
      }
    | {
          ok: false;
          message: string;
      }
    | {
          ok: false;
          help: true;
      };

type ActiveRun = {
    controller: AbortController;
    child?: ChildProcess;
};

type ContextPackResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
};

type ResponsesResult = {
    responseId?: string;
    answer: string;
    thinking: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        totalTokens: number;
        estimatedCostUsd?: number;
    };
    durationMs: number;
    debugEvents: string[];
    debugPayload?: string;
};

type ClipboardResult = {
    copied: boolean;
    method?: string;
    error?: string;
};

type OutputArtifacts = {
    directory: string;
    answerPath: string;
    thinkingPath: string;
    reportPath: string;
    metadataPath: string;
    clipboard: ClipboardResult;
};

type LiveState = {
    startedAt: number;
    phase: "context-pack" | "responses";
    thinking: string;
    answer: string;
    responsesEventCount: number;
    lastResponsesEventType?: string;
    lastRenderAt: number;
};

const HELP_TEXT = `# /deep-review

Run PR context packing via a nested \`pi -p\` skill call, then send a direct OpenAI Responses API request.

## Usage

/deep-review <query> [options]

A query is required, either as positional text or via \`--query\`.

## Options

- \`--query <text>\`         Review request text (alternative to positional query; cannot combine both)
- \`--project <path>\`       Project dir for context packing (default: current cwd)
- \`--base <ref>\`           Base ref for context pack diff (default: context-packer auto-detect)
- \`--model <id>\`           Responses model (default: \`gpt-5.2\`)
- \`--effort <level>\`       \`minimal|low|medium|high|xhigh\` (default: \`xhigh\`)
- \`--verbosity <level>\`    \`low|medium|high\` (default: \`medium\`)
- \`--summary <mode>\`       \`auto|detailed|null\` (default: \`auto\`)
- \`--no-summary\`           Shortcut for \`--summary null\`
- \`--org <id>\`             Override \`openai-organization\` header
- \`--project-id <id>\`      Override \`OpenAI-Project\` header
- \`--debug\`                Save payload + stream events to /tmp for parity debugging
- \`--help\`                 Show this help

## Stop command

- \`/deep-review-stop\` stops an in-flight run.
`;

const ANSI_REGEX = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)`, "g");
const WIDGET_TICK_MS = 250;
const SPINNER_FRAME_MS = 100;
const MARKDOWN_THEME = getMarkdownTheme();

function stripAnsi(value: string): string {
    return value.replace(ANSI_REGEX, "");
}

function stripMarkdownFenceLines(value: string): string {
    return value.replace(/^[ \t]*```[^\r\n]*\r?\n?/gm, "").replace(/```+/g, "");
}

function truncate(value: string, maxChars: number): { text: string; truncated: boolean } {
    if (value.length <= maxChars) {
        return { text: value, truncated: false };
    }
    return {
        text: `${value.slice(0, maxChars)}\n\n...[truncated ${value.length - maxChars} chars]`,
        truncated: true,
    };
}

function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }

    const totalSeconds = ms / 1000;
    if (totalSeconds < 60) {
        return `${totalSeconds.toFixed(1)}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}m ${seconds}s`;
}

function describeResponsesEvent(eventType: string): string {
    switch (eventType) {
        case "response.created":
            return "request accepted";
        case "response.in_progress":
            return "model reasoning";
        case "response.output_item.added":
            return "new output block";
        case "response.reasoning_summary_part.added":
            return "thinking started";
        case "response.reasoning_summary_text.delta":
            return "thinking update";
        case "response.output_text.delta":
            return "answer update";
        case "response.output_text.done":
            return "answer block finished";
        case "response.content_part.added":
            return "content part added";
        case "response.completed":
            return "response complete";
        case "error":
            return "stream error";
        default:
            return eventType.startsWith("response.")
                ? eventType.slice("response.".length).replace(/[._]/g, " ")
                : eventType.replace(/[._]/g, " ");
    }
}

async function runClipboardProgram(command: string, args: string[], text: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
        let stderr = "";

        child.on("error", (error) => {
            reject(error);
        });

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(stderr.trim() || `${command} exited with code ${code ?? "unknown"}`));
        });

        child.stdin.on("error", () => {
            // Ignore EPIPE and similar shutdown errors.
        });

        child.stdin.end(text);
    });
}

async function copyTextToClipboard(text: string): Promise<ClipboardResult> {
    const payload = text.trim().length > 0 ? text : "(no output text returned)";

    const candidates: Array<{ command: string; args: string[]; method: string }> =
        process.platform === "darwin"
            ? [{ command: "pbcopy", args: [], method: "pbcopy" }]
            : process.platform === "win32"
              ? [{ command: "clip", args: [], method: "clip" }]
              : [
                    { command: "wl-copy", args: [], method: "wl-copy" },
                    { command: "xclip", args: ["-selection", "clipboard"], method: "xclip" },
                    { command: "xsel", args: ["--clipboard", "--input"], method: "xsel" },
                ];

    const errors: string[] = [];

    for (const candidate of candidates) {
        try {
            await runClipboardProgram(candidate.command, candidate.args, payload);
            return { copied: true, method: candidate.method };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`${candidate.method}: ${message}`);
        }
    }

    return {
        copied: false,
        error: errors.length > 0 ? errors.join(" | ") : "No clipboard command available",
    };
}

async function writeOutputArtifacts(
    options: DeepReviewOptions,
    packPath: string,
    responses: ResponsesResult,
    totalDurationMs: number,
    reportContent: string,
    debugDir?: string,
): Promise<OutputArtifacts> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "deep-review-output-"));
    const answerPath = path.join(directory, "answer.txt");
    const thinkingPath = path.join(directory, "thinking.txt");
    const reportPath = path.join(directory, "report.md");
    const metadataPath = path.join(directory, "metadata.json");

    const answerText = responses.answer.trim().length > 0 ? responses.answer : "(no output text returned)";
    const thinkingText =
        responses.thinking.trim().length > 0 ? responses.thinking : "(no reasoning summary text returned)";

    await writeFile(answerPath, `${answerText}\n`, "utf8");
    await writeFile(thinkingPath, `${thinkingText}\n`, "utf8");
    await writeFile(reportPath, `${reportContent}\n`, "utf8");

    const metadata = {
        createdAt: new Date().toISOString(),
        query: options.query,
        model: options.model,
        effort: options.effort,
        summary: options.summary,
        verbosity: options.verbosity,
        contextPackPath: packPath,
        totalDurationMs,
        usage: responses.usage,
        responseId: responses.responseId,
        debugDir,
    };

    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 4)}\n`, "utf8");

    const clipboard = await copyTextToClipboard(answerText);

    return {
        directory,
        answerPath,
        thinkingPath,
        reportPath,
        metadataPath,
        clipboard,
    };
}

function quoteForPrompt(value: string): string {
    if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
        return value;
    }
    return JSON.stringify(value);
}

export function splitArgs(input: string, platform = process.platform): string[] {
    const tokens: string[] = [];
    let current = "";
    let quote: '"' | "'" | null = null;
    let escaping = false;

    for (const char of input) {
        if (escaping) {
            current += char;
            escaping = false;
            continue;
        }

        if (char === "\\") {
            const shouldEscape = platform !== "win32" || quote !== null;
            if (shouldEscape) {
                escaping = true;
                continue;
            }

            current += char;
            continue;
        }

        if (quote) {
            if (char === quote) {
                quote = null;
            } else {
                current += char;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }

        if (/\s/.test(char)) {
            if (current.length > 0) {
                tokens.push(current);
                current = "";
            }
            continue;
        }

        current += char;
    }

    if (escaping) {
        current += "\\";
    }

    if (current.length > 0) {
        tokens.push(current);
    }

    return tokens;
}

function normalizeSummary(value: string): ReasoningSummary | undefined {
    const lowered = value.toLowerCase();
    if (lowered === "auto") return "auto";
    if (lowered === "detailed") return "detailed";
    if (lowered === "null" || lowered === "none" || lowered === "off") return null;
    return undefined;
}

export function parseOptions(rawArgs: string, cwd: string): ParseResult {
    const tokens = splitArgs(rawArgs);

    const options: DeepReviewOptions = {
        query: "",
        projectDir: cwd,
        model: "gpt-5.2",
        effort: "xhigh",
        verbosity: "medium",
        summary: "auto",
        debug: false,
    };

    const positional: string[] = [];

    const takeValue = (index: number): string | null => {
        const value = tokens[index + 1];
        if (!value || value.startsWith("--")) {
            return null;
        }
        return value;
    };

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token === "--help" || token === "-h") {
            return { ok: false, help: true };
        }

        if (!token.startsWith("--")) {
            positional.push(token);
            continue;
        }

        switch (token) {
            case "--project": {
                const value = takeValue(i);
                if (!value) return { ok: false, message: `${token} requires a value` };
                options.projectDir = value;
                i++;
                break;
            }
            case "--base": {
                const value = takeValue(i);
                if (!value) return { ok: false, message: `${token} requires a value` };
                options.baseRef = value;
                i++;
                break;
            }
            case "--model": {
                const value = takeValue(i);
                if (!value) return { ok: false, message: `${token} requires a value` };
                options.model = value;
                i++;
                break;
            }
            case "--effort": {
                const value = takeValue(i);
                if (!value) return { ok: false, message: `${token} requires a value` };
                if (!["minimal", "low", "medium", "high", "xhigh"].includes(value)) {
                    return { ok: false, message: `Invalid effort: ${value}` };
                }
                options.effort = value as ReasoningEffort;
                i++;
                break;
            }
            case "--verbosity": {
                const value = takeValue(i);
                if (!value) return { ok: false, message: `${token} requires a value` };
                if (!["low", "medium", "high"].includes(value)) {
                    return { ok: false, message: `Invalid verbosity: ${value}` };
                }
                options.verbosity = value as TextVerbosity;
                i++;
                break;
            }
            case "--summary": {
                const value = takeValue(i);
                if (!value) return { ok: false, message: `${token} requires a value` };
                const normalized = normalizeSummary(value);
                if (normalized === undefined) {
                    return { ok: false, message: `Invalid summary mode: ${value}` };
                }
                options.summary = normalized;
                i++;
                break;
            }
            case "--no-summary": {
                options.summary = null;
                break;
            }
            case "--org": {
                const value = takeValue(i);
                if (!value) return { ok: false, message: `${token} requires a value` };
                options.organization = value;
                i++;
                break;
            }
            case "--project-id": {
                const value = takeValue(i);
                if (!value) return { ok: false, message: `${token} requires a value` };
                options.projectId = value;
                i++;
                break;
            }
            case "--query": {
                const value = takeValue(i);
                if (!value) return { ok: false, message: `${token} requires a value` };
                options.query = value;
                i++;
                break;
            }
            case "--debug": {
                options.debug = true;
                break;
            }
            default:
                return { ok: false, message: `Unknown option: ${token}` };
        }
    }

    if (positional.length > 0) {
        if (options.query) {
            return {
                ok: false,
                message: "Query provided both positionally and via --query; choose one.",
            };
        }

        options.query = positional.join(" ").trim();
    }

    options.query = options.query.trim();
    if (!options.query) {
        return {
            ok: false,
            message: 'Query is required. Use /deep-review "..." or pass --query "...".',
        };
    }

    options.projectDir = path.resolve(cwd, options.projectDir);

    return { ok: true, options };
}

function expandTildePath(value: string): string {
    if (!value.startsWith("~")) {
        return value;
    }

    if (value === "~") {
        return os.homedir();
    }

    if (value.startsWith("~/")) {
        return path.join(os.homedir(), value.slice(2));
    }

    return value;
}

async function pathExists(value: string): Promise<boolean> {
    try {
        await access(value);
        return true;
    } catch {
        return false;
    }
}

async function resolveContextPackerSkillPath(projectDir: string): Promise<string> {
    const envOverride = process.env.DEEP_REVIEW_CONTEXT_PACKER_SKILL?.trim();
    const candidates = [
        envOverride ? expandTildePath(envOverride) : undefined,
        path.join(projectDir, ".pi", "skills", "pr-context-packer", "SKILL.md"),
        path.join(projectDir, "pr-context-packer", "SKILL.md"),
        path.join(os.homedir(), "dev", "pi-skills", "pr-context-packer", "SKILL.md"),
        path.join(os.homedir(), ".pi", "skills", "pr-context-packer", "SKILL.md"),
        path.join(
            os.homedir(),
            ".pi",
            "agent",
            "git",
            "github.com",
            "ferologics",
            "pi-skills",
            "pr-context-packer",
            "SKILL.md",
        ),
    ].filter((candidate): candidate is string => !!candidate);

    for (const candidate of candidates) {
        if (await pathExists(candidate)) {
            return candidate;
        }
    }

    const expected = candidates.map((candidate) => `- ${candidate}`).join("\n");
    throw new Error(
        `pr-context-packer skill not found. Checked:\n${expected}\nSet DEEP_REVIEW_CONTEXT_PACKER_SKILL=/absolute/path/to/SKILL.md to override.`,
    );
}

function buildContextPackSkillPrompt(options: DeepReviewOptions): string {
    const args = [quoteForPrompt(options.projectDir), "--no-clipboard"];

    if (options.baseRef) {
        args.push("--base", quoteForPrompt(options.baseRef));
    }

    const skillInvocation = `/skill:pr-context-packer ${args.join(" ")}`;

    return [
        skillInvocation,
        "",
        "Run the context pack workflow now.",
        "Return only the script terminal output in plain text, with no commentary.",
    ].join("\n");
}

function isLikelyContextPackPath(value: string): boolean {
    return value.endsWith(".txt") && (value.includes("pr-context") || value.includes("context-packer"));
}

function rankContextPackCandidate(value: string): number {
    if (value.endsWith("/pr-context.txt") || value.endsWith("\\pr-context.txt")) {
        return 0;
    }
    if (value.includes("/tmp/context-packer/") || value.toLowerCase().includes("\\temp\\context-packer\\")) {
        return 1;
    }
    if (value.includes("pr-context")) {
        return 2;
    }
    return 3;
}

export async function extractContextPackPath(output: string): Promise<string | undefined> {
    const cleaned = stripAnsi(output);
    const candidates: string[] = [];

    const explicitOutputLine = cleaned
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /^(?:📄\s*)?Output:\s+/i.test(line));

    if (explicitOutputLine) {
        const explicitPath = explicitOutputLine
            .replace(/^(?:📄\s*)?Output:\s+/i, "")
            .trim()
            .replace(/^['"]|['"]$/g, "")
            .replace(/[),.:;]+$/g, "");

        if (isLikelyContextPackPath(explicitPath)) {
            candidates.push(explicitPath);
        }
    }

    const posixMatches = cleaned.match(/\/[\w./-]+\.txt/g) ?? [];
    const winMatches = cleaned.match(/[A-Za-z]:\\[^\s"'<>|?*]+\.txt/g) ?? [];

    for (const match of [...posixMatches, ...winMatches]) {
        const candidate = match.replace(/[),.:;]+$/g, "");
        if (isLikelyContextPackPath(candidate)) {
            candidates.push(candidate);
        }
    }

    const uniqueSortedCandidates = [...new Set(candidates)].sort(
        (left, right) => rankContextPackCandidate(left) - rankContextPackCandidate(right),
    );

    for (const candidate of uniqueSortedCandidates) {
        if (await pathExists(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

function renderLiveWidget(ctx: ExtensionCommandContext, state: LiveState, force = false): void {
    if (!ctx.hasUI) {
        return;
    }

    const now = Date.now();
    if (!force && now - state.lastRenderAt < 120) {
        return;
    }

    state.lastRenderAt = now;

    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const spinner = spinnerFrames[Math.floor(now / SPINNER_FRAME_MS) % spinnerFrames.length];

    const lines: string[] = [];
    lines.push(ctx.ui.theme.fg("accent", `${spinner} deep-review · ${state.phase}`));
    lines.push(ctx.ui.theme.fg("dim", `elapsed ${formatDuration(now - state.startedAt)} · /deep-review-stop to stop`));

    if (state.phase === "context-pack") {
        lines.push(ctx.ui.theme.fg("muted", "building context pack…"));
    } else {
        const streamSummary = state.lastResponsesEventType
            ? `${state.responsesEventCount.toLocaleString()} events · ${describeResponsesEvent(state.lastResponsesEventType)}`
            : `${state.responsesEventCount.toLocaleString()} events · waiting for first event`;

        lines.push(ctx.ui.theme.fg("dim", `stream: ${streamSummary}`));

        if (state.answer.trim().length > 0) {
            lines.push(ctx.ui.theme.fg("muted", "answer streaming… full markdown answer posts at completion"));
        } else {
            lines.push(ctx.ui.theme.fg("muted", "reasoning in progress… waiting for answer tokens"));
        }
    }

    lines.push(ctx.ui.theme.fg("dim", "handoff files are written after completion"));

    ctx.ui.setWidget("deep-review-live", lines);
}

async function runContextPackViaPi(
    options: DeepReviewOptions,
    cwd: string,
    skillPath: string,
    activeRun: ActiveRun,
): Promise<ContextPackResult> {
    const commandPrompt = buildContextPackSkillPrompt(options);
    const args = [
        "-p",
        "--no-session",
        "--no-extensions",
        "--no-skills",
        "--skill",
        skillPath,
        "--thinking",
        "off",
        commandPrompt,
    ];

    return await new Promise<ContextPackResult>((resolve, reject) => {
        const startedAt = Date.now();
        let stdout = "";
        let stderr = "";

        const child = spawn("pi", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
        activeRun.child = child;

        let exited = false;
        let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

        const clearForceKillTimer = () => {
            if (forceKillTimer) {
                clearTimeout(forceKillTimer);
                forceKillTimer = undefined;
            }
        };

        const killChild = () => {
            if (exited) {
                return;
            }

            try {
                child.kill("SIGTERM");
            } catch {
                // ignore kill errors if process already exited
            }

            clearForceKillTimer();
            forceKillTimer = setTimeout(() => {
                if (exited) {
                    return;
                }

                try {
                    child.kill("SIGKILL");
                } catch {
                    // ignore kill errors if process already exited
                }
            }, 4000);
        };

        const onAbort = () => {
            killChild();
        };

        if (activeRun.controller.signal.aborted) {
            killChild();
        } else {
            activeRun.controller.signal.addEventListener("abort", onAbort, { once: true });
        }

        child.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        child.on("error", (error) => {
            exited = true;
            clearForceKillTimer();
            activeRun.controller.signal.removeEventListener("abort", onAbort);
            activeRun.child = undefined;
            reject(error);
        });

        child.on("close", (code) => {
            exited = true;
            clearForceKillTimer();
            activeRun.controller.signal.removeEventListener("abort", onAbort);
            activeRun.child = undefined;
            resolve({
                stdout,
                stderr,
                exitCode: code ?? 1,
                durationMs: Date.now() - startedAt,
            });
        });
    });
}

type SseEvent = {
    type?: string;
    [key: string]: unknown;
};

function findSseBoundary(buffer: string): { index: number; length: number } | null {
    const rnIndex = buffer.indexOf("\r\n\r\n");
    const nIndex = buffer.indexOf("\n\n");

    if (rnIndex === -1 && nIndex === -1) {
        return null;
    }

    if (rnIndex === -1) {
        return { index: nIndex, length: 2 };
    }

    if (nIndex === -1) {
        return { index: rnIndex, length: 4 };
    }

    return rnIndex < nIndex ? { index: rnIndex, length: 4 } : { index: nIndex, length: 2 };
}

export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent, void, void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });

        while (true) {
            const boundary = findSseBoundary(buffer);
            if (!boundary) {
                break;
            }

            const rawEvent = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary.length);

            const lines = rawEvent.split(/\r?\n/);
            const dataLines: string[] = [];

            for (const line of lines) {
                if (line.startsWith("data:")) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }

            if (dataLines.length === 0) {
                continue;
            }

            const data = dataLines.join("\n");
            if (data === "[DONE]") {
                return;
            }

            try {
                const parsed = JSON.parse(data) as SseEvent;
                yield parsed;
            } catch {
                // Ignore malformed SSE chunks
            }
        }
    }
}

async function resolveBearerToken(
    ctx: ExtensionCommandContext,
    modelId: string,
): Promise<{ token: string; source: string }> {
    const fromEnv = process.env.OPENAI_API_KEY?.trim();
    if (fromEnv) {
        return { token: fromEnv, source: "OPENAI_API_KEY" };
    }

    const modelCandidates = [
        getModel("openai", modelId as never),
        getModel("openai-codex", modelId as never),
        getModel("openai", "gpt-5" as never),
        getModel("openai", "gpt-4.1" as never),
    ].filter(Boolean);

    for (const candidate of modelCandidates) {
        const fromAuth = await ctx.modelRegistry.getApiKey(candidate as unknown as Model<any>);
        if (fromAuth) {
            return { token: fromAuth, source: "auth.json/openai" };
        }
    }

    const sessionLike = process.env.OPENAI_SESSION_TOKEN?.trim() ?? process.env.OPENAI_BEARER_TOKEN?.trim();
    if (sessionLike) {
        return { token: sessionLike, source: "OPENAI_SESSION_TOKEN/OPENAI_BEARER_TOKEN" };
    }

    throw new Error("No OpenAI token found. Set OPENAI_API_KEY (recommended) or OPENAI_SESSION_TOKEN.");
}

function extractCompletedAnswer(responseObject: any): string {
    const output = Array.isArray(responseObject?.output) ? responseObject.output : [];
    const parts: string[] = [];

    for (const item of output) {
        if (item?.type !== "message" || !Array.isArray(item?.content)) {
            continue;
        }

        for (const content of item.content) {
            if (content?.type === "output_text" && typeof content.text === "string") {
                parts.push(content.text);
            }
            if (content?.type === "refusal" && typeof content.refusal === "string") {
                parts.push(content.refusal);
            }
        }
    }

    return parts.join("\n").trim();
}

async function streamResponses(
    options: DeepReviewOptions,
    contextText: string,
    ctx: ExtensionCommandContext,
    signal: AbortSignal,
    onThinkingDelta: (delta: string) => void,
    onAnswerDelta: (delta: string) => void,
    onEvent: (eventType: string) => void,
): Promise<ResponsesResult> {
    const startedAt = Date.now();
    const { token, source } = await resolveBearerToken(ctx, options.model);

    const organization = options.organization ?? process.env.OPENAI_ORGANIZATION ?? process.env.OPENAI_ORG_ID;
    const projectId = options.projectId ?? process.env.OPENAI_PROJECT ?? process.env.OPENAI_PROJECT_ID;

    const payload: Record<string, unknown> = {
        model: options.model,
        input: [
            {
                role: "user",
                content: [{ type: "input_text", text: contextText }],
            },
            {
                role: "user",
                content: [{ type: "input_text", text: options.query }],
            },
        ],
        tools: [],
        text: {
            format: { type: "text" },
            verbosity: options.verbosity,
        },
        reasoning: {
            effort: options.effort,
            summary: options.summary,
        },
        stream: true,
        store: false,
    };

    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "openai-beta": "responses=v1",
    };

    if (organization) {
        headers["openai-organization"] = organization;
    }

    if (projectId) {
        headers["OpenAI-Project"] = projectId;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok || !response.body) {
        const body = await response.text();
        throw new Error(`Responses API failed (${response.status}): ${body}`);
    }

    if (signal.aborted) {
        throw new Error("Request was aborted");
    }

    const debugEvents: string[] = [];
    let thinking = "";
    let answer = "";
    let completedResponse: any;

    for await (const event of parseSseStream(response.body)) {
        if (signal.aborted) {
            throw new Error("Request was aborted");
        }

        if (options.debug) {
            debugEvents.push(JSON.stringify(event));
        }

        const eventType = typeof event.type === "string" ? event.type : "(unknown)";
        onEvent(eventType);

        if (event.type === "response.reasoning_summary_text.delta") {
            const delta = typeof event.delta === "string" ? event.delta : "";
            if (delta) {
                thinking += delta;
                onThinkingDelta(delta);
            }
            continue;
        }

        if (event.type === "response.output_text.delta") {
            const delta = typeof event.delta === "string" ? event.delta : "";
            if (delta) {
                answer += delta;
                onAnswerDelta(delta);
            }
            continue;
        }

        if (event.type === "response.completed") {
            completedResponse = event.response;
            continue;
        }

        if (event.type === "error") {
            const message = typeof event.message === "string" ? event.message : JSON.stringify(event);
            throw new Error(`Responses stream error: ${message}`);
        }
    }

    if (!answer.trim() && completedResponse) {
        answer = extractCompletedAnswer(completedResponse);
    }

    const usagePayload = completedResponse?.usage ?? {};
    const inputTokens = Number(usagePayload.input_tokens ?? 0);
    const outputTokens = Number(usagePayload.output_tokens ?? 0);
    const cachedTokens = Number(usagePayload.input_tokens_details?.cached_tokens ?? 0);
    const totalTokens = Number(usagePayload.total_tokens ?? inputTokens + outputTokens);

    let estimatedCostUsd: number | undefined;
    const billingModel =
        (getModel("openai", options.model as never) as Model<any> | undefined) ??
        (getModel("openai-codex", options.model as never) as Model<any> | undefined);

    if (billingModel) {
        const usage: Usage = {
            input: Math.max(0, inputTokens - cachedTokens),
            output: outputTokens,
            cacheRead: cachedTokens,
            cacheWrite: 0,
            totalTokens,
            cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
            },
        };

        calculateCost(billingModel, usage);
        estimatedCostUsd = usage.cost.total;
    }

    const responseId = typeof completedResponse?.id === "string" ? completedResponse.id : undefined;

    let debugPayload: string | undefined;

    if (options.debug) {
        debugPayload = JSON.stringify(payload, null, 4);

        debugEvents.unshift(
            JSON.stringify({
                type: "request_meta",
                tokenSource: source,
                hasOrganizationHeader: !!organization,
                hasProjectHeader: !!projectId,
                payloadMeta: {
                    model: options.model,
                    effort: options.effort,
                    summary: options.summary,
                    verbosity: options.verbosity,
                    contextChars: contextText.length,
                    queryChars: options.query.length,
                },
            }),
        );
    }

    return {
        responseId,
        answer,
        thinking,
        usage: {
            inputTokens,
            outputTokens,
            cachedTokens,
            totalTokens,
            estimatedCostUsd,
        },
        durationMs: Date.now() - startedAt,
        debugEvents,
        debugPayload,
    };
}

function summarizeContextPackMessage(packResult: ContextPackResult, packPath: string): string {
    const cleanedStdout = stripMarkdownFenceLines(stripAnsi(packResult.stdout)).trim();
    const cleanedStderr = stripMarkdownFenceLines(stripAnsi(packResult.stderr)).trim();
    const maxChars = 12000;

    const { text: truncatedStdout, truncated } = truncate(cleanedStdout, maxChars);

    const lines = [
        "## Deep review · context pack stage",
        "",
        `- Duration: ${formatDuration(packResult.durationMs)}`,
        `- Pack path: \`${packPath}\``,
        "",
        "### pi -p output",
        "",
        truncatedStdout || "(no stdout)",
    ];

    if (truncated) {
        lines.push("", "_stdout truncated for chat display_", "");
    }

    if (cleanedStderr) {
        lines.push("", "### stderr", "", cleanedStderr);
    }

    return lines.join("\n");
}

export function normalizeSectionLikeBoldMarkdown(markdown: string): string {
    if (!markdown.trim()) {
        return markdown;
    }

    const inputLines = markdown.replace(/\r\n/g, "\n").split("\n");
    const out: string[] = [];
    let inFence = false;

    const pushHeading = (headingText: string) => {
        const heading = headingText.trim().replace(/[:：]\s*$/, "");
        if (!heading) {
            return;
        }

        if (out.length > 0 && out[out.length - 1] !== "") {
            out.push("");
        }

        out.push(`### ${heading}`);
        out.push("");
    };

    for (const line of inputLines) {
        if (/^[ \t]*```/.test(line)) {
            inFence = !inFence;
            out.push(line);
            continue;
        }

        if (inFence) {
            out.push(line);
            continue;
        }

        const standaloneBold = line.match(/^[ \t]*\*\*([^*\n]{2,100})\*\*[ \t]*$/);
        if (standaloneBold) {
            pushHeading(standaloneBold[1]);
            continue;
        }

        const boldLabelWithBody = line.match(/^[ \t]*\*\*([^*\n:]{2,80}):\*\*[ \t]*(.+)$/);
        if (boldLabelWithBody) {
            pushHeading(boldLabelWithBody[1]);
            out.push(boldLabelWithBody[2].trim());
            continue;
        }

        out.push(line);
    }

    const collapsed: string[] = [];
    for (const line of out) {
        if (line === "" && collapsed[collapsed.length - 1] === "") {
            continue;
        }
        collapsed.push(line);
    }

    return collapsed.join("\n").trim();
}

function summarizeFinalMessage(
    options: DeepReviewOptions,
    packPath: string,
    packDurationMs: number,
    responses: ResponsesResult,
    totalDurationMs: number,
    debugDir?: string,
    artifacts?: OutputArtifacts,
): string {
    const costLine =
        responses.usage.estimatedCostUsd !== undefined
            ? `$${responses.usage.estimatedCostUsd.toFixed(6)} (estimated)`
            : "n/a (model price metadata unavailable)";
    const normalizedAnswer = normalizeSectionLikeBoldMarkdown(responses.answer || "");

    const lines = [
        `# Deep review (${options.model})`,
        "",
        `- Query: ${options.query}`,
        `- Context pack: \`${packPath}\``,
        `- Context pack time: ${formatDuration(packDurationMs)}`,
        `- Responses time: ${formatDuration(responses.durationMs)}`,
        `- Total time: ${formatDuration(totalDurationMs)}`,
        responses.responseId ? `- Response ID: \`${responses.responseId}\`` : undefined,
        "",
        "## Usage",
        "",
        `- Input tokens: ${responses.usage.inputTokens.toLocaleString()}`,
        `- Output tokens: ${responses.usage.outputTokens.toLocaleString()}`,
        `- Cached tokens: ${responses.usage.cachedTokens.toLocaleString()}`,
        `- Total tokens: ${responses.usage.totalTokens.toLocaleString()}`,
        `- Cost: ${costLine}`,
        "",
        "## Final response",
        "",
        normalizedAnswer || "(no output text returned)",
        debugDir ? "" : undefined,
        debugDir ? `Debug artifacts: \`${debugDir}\`` : undefined,
    ].filter((line): line is string => line !== undefined);

    if (artifacts) {
        lines.push(
            "",
            "## Handoff",
            "",
            `- Output directory: \`${artifacts.directory}\``,
            `- Answer file: \`${artifacts.answerPath}\``,
            `- Thinking file: \`${artifacts.thinkingPath}\``,
            `- Report file: \`${artifacts.reportPath}\``,
            `- Metadata file: \`${artifacts.metadataPath}\``,
            artifacts.clipboard.copied
                ? `- Clipboard: copied answer via ${artifacts.clipboard.method ?? "clipboard tool"}`
                : `- Clipboard: not copied (${artifacts.clipboard.error ?? "no clipboard backend"})`,
        );
    }

    return lines.join("\n");
}

export default function deepReviewExtension(pi: ExtensionAPI): void {
    let activeRun: ActiveRun | null = null;

    const markdownTypes = ["deep-review-help", "deep-review-context-pack", "deep-review-result", "deep-review-error"];

    for (const customType of markdownTypes) {
        pi.registerMessageRenderer(customType, (message) => {
            const content =
                typeof message.content === "string"
                    ? message.content
                    : message.content
                          .map((block) => {
                              if (block.type === "text") {
                                  return block.text;
                              }
                              return "[non-text content omitted]";
                          })
                          .join("\n");

            return new Markdown(content, 0, 0, MARKDOWN_THEME);
        });
    }

    pi.registerCommand("deep-review-stop", {
        description: "Stop an in-flight /deep-review run",
        handler: async (_args, ctx) => {
            if (!activeRun) {
                if (ctx.hasUI) {
                    ctx.ui.notify("No deep-review run in progress", "info");
                }
                return;
            }

            activeRun.controller.abort();

            if (activeRun.child) {
                activeRun.child.kill("SIGTERM");
            }
        },
    });

    pi.registerCommand("deep-review", {
        description: "Run pr-context-packer via pi -p, then stream OpenAI Responses in real time",
        handler: async (rawArgs, ctx) => {
            if (activeRun) {
                if (ctx.hasUI) {
                    ctx.ui.notify("deep-review already running. Use /deep-review-stop first.", "warning");
                }
                return;
            }

            const parsed = parseOptions(rawArgs, ctx.cwd);
            if (!parsed.ok && "help" in parsed) {
                pi.sendMessage({ customType: "deep-review-help", content: HELP_TEXT, display: true });
                return;
            }

            if (!parsed.ok) {
                const content = `deep-review argument error: ${parsed.message}\n\nUse /deep-review --help for usage.`;
                pi.sendMessage({ customType: "deep-review-error", content, display: true });
                if (ctx.hasUI) {
                    ctx.ui.notify(parsed.message, "error");
                }
                return;
            }

            const options = parsed.options;

            let skillPath: string;
            try {
                skillPath = await resolveContextPackerSkillPath(options.projectDir);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                pi.sendMessage({ customType: "deep-review-error", content: message, display: true });
                if (ctx.hasUI) {
                    ctx.ui.notify(message, "error");
                }
                return;
            }

            const active: ActiveRun = {
                controller: new AbortController(),
            };
            activeRun = active;

            void (async () => {
                const startedAt = Date.now();

                const live: LiveState = {
                    startedAt,
                    phase: "context-pack",
                    thinking: "",
                    answer: "",
                    responsesEventCount: 0,
                    lastResponsesEventType: undefined,
                    lastRenderAt: 0,
                };

                if (ctx.hasUI) {
                    ctx.ui.setStatus("deep-review", ctx.ui.theme.fg("accent", "deep-review: context pack"));
                    ctx.ui.setWorkingMessage("deep-review running...");
                    renderLiveWidget(ctx, live, true);
                }

                const renderTicker = ctx.hasUI
                    ? setInterval(() => {
                          renderLiveWidget(ctx, live, true);
                      }, WIDGET_TICK_MS)
                    : undefined;

                let debugDir: string | undefined;

                try {
                    const packResult = await runContextPackViaPi(options, ctx.cwd, skillPath, active);

                    const cleanedPackOutput = stripMarkdownFenceLines(stripAnsi(packResult.stdout));
                    const cleanedPackStderr = stripMarkdownFenceLines(stripAnsi(packResult.stderr));
                    const packPath = await extractContextPackPath(`${cleanedPackOutput}\n${cleanedPackStderr}`);

                    if (packResult.exitCode !== 0) {
                        if (active.controller.signal.aborted) {
                            throw new Error("Request was aborted");
                        }

                        const stdoutSnippet = truncate(cleanedPackOutput, 8000).text.trim();
                        const stderrSnippet = truncate(cleanedPackStderr, 8000).text.trim();
                        const contentLines = ["deep-review failed."];

                        if (stderrSnippet) {
                            contentLines.push("", "### stderr", "", "```text", stderrSnippet, "```");
                        }

                        if (stdoutSnippet) {
                            contentLines.push("", "### stdout", "", "```text", stdoutSnippet, "```");
                        }

                        pi.sendMessage({
                            customType: "deep-review-error",
                            content: contentLines.join("\n"),
                            display: true,
                        });
                        return;
                    }

                    if (!packPath) {
                        const content = [
                            "deep-review could not find the generated pack path in pi -p output.",
                            "",
                            "```text",
                            truncate(cleanedPackOutput, 12000).text,
                            "```",
                        ].join("\n");
                        pi.sendMessage({ customType: "deep-review-error", content, display: true });
                        return;
                    }

                    pi.sendMessage({
                        customType: "deep-review-context-pack",
                        content: summarizeContextPackMessage(packResult, packPath),
                        display: true,
                    });

                    const contextText = await readFile(packPath, "utf8");

                    live.phase = "responses";
                    live.responsesEventCount = 0;
                    live.lastResponsesEventType = undefined;

                    if (ctx.hasUI) {
                        ctx.ui.setStatus("deep-review", ctx.ui.theme.fg("accent", "deep-review: responses stream"));
                        renderLiveWidget(ctx, live, true);
                    }

                    const responses = await streamResponses(
                        options,
                        contextText,
                        ctx,
                        active.controller.signal,
                        (delta) => {
                            live.thinking += delta;
                            renderLiveWidget(ctx, live);
                        },
                        (delta) => {
                            live.answer += delta;
                            renderLiveWidget(ctx, live);
                        },
                        (eventType) => {
                            live.responsesEventCount += 1;
                            live.lastResponsesEventType = eventType;
                            renderLiveWidget(ctx, live);
                        },
                    );

                    if (options.debug) {
                        debugDir = await mkdtemp(path.join(os.tmpdir(), "deep-review-"));
                        await writeFile(path.join(debugDir, "context-pack-output.txt"), cleanedPackOutput, "utf8");
                        await writeFile(
                            path.join(debugDir, "responses-events.jsonl"),
                            `${responses.debugEvents.join("\n")}\n`,
                            "utf8",
                        );

                        if (responses.debugPayload) {
                            await writeFile(
                                path.join(debugDir, "responses-request.json"),
                                `${responses.debugPayload}\n`,
                                "utf8",
                            );
                        }
                    }

                    const totalDurationMs = Date.now() - startedAt;
                    const preliminaryContent = summarizeFinalMessage(
                        options,
                        packPath,
                        packResult.durationMs,
                        responses,
                        totalDurationMs,
                        debugDir,
                    );

                    let artifacts: OutputArtifacts | undefined;

                    try {
                        artifacts = await writeOutputArtifacts(
                            options,
                            packPath,
                            responses,
                            totalDurationMs,
                            preliminaryContent,
                            debugDir,
                        );
                    } catch (artifactError) {
                        const artifactMessage =
                            artifactError instanceof Error ? artifactError.message : String(artifactError);

                        if (ctx.hasUI) {
                            ctx.ui.notify(`Could not write deep-review artifacts: ${artifactMessage}`, "warning");
                        }
                    }

                    const finalContent = summarizeFinalMessage(
                        options,
                        packPath,
                        packResult.durationMs,
                        responses,
                        totalDurationMs,
                        debugDir,
                        artifacts,
                    );

                    if (artifacts) {
                        await writeFile(artifacts.reportPath, `${finalContent}\n`, "utf8");
                    }

                    pi.sendMessage({ customType: "deep-review-result", content: finalContent, display: true });

                    if (ctx.hasUI) {
                        if (artifacts?.clipboard.copied) {
                            ctx.ui.notify("deep-review complete · answer copied to clipboard", "info");
                        } else {
                            ctx.ui.notify("deep-review complete", "info");
                        }
                    }
                } catch (error) {
                    const stopped = active.controller.signal.aborted;
                    const message = error instanceof Error ? error.message : String(error);

                    if (stopped) {
                        pi.sendMessage({
                            customType: "deep-review-result",
                            content: "deep-review stopped.",
                            display: true,
                        });
                    } else {
                        const content = `deep-review failed: ${message}\n\nUse /deep-review --help for options.`;
                        pi.sendMessage({ customType: "deep-review-error", content, display: true });
                        if (ctx.hasUI) {
                            ctx.ui.notify(message, "error");
                        }
                    }
                } finally {
                    if (renderTicker) {
                        clearInterval(renderTicker);
                    }
                    if (ctx.hasUI) {
                        ctx.ui.setStatus("deep-review", undefined);
                        ctx.ui.setWidget("deep-review-live", undefined);
                        ctx.ui.setWorkingMessage();
                    }
                    activeRun = null;
                }
            })();

            if (ctx.hasUI) {
                ctx.ui.notify("deep-review started · use /deep-review-stop to stop", "info");
            }
        },
    });
}
