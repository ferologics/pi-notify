/**
 * Question Tool - Let the LLM ask the user a question with options
 * Supports multi-line input for "Other..." option with options visible
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

interface QuestionDetails {
	question: string;
	options: string[];
	answer: string | null;
	wasCustom?: boolean;
}

const QuestionParams = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	options: Type.Array(Type.String(), { description: "Options for the user to choose from" }),
});

export default function question(pi: ExtensionAPI) {
	pi.registerTool({
		name: "question",
		label: "Question",
		description: "Ask the user a question and let them pick from options. Use when you need user input to proceed.",
		parameters: QuestionParams,

		async execute(_toolCallId, params, _onUpdate, ctx, _signal) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: UI not available (running in non-interactive mode)" }],
					details: { question: params.question, options: params.options, answer: null } as QuestionDetails,
				};
			}

			if (params.options.length === 0) {
				return {
					content: [{ type: "text", text: "Error: No options provided" }],
					details: { question: params.question, options: [], answer: null } as QuestionDetails,
				};
			}

			// Add "Other..." option for free-text input
			const optionsWithOther = [...params.options, "Other..."];
			const answer = await ctx.ui.select(params.question, optionsWithOther);

			if (answer === undefined) {
				return {
					content: [{ type: "text", text: "User cancelled the selection" }],
					details: { question: params.question, options: params.options, answer: null } as QuestionDetails,
				};
			}

			// Handle "Other..." selection with multi-line editor
			if (answer === "Other...") {
				const customAnswer = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
					let cachedLines: string[] | undefined;
					
					const editorTheme: EditorTheme = {
						borderColor: (s) => theme.fg("accent", s),
						selectList: {
							selectedPrefix: (t) => theme.fg("accent", t),
							selectedText: (t) => theme.fg("accent", t),
							description: (t) => theme.fg("muted", t),
							scrollInfo: (t) => theme.fg("dim", t),
							noMatch: (t) => theme.fg("warning", t),
						},
					};
					const editor = new Editor(editorTheme);
					
					editor.onSubmit = (value) => {
						done(value.trim() || null);
					};

					function handleInput(data: string) {
						if (matchesKey(data, Key.escape)) {
							done(null);
							return;
						}
						editor.handleInput(data);
						cachedLines = undefined;
						tui.requestRender();
					}

					function render(width: number): string[] {
						if (cachedLines) return cachedLines;
						
						const lines: string[] = [];
						const add = (s: string) => lines.push(truncateToWidth(s, width));

						add(theme.fg("accent", "─".repeat(width)));
						add(theme.fg("text", " " + params.question));
						lines.push("");
						
						// Show options for reference
						for (let i = 0; i < params.options.length; i++) {
							add("  " + theme.fg("text", `${i + 1}. ${params.options[i]}`));
						}
						add("  " + theme.fg("accent", `${params.options.length + 1}. Other... ✎`));
						
						lines.push("");
						add(theme.fg("muted", " Your answer:"));
						for (const line of editor.render(width - 2)) {
							add(" " + line);
						}
						lines.push("");
						add(theme.fg("dim", " Enter to submit • Esc to cancel"));
						add(theme.fg("accent", "─".repeat(width)));

						cachedLines = lines;
						return lines;
					}

					return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
				});

				if (!customAnswer) {
					return {
						content: [{ type: "text", text: "User cancelled the input" }],
						details: { question: params.question, options: params.options, answer: null, wasCustom: false } as QuestionDetails,
					};
				}
				return {
					content: [{ type: "text", text: `User wrote: ${customAnswer}` }],
					details: { question: params.question, options: params.options, answer: customAnswer, wasCustom: true } as QuestionDetails,
				};
			}

			return {
				content: [{ type: "text", text: `User selected: ${answer}` }],
				details: { question: params.question, options: params.options, answer } as QuestionDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("question ")) + theme.fg("muted", args.question);
			const opts = Array.isArray(args.options) ? args.options : [];
			if (opts.length) {
				const displayOptions = [...opts, "Other..."];
				text += `\n${theme.fg("dim", `  Options: ${displayOptions.join(", ")}`)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as QuestionDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.answer === null) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}

			if (details.wasCustom) {
				return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "(wrote) ") + theme.fg("accent", details.answer), 0, 0);
			}
			return new Text(theme.fg("success", "✓ ") + theme.fg("accent", details.answer), 0, 0);
		},
	});
}
