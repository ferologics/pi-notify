---
name: multi-review
description: Multi-model code review. Runs code-review skill with 3 models in parallel, then synthesizes findings.
---

# Multi Review

Runs the `code-review` skill with 3 different models in parallel, then synthesizes.

## Process

1. **Get the PR diff** (same as code-review)
   ```bash
   # If PR number provided, use it. Otherwise current branch.
   gh pr diff [PR_NUMBER] > /tmp/pr-diff.txt
   ```

2. **Run 3 parallel reviews via bash**
   ```bash
   pi -p --model claude-opus-4-5 "Read and follow ~/dev/pi-skills/code-review/SKILL.md to review the PR. Diff is at /tmp/pr-diff.txt" > /tmp/review-opus.md &
   pi -p --model gpt-5.2-codex "Read and follow ~/dev/pi-skills/code-review/SKILL.md to review the PR. Diff is at /tmp/pr-diff.txt" > /tmp/review-codex.md &
   pi -p --model gemini-2.5-pro "Read and follow ~/dev/pi-skills/code-review/SKILL.md to review the PR. Diff is at /tmp/pr-diff.txt" > /tmp/review-gemini.md &
   wait
   ```

3. **Synthesize findings**
   Read all 3 review files and combine:
   - 🔴 **Consensus** - issues found by 2+ models (high confidence)
   - 🟡 **Unique** - found by only one model (note which)
   - Resolve contradictions, filter obvious false positives
   - Final verdict: merge / fix first / needs discussion
