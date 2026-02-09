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

## Sync

This repo is assembled with git subtrees:

- `skills/` ← `pi-skills`
- `extensions/` ← `pi-extensions`
- `extensions/pi-notify` ← `pi-notify`

Update all sources with:

```bash
just update
```

Or update individually:

```bash
just update-skills
just update-extensions
just update-notify
```
