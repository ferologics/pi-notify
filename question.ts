/**
 * Question Tool - Single question with options
 * Full custom UI: options list + inline editor for "Other..."
 * Escape in editor returns to options, Escape in options cancels
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

			// Build options with "Other..."
			const allOptions = [...params.options, "Other..."];

			const result = await ctx.ui.custom<{ answer: string; wasCustom: boolean } | null>((tui, theme, _kb, done) => {
				let optionIndex = 0;
				let editMode = false;
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
					const trimmed = value.trim();
					if (trimmed) {
						done({ answer: trimmed, wasCustom: true });
					} else {
						// Empty submit - go back to options
						editMode = false;
						editor.setText("");
						refresh();
					}
				};

				function refresh() {
					cachedLines = undefined;
					tui.requestRender();
				}

				function handleInput(data: string) {
					if (editMode) {
						if (matchesKey(data, Key.escape)) {
							// Return to options
							editMode = false;
							editor.setText("");
							refresh();
							return;
						}
						editor.handleInput(data);
						refresh();
						return;
					}

					// Options navigation
					if (matchesKey(data, Key.up)) {
						optionIndex = Math.max(0, optionIndex - 1);
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
						refresh();
						return;
					}

					// Select option
					if (matchesKey(data, Key.enter)) {
						const selected = allOptions[optionIndex];
						if (selected === "Other...") {
							editMode = true;
							refresh();
						} else {
							done({ answer: selected, wasCustom: false });
						}
						return;
					}

					// Cancel
					if (matchesKey(data, Key.escape)) {
						done(null);
					}
				}

				function render(width: number): string[] {
					if (cachedLines) return cachedLines;

					const lines: string[] = [];
					const add = (s: string) => lines.push(truncateToWidth(s, width));

					add(theme.fg("accent", "─".repeat(width)));
					add(theme.fg("text", " " + params.question));
					lines.push("");

					// Options
					for (let i = 0; i < allOptions.length; i++) {
						const opt = allOptions[i];
						const selected = i === optionIndex;
						const isOther = opt === "Other...";
						const prefix = selected ? theme.fg("accent", "> ") : "  ";

						if (isOther && editMode) {
							add(prefix + theme.fg("accent", `${i + 1}. ${opt} ✎`));
						} else if (selected) {
							add(prefix + theme.fg("accent", `${i + 1}. ${opt}`));
						} else {
							add("  " + theme.fg("text", `${i + 1}. ${opt}`));
						}
					}

					// Editor (only in edit mode)
					if (editMode) {
						lines.push("");
						add(theme.fg("muted", " Your answer:"));
						for (const line of editor.render(width - 2)) {
							add(" " + line);
						}
					}

					lines.push("");
					if (editMode) {
						add(theme.fg("dim", " Enter to submit • Esc to go back"));
					} else {
						add(theme.fg("dim", " ↑↓ navigate • Enter to select • Esc to cancel"));
					}
					add(theme.fg("accent", "─".repeat(width)));

					cachedLines = lines;
					return lines;
				}

				return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
			});

			if (!result) {
				return {
					content: [{ type: "text", text: "User cancelled the selection" }],
					details: { question: params.question, options: params.options, answer: null } as QuestionDetails,
				};
			}

			const prefix = result.wasCustom ? "User wrote: " : "User selected: ";
			return {
				content: [{ type: "text", text: prefix + result.answer }],
				details: { question: params.question, options: params.options, answer: result.answer, wasCustom: result.wasCustom } as QuestionDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("question ")) + theme.fg("muted", args.question);
			const opts = Array.isArray(args.options) ? args.options : [];
			if (opts.length) {
				text += `\n${theme.fg("dim", `  Options: ${[...opts, "Other..."].join(", ")}`)}`;
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
