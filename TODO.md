# TODO

## Plan mode improvements

- Improve plan mode to better infer steps as todos
    - Step 1:, Step 2:, etc.
    - ### 8., ### 9., etc.
- Allow referencing of files in plan refinement editor
- Allow find tool use in plan mode
- Questionnaire options can mark a choice as `(recommended)`
- Questionnaire question text gets truncated; render multiline/compact so full prompt is readable
- Questionnaire prompt: model misreads "Type something" and suggests "Other (describe)"; prompt should steer to typed answer handling / accept variants
- Plan-mode todo widget lines are truncated; render multiline/compact so full items are readable

## Explore: Replace built-in todos with file-based tracking

**Context:** Amp removed their todolist feature. Mario says todos confuse models. Same vibes here.

https://x.com/thorstenball/status/2010757205084312026

### Problems with built-in todos
- Models get confused about when/how to update them
- Extra cognitive overhead in system prompt
- State management complexity
- Often out of sync with actual progress

### Alternative: Simple file-based approach
- `todo.md` or `## TODO` section in README
- Model reads/writes it like any other file
- No special tools or state to manage
- Transparent and version-controlled
- Works with existing edit/write tools

### Questions to explore
- [ ] Is the `[DONE:n]` tag approach in plan-mode sufficient?
- [ ] Should we strip out todolist tool entirely?
- [ ] Does a simple markdown checklist work better in practice?
- [ ] How does ralph-wiggum handle task tracking? (uses taskContent markdown)

### Next steps
- Try using just markdown checklists for a while
- Compare with current `[DONE:n]` progress tracking
- Decide whether to simplify or remove todo-related features
