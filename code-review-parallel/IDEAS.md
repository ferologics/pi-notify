# Parallel Code Review Skill - Ideas

## The Vision
Run code reviews with multiple models in parallel, isolated from local working directory.

Currently: Open 2 tabs, manually switch models, run review in each, mentally synthesize.

Goal: Single command → spawns isolated reviews → synthesizes findings.

## Key Requirements

### 1. Model Diversity
- `reviewer-opus` (claude-opus-4-5) - deep reasoning
- `reviewer-codex` (gpt-5.2-codex) - different perspective
- Reasoning: high

### 2. Branch Isolation
Don't want to be blocked by local checkout. Options:
- **Git worktrees**: `git worktree add ../review-<branch> <branch>`
- **Shallow clone to temp**: `git clone --depth=1 --branch <branch> . /tmp/review-xyz`
- **Just read remote diff**: `git fetch && git diff origin/main...origin/<branch>`

Worktrees seem cleanest - persistent, fast, proper git state.

### 3. Fire and Forget
- Start review, continue working on other stuff
- Get notified when done
- Results saved somewhere accessible

### 4. Synthesized Output
Main agent or skill combines both reviews:
- Common findings (high confidence)
- Unique findings from each model
- Disagreements (need human judgment)

## Sketch: Enhanced Code Review Skill

```markdown
# SKILL.md

## Triggers
- "review PR #123"
- "parallel review branch feature-x"

## Process
1. Create worktree (or use existing)
2. Spawn reviewer-opus and reviewer-codex in parallel
3. Wait for both
4. Synthesize findings
5. Cleanup worktree (optional)
6. Notify user

## Output
Combined review with:
- 🔴 Critical (both agree)
- 🟠 Major (both agree)
- 🟡 Minor
- 🔵 Opus-only findings
- 🟣 Codex-only findings
- ❓ Disagreements
```

## Open Questions

- [ ] How to set reasoning=high in agent frontmatter? Is that a thing?
- [ ] Worktree management - create/cleanup per review or persistent?
- [ ] How to pass branch/PR context to subagents?
- [ ] Where to store results? Session? File? Notification?
- [ ] Can subagents run in different cwd (the worktree)?

## Next Steps

1. Test basic subagent parallel review (same cwd, just different models)
2. Figure out worktree isolation pattern
3. Build skill that orchestrates this
4. Add synthesis step

## Related
- Subagent extension: `~/.pi/agent/extensions/subagent`
- Code review skill: `~/.pi/agent/skills/code-review`
- Reviewer agents: `~/.pi/agent/agents/reviewer-*.md`
