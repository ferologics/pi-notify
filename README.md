# pi-shit

Combined Pi package for personal extensions + skills.

## Structure

- `extensions/` → Pi extensions (for example `deep-review`, `plan-mode`)
- `skills/` → Pi skills (including `pr-context-packer`)

## Install in Pi

```bash
pi install /Users/zen/dev/pi-shit
```

Or from git once remote exists:

```bash
pi install git:github.com/ferologics/pi-shit
```

## Notes

- `deep-review` resolves `pr-context-packer` from bundled `skills/pr-context-packer/SKILL.md` first (unless `DEEP_REVIEW_CONTEXT_PACKER_SKILL` is set).
- Keep this repo as the single source of truth for shipping both extensions and skills together.
