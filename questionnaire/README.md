# questionnaire

Multi-question tool with tab navigation and optional custom input.

## Features

- Single question: simple options list
- Multiple questions: tab bar navigation between questions
- "Type something" option with options visible while typing
- Numbered options in output

## Usage

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
