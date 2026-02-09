# Subagents Exploration

Exploring pi subagents for parallel task delegation.

## References
- Official example: https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/subagent
- Async variant: https://github.com/nicobailon/pi-async-subagents

## Setup Status
- [x] Clone pi-async-subagents to `~/.pi/repos/`
- [x] Symlink official subagent to `~/.pi/agent/extensions/`
- [x] Compare official vs async variant
- [x] Create agent definitions in `~/.pi/agent/agents/`
  - researcher.md - web search, docs
  - coder.md - implementation
  - reviewer.md - code review
- [x] Default all agents to `model: claude-4-opus`

## Key Differences: Official vs Async

| Feature | Official | pi-async-subagents |
|---------|----------|-------------------|
| Async (background) mode | ❌ | ✅ |
| Debug artifacts | ❌ | ✅ |
| Output truncation | ❌ | ✅ |
| Session sharing (gist) | ❌ | ✅ |
| Progress widget | ❌ | ✅ |
| Status tool | ❌ | ✅ |
| Code complexity | ~600 lines | ~1700 lines |

## Testing TODO

### Basic Functionality
- [ ] Test single agent delegation
- [ ] Test parallel execution (3 asks → 3 agents simultaneously)
- [ ] Test chain mode with `{previous}` handoffs

### Context & Communication
- [ ] Verify context isolation between agents
- [ ] Test: Can subagents use questionnaire tool to ask user questions?
- [ ] Test: How does main agent receive/interpret subagent output?
- [ ] Test: What happens if subagent context grows too large?

### Steering & Control
- [ ] Can main agent "supervise" and correct subagents mid-task?
- [ ] Design agent prompts that encourage asking vs assuming
- [ ] Test interrupting/aborting a running subagent

## Questions to Answer

1. **Questionnaire from subagents**: Do subagents have access to questionnaire tool? If not, can we add it to their tools list?

2. **Steering mid-task**: Chain mode passes `{previous}` but doesn't allow intervention. Is there a pattern for main agent to review intermediate results and course-correct?

3. **Parallel overhead**: With MAX_CONCURRENCY=4, what's the actual speedup vs sequential? Any token/cost implications?

4. **Error handling**: When a subagent fails, how does main agent know what went wrong? Is the error context sufficient?

5. **Model costs**: With Opus for all agents, what's typical cost for a 3-agent parallel run? Worth having cheaper agents for simple tasks?

## Model Strategy

| Agent | Model | Rationale |
|-------|-------|-----------|
| Default | claude-4-opus | Best reasoning, worth the cost |
| researcher | claude-4-opus | Good judgment on sources |
| coder | claude-4-opus | Complex code needs best model |
| reviewer | claude-4-opus | Nuanced feedback |
| (future) scout | sonnet? | If speed > quality for simple lookups |

## Reality Check: Orchestration Limitations

**Neither extension supports true orchestration:**
- Once spawned, subagents run to completion
- No mid-task steering from main agent
- Questions via questionnaire go to USER, not main agent
- Chain mode has `{previous}` but no intervention points

**What IS supported:**
- Fire-and-forget parallel execution
- Sequential handoffs via chain
- Post-completion review by main agent

## Ideas to Explore

### Multi-Model Synthesis
Spawn same task to different models, synthesize findings:
```
1. Main identifies analysis task
2. Spawn analyst-opus and analyst-codex in parallel
3. Both return structured output
4. Main synthesizes/compares findings
```

Agents created:
- `analyst-opus.md` (claude-4-opus)
- `analyst-codex.md` (codex)

### Supervisor Pattern (Post-Completion)
Main agent delegates, then reviews subagent output after completion:
```
1. Main identifies 3 tasks
2. Spawn 3 subagents in parallel
3. Main reviews each result AFTER all complete
4. If issues, main can re-delegate or fix directly
```

### Question Escalation (Limited)
Subagents CAN have questionnaire tool, but questions go to user not main:
- Add questionnaire to subagent tools
- Prompt subagents to prefer asking over assuming
- User answers, or aborts and provides context to main

### Structured Output
Have subagents return structured JSON for easier parsing:
- Status: success/partial/failed
- Confidence: high/medium/low
- Questions: [] (things that need clarification)
- Result: actual output

## Testing Both Extensions

Can only have one `subagent` tool loaded at a time (same name).

**Currently active:** Official (bundled)

**To switch:**
```bash
# Switch to async variant:
rm ~/.pi/agent/extensions/subagent
ln -s ~/.pi/repos/pi-async-subagents ~/.pi/agent/extensions/subagent

# Switch back to official:
rm ~/.pi/agent/extensions/subagent
ln -s /opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/subagent ~/.pi/agent/extensions/subagent
```

## Decision: Which Extension?

**TBD after testing**

| Criteria | Official | Async |
|----------|----------|-------|
| Simplicity | ✅ 600 lines | ❌ 1700 lines |
| Debugging | Basic | ✅ Artifacts, logs |
| Background runs | ❌ | ✅ |
| Maintained by | Mario (pi author) | Community |

Options:
1. Use official as-is (simpler, maintained)
2. Use pi-async-subagents (more features, community)
3. Fork official and add specific features we need
4. Write our own minimal version

## Next Steps

1. Pick a real task to test with (e.g., "add a feature to pi-extensions")
2. Run single, parallel, and chain modes
3. Document what works and what doesn't
4. Make decision on which extension to use
