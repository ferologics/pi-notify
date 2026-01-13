# better-plan-mode

Read-only exploration mode for safe code analysis. Fork of pi's bundled plan-mode with customizations.

## Features

- Restricts tools to read-only operations (bash uses an allowlist)
- Extracts plan steps from `Plan:` sections
- Progress tracking during execution via `[DONE:n]` tags
- Questionnaire tool enabled for clarifying questions
- Plan prompt suggests using the brave-search skill for web research

## Commands

- `/plan` - Toggle plan mode
- `Shift+P` - Toggle plan mode (shortcut)

## Usage

- Write a plan using a numbered list under a `Plan:` header.
- Execute the plan and include `[DONE:n]` tags in responses to mark steps complete.
