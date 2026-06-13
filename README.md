> 📖 **[pi-atelier 实战指南](https://catlain.github.io/pi-atelier/)** — 从零教会你使用 pi-atelier 扩展生态，包含完整示例和最佳实践。

[English](README.en.md) | 程序中文文档

# pi-smart-compact

[源码仓库](https://github.com/catlain/pi-smart-compact) | [npm](https://www.npmjs.com/package/pi-ate-smart-compact)

Intelligent context compaction for [pi](https://github.com/earendil-works/pi-coding-agent) — two-phase LLM-driven compression that preserves critical context while aggressively trimming noise.

## Why You Need It

When pi's context window fills up, it compacts old messages — but the default compaction is lossy and indiscriminate. It summarizes everything equally, losing track of key decisions, code changes, and error fixes that happened 20 turns ago.

pi-smart-compact replaces this with **targeted, intelligent compaction**:

- **Phase 1 — Intent extraction** — Extracts user and AI non-tool text, feeds it to an LLM to generate a concise intent summary of the conversation
- **Phase 2 — Tool verdict** — Evaluates each tool call against the intent: keep the ones still relevant, discard the rest
- **Result** — A compact context that preserves *why* you're doing something and the *important tool outputs*, while dropping routine `read`/`grep` noise

## How It Works

```
Context window full → pi triggers compaction
        │
        ▼
┌─── Phase 1: Intent Extraction ────────────┐
│                                            │
│  User + AI text (no tool noise)            │
│         │                                  │
│         ▼                                  │
│  LLM → "User is refactoring auth module,   │
│         migrating from JWT to session       │
│         cookies, 3 of 5 files done"         │
│                                            │
└────────────────────────────────────────────┘
        │
        ▼
┌─── Phase 2: Tool Verdict ─────────────────┐
│                                            │
│  For each tool call pair:                  │
│    [read src/auth/jwt.ts] → ❌ Discard     │
│    [edit src/auth/cookie.ts] → ✅ Keep     │
│    [bash npm test] → ✅ Keep (last result) │
│    [grep "import auth"] → ❌ Discard       │
│                                            │
└────────────────────────────────────────────┘
        │
        ▼
Compressed context = Intent summary + Kept tool results + File tracking
```

## Installation

```bash
pi install git:github.com/catlain/pi-smart-compact
```

Restart pi to activate. **Auto-compaction is off by default** — use `/smart-compact-config auto` to enable.

> **Prerequisite**: [pi](https://github.com/earendil-works/pi-coding-agent) must be installed.

## Commands

| Command | Description |
|---------|-------------|
| `/smart-compact` | Manually trigger two-phase enhanced compaction |
| `/smart-compact-config` | View current config |
| `/smart-compact-config auto` | Enable automatic compaction takeover |
| `/smart-compact-config manual` | Disable auto — only manual `/smart-compact` triggers |

## Configuration

Stored in `~/.pi/agent/settings.json` under the `smartCompact` section (global). Defaults are sensible for most cases.

```json
{
  "smartCompact": {
    "enabled": false,
    "intentModel": "glm-4-flash",
    "filterModel": "glm-4-flash",
    "thinkingTruncateChars": 500,
    "toolCallTruncateChars": 1000,
    "toolResultTruncateChars": 2000,
    "filterBatchSize": 20
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Auto-takeover of pi's compaction. `false` = manual only |
| `intentModel` | string? | — | Model for intent extraction (empty = session default) |
| `filterModel` | string? | — | Model for tool verdict (empty = same as intentModel) |
| `thinkingTruncateChars` | number | `500` | Max chars kept from LLM thinking blocks |
| `toolCallTruncateChars` | number | `1000` | Max chars kept from tool call arguments |
| `toolResultTruncateChars` | number | `2000` | Max chars kept from tool results |
| `filterBatchSize` | number | `20` | Tools per batch for verdict LLM call |

**Model recommendations**:
- Use a fast, cheap model (`glm-4-flash`, `deepseek-chat`) for both phases
- The intent and filter models can differ — e.g., heavier model for intent, lighter for batch verdicts

## Use Cases

| Scenario | Benefit |
|----------|---------|
| **Long coding sessions** (50+ turns) | Agent stays focused on the current task after compaction |
| **Multi-file refactoring** | Preserves cross-file dependency knowledge — doesn't lose what you changed in file A when compacting before editing file B |
| **Research workflows** | Keeps key findings while discarding intermediate `grep`/`search` noise |
| **Debug sessions** | Preserves error messages and root-cause analysis, drops exploratory reads |

## Best Practices

### ✅ Recommended
- Start with `manual` mode — run `/smart-compact` when you feel context is getting bloated
- Switch to `auto` once you trust the results
- Use fast models for compaction — it's a classification/summarization task, not complex reasoning
- Adjust truncation limits based on your typical tool output sizes

### ❌ Not Recommended
- Don't use expensive models (GPT-4, Claude Opus) for compaction — it runs on every compaction event
- Don't set truncation limits too low — you'll lose important context in the verdict phase
- Don't enable auto without testing manual mode first

## Limitations

| Limitation | Detail |
|------------|--------|
| LLM dependency | Requires at least one LLM call per compaction (cost + latency) |
| Truncation-based | Tool results are truncated, not intelligently summarized |
| No cross-session learning | Each compaction is independent — no memory of past verdict patterns |
| Single model per phase | Can't use different models for different tool types |

## Architecture

```
pi-smart-compact/
├── index.ts              # Entry: register commands + session_before_compact hook
├── config.ts             # Config via settings.json (smartCompact section) + legacy migration
├── types.ts              # Type definitions + defaults
├── intent-extractor.ts   # Phase 1: extract non-tool text → summarize intent
├── tool-filter.ts        # Phase 2: batch tool verdict (keep/discard)
├── llm-caller.ts         # Unified LLM call abstraction (uses pi's model routing)
├── prompts.ts            # LLM prompt templates for intent + verdict
├── serializer.ts         # Message serialization helpers
├── tests/                # Unit tests
└── package.json
```

**Dependencies**:
- `@earendil-works/pi-coding-agent` — ExtensionAPI (peer)

## License

MIT
