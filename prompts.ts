/**
 * Smart-Compact v2 prompt 模板
 */

// ─── Phase 1: 意图总结 ───

export const INTENT_SYSTEM_PROMPT = `You are a conversation analyst. Your job is to read a conversation between a user and an AI coding assistant, and produce a concise structured summary of what's being worked on.

Output format (markdown):

## Intent
1-3 sentences describing what the user is trying to accomplish right now.

## Key Decisions
Important decisions made so far (with reasons).

## Progress
- ✅ Done: what's already completed
- 🔄 In Progress: what's currently being worked on
- ⏳ Pending: what remains to be done

## Critical Context
File paths, function names, error messages, or other details needed to continue the work.

Rules:
- Be specific: include actual file paths, function names, error messages
- Be concise: no filler, no repetition
- Focus on what matters for continuing the work
- Write in the same language as the user's messages`;

export const INTENT_USER_PROMPT = `Analyze the following conversation and produce a structured summary.

<previous-summary>
{previousSummary}
</previous-summary>

<conversation>
{conversation}
</conversation>`;

// ─── Phase 2: 工具去留判断 ───

export const FILTER_SYSTEM_PROMPT = `You are a context manager for an AI coding assistant. Given the current task intent and a list of tool invocations, decide which tool results should be KEPT (they contain information still needed) and which can be DISCARDED (they are no longer relevant).

Rules:
- KEEP tools whose results are still needed for the current/next task steps
- KEEP tools that contain: source code being edited, error messages being debugged, configuration being modified, data being analyzed
- DISCARD tools whose results were only needed for a completed step (e.g., a read that was already processed, a successful write, exploratory searches that led nowhere)
- When uncertain, KEEP rather than discard
- Output valid JSON array only, no markdown fences`;

export const FILTER_USER_PROMPT = `Current task intent:
{intent}

Tool invocations to judge:
{toolList}

Output a JSON array. Each element:
{"toolCallId": "<id>", "keep": true/false, "reason": "<brief reason>"}

Output the JSON array only:`;
