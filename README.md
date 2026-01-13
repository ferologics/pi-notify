# pi-extensions

Custom extensions for [pi-coding-agent](https://github.com/badlogic/pi-mono).

## Extensions

| Extension | Description |
| --- | --- |
| [`question`](question/) | Single question tool with options and inline "Other" editor |
| [`questionnaire`](questionnaire/) | Multi-question tool with tab navigation and custom input |
| [`better-plan-mode`](better-plan-mode/) | Read-only plan mode with progress tracking and questionnaire support |

Each extension folder contains full usage details and examples.

## Setup

Symlink extensions to `~/.pi/agent/extensions/`:

```bash
ln -s ~/.pi/repos/pi-extensions/question ~/.pi/agent/extensions/
ln -s ~/.pi/repos/pi-extensions/questionnaire ~/.pi/agent/extensions/
ln -s ~/.pi/repos/pi-extensions/better-plan-mode ~/.pi/agent/extensions/
```
