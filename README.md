# pi-smart-compact

Smart context compaction extension for [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) — LLM-assisted relevance filtering during context compaction.

## What It Does

When pi's context window fills up, it automatically compacts old messages — but standard compaction is lossy and dumb (just truncates or summarizes everything equally). pi-smart-compact replaces this with **intelligent, LLM-driven compaction**:

- **Relevance analysis** — Uses a lightweight LLM call to evaluate which messages are still relevant to the current task
- **Selective preservation** — Keeps critical context (decisions, code changes, error fixes) while summarizing routine operations
- **Configurable thresholds** — Control when compaction triggers and how aggressive it is

## Installation

```bash
pi install git:github.com/catlain/pi-smart-compact
```

## Commands

| Command | Description |
|---------|-------------|
| `/smart-compact` | Manually trigger smart compaction |
| `/smart-compact-config` | Configure compaction rules and thresholds |

## When It Activates

pi-smart-compact hooks into pi's `session_before_compact` event. When pi decides it needs to compact:

1. The extension intercepts the compaction request
2. Sends messages to a lightweight LLM for relevance scoring
3. Returns a filtered/summarized context that preserves key information
4. pi continues with the optimized context

## Configuration

```json
{
  "smart-compact": {
    "enabled": true,
    "model": "glm-4-flash",
    "threshold": 0.7
  }
}
```

## Use Cases

- **Long coding sessions** — Agent stays focused on the task even after 50+ tool calls
- **Multi-file refactoring** — Preserves cross-file dependency knowledge during compaction
- **Research workflows** — Keeps key findings while discarding intermediate search noise

## Dependencies

- `@earendil-works/pi-coding-agent` — ExtensionAPI (peer)

## License

MIT
