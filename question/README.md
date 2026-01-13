# question

Single question tool with options and an inline "Other" editor.

## Features

- Options with optional descriptions
- "Other..." free-text input (multi-line)
- Escape returns to options
- Numbered options in output

## Usage

```typescript
// Simple options
{ question: "Pick one", options: ["Yes", "No"] }

// With descriptions
{ question: "Pick one", options: [
  { label: "Yes", description: "Confirm the action" },
  { label: "No", description: "Cancel" }
]}
```
