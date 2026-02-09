# AGENTS.md - AI Assistant Context

Custom pi-coding-agent extensions.

## Development

```bash
just              # List all commands
just compile      # Type-check with tsc
just fmt          # Format with Biome
just lint         # Lint with Biome
just check        # Format + lint + compile (full check)

just setup-hooks  # Install pre-commit hook
just remove-hooks # Remove pre-commit hook
```

Pre-commit hook runs `just check` before each commit.

## Structure

Each extension is a folder with an `index.ts` entry point:

```
extension-name/
├── index.ts      # Main extension code
└── README.md     # Usage docs
```

Current extensions:
- `deep-review`
- `plan-mode`

## Type Checking

Extensions import from pi's packages. The `tsconfig.json` maps these:
- `@mariozechner/pi-coding-agent` - Extension API
- `@mariozechner/pi-agent-core` - Message types
- `@mariozechner/pi-ai` - Content types
- `@mariozechner/pi-tui` - TUI utilities
- `@sinclair/typebox` - Schema types

## Style

- Biome handles formatting and linting
- Spaces for indentation (4-space)
- 120 char line width
