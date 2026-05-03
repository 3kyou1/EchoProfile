---
name: echo-profile-user-profile
description: Use when generating a user profile from EchoProfile collected AI conversation history, profile collect JSON, Codex or Claude user-message samples, or local agent-history data.
---

# EchoProfile User Profile

## Overview

Generate a practical user profile from EchoProfile-collected user messages. The profile is for agents and tools: it should help future assistants adapt to the user's work style, technical preferences, decision patterns, and communication needs.

Do not diagnose mental health, infer protected traits, or quote long private messages. Treat collected history as behavioral evidence with uncertainty.

## Inputs

Preferred input is the JSON envelope from:

```bash
echo-profile profile collect --scope project --current-project
echo-profile profile collect --scope global
echo-profile profile collect --scope session --session-path <PATH>
```

If `echo-profile` is not available, ask the user for the `profile collect` JSON. Analyze only `data.messages[].text` and related metadata such as provider, scope, timestamps, and omitted counts.

If the JSON envelope has `ok: false`, explain the error and stop. If there are too few messages, produce a lightweight profile and mark evidence quality as low.

## Workflow

1. Choose scope from the user's request:
   - current project: `--scope project --current-project`
   - whole local history: `--scope global`
   - specific session: `--scope session --session-path <PATH>`
2. Collect messages or parse provided JSON.
3. Separate real user intent from paste-like material, code, logs, diffs, tool output, and quoted documents. Do not treat pasted content as personality evidence unless the user explicitly wrote about it.
4. Identify repeated signals across messages:
   - goals, projects, and domains
   - preferred tools, languages, frameworks, and workflows
   - decision style, risk tolerance, and tradeoff language
   - communication style and expected assistant behavior
   - recurring frustrations, quality bars, and constraints
5. Build the profile with evidence levels:
   - `High confidence`: repeated across many independent user messages
   - `Medium confidence`: appears several times or is strongly implied
   - `Low confidence`: plausible but sparse; label as tentative
6. Output concise, actionable guidance. Avoid generic praise.

## Output Format

Default to Chinese unless the user asks otherwise. Use this structure:

```markdown
# 用户画像

## 摘要
2-4 bullets. Say what the profile is based on and evidence quality.

## 工作方式
How the user approaches implementation, iteration, verification, and scope.

## 技术偏好
Languages, frameworks, tools, environments, and conventions that appear in the data.

## 决策风格
How the user chooses among options, handles uncertainty, and pushes back.

## 沟通风格
Preferred answer shape, level of directness, language, and collaboration pattern.

## 对 AI 助手的使用模式
What the user delegates, what they want to control, and how they correct agents.

## 适配建议
Concrete instructions future agents should follow for this user.

## 不确定性
Evidence gaps, low-confidence inferences, and what not to assume.
```

## Quality Rules

- Preserve privacy: quote at most short snippets and only when necessary.
- Do not include raw message dumps.
- Do not infer age, gender, ethnicity, religion, health, politics, or other protected/sensitive traits unless the user explicitly asks and provided that information directly.
- Separate "the user pasted X" from "the user believes X".
- Prefer falsifiable statements over vague traits.
- Include negative instructions when useful, such as "do not explain basic Git unless asked".
- If messages are mostly from one project, say the profile is project-biased.

## Useful Commands

Use JSON output directly. If needed, inspect CLI help:

```bash
echo-profile help profile collect
echo-profile list providers
echo-profile list sessions --current-project
```

For very large histories, start with project scope or set a smaller budget:

```bash
echo-profile profile collect --scope project --current-project --budget-chars 30000
```
