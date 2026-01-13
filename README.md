# pi-extensions

Custom extensions for [pi-coding-agent](https://github.com/badlogic/pi-mono).

## Extensions

### question

Single question with options. Full custom UI with inline "Type something" editor.

**Features:**
- Options with optional descriptions
- "Other..." option for free-text input (multi-line)
- Escape in editor returns to options
- Numbered options in output

**Usage:**
```typescript
// Simple options
{ question: "Pick one", options: ["Yes", "No"] }

// With descriptions
{ question: "Pick one", options: [
  { label: "Yes", description: "Confirm the action" },
  { label: "No", description: "Cancel" }
]}
```

### questionnaire

Multi-question tool with tab navigation.

**Features:**
- Single question: simple options list
- Multiple questions: tab bar navigation
- "Type something" option with options visible while typing
- Numbered options in output

**Usage:**
```typescript
{
  questions: [{
    id: "db",
    label: "Database", 
    prompt: "Which database?",
    options: [
      { value: "pg", label: "PostgreSQL", description: "Relational" },
      { value: "mongo", label: "MongoDB", description: "Document store" }
    ],
    allowOther: true
  }]
}
```

### plan-mode

Read-only exploration mode for safe code analysis. Fork of pi's bundled plan-mode with customizations.

**Features:**
- Restricts tools to read-only operations
- Extracts plan steps from `Plan:` sections
- Progress tracking during execution
- Questionnaire tool enabled for clarifying questions

**Commands:**
- `/plan` - Toggle plan mode
- `Shift+P` - Toggle plan mode (shortcut)

## Setup

Symlink extensions to `~/.pi/agent/extensions/`:

```bash
ln -s ~/.pi/repos/pi-extensions/question ~/.pi/agent/extensions/
ln -s ~/.pi/repos/pi-extensions/questionnaire ~/.pi/agent/extensions/
ln -s ~/.pi/repos/pi-extensions/plan-mode ~/.pi/agent/extensions/
```
