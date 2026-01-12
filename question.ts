/**
 * Question Tool - Let the LLM ask the user a question with options
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

interface QuestionDetails {
	question: string;
	options: string[];
	answer: string | null;
	wasCustom?: boolean; // true if user selected "Other..." and typed custom answer
}

const QuestionParams = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	options: Type.Array(Type.String(), { description: "Options for the user to choose from" }),
});

export default function (pi: ExtensionAPI) {
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

			// Handle "Other..." selection with free-text input
			if (answer === "Other...") {
				const customAnswer = await ctx.ui.input(`${params.question}`);
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
			if (args.options?.length) {
				// Show options including "Other..." that will be added
				const displayOptions = [...args.options, "Other..."];
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

			// Distinguish between selected option vs custom written answer
			if (details.wasCustom) {
				return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "(wrote) ") + theme.fg("accent", details.answer), 0, 0);
			}
			return new Text(theme.fg("success", "✓ ") + theme.fg("accent", details.answer), 0, 0);
		},
	});
}
