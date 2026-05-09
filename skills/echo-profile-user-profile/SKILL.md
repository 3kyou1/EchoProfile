---
name: echo-profile-user-profile
description: Use when generating a blindspot-oriented user profile from EchoProfile collected AI conversation history, profile collect JSON, or local agent-history data.
---

# EchoProfile Blindspot Profile

## Overview

Generate a blindspot-oriented profile from EchoProfile-collected user messages. The output should help the user see repeated patterns in AI collaboration, decision-making, cognition, and growth that may be costing them quality, time, or learning.

This is not an agent adaptation profile, personality test, psychological diagnosis, or praise summary. It is a set of testable blindspot hypotheses.

## Core Goal

Do not merely summarize preferences. Convert repeated surface behavior into deeper, falsifiable hypotheses:

```text
surface behavior -> underlying pattern -> hidden cost -> alternative explanation -> next verification
```

Prefer fewer stronger hypotheses over many weak observations.

## Safety And Boundaries

- Do not diagnose mental health, personality disorders, or clinical states.
- Do not infer protected or sensitive traits such as age, gender, ethnicity, religion, politics, health, or family status.
- Do not treat pasted code, logs, diffs, documents, tool output, or quoted text as the user's own beliefs.
- Do not shame, moralize, flatter, or write identity claims.
- Do not turn sparse evidence into "you are..." conclusions.
- Do not output agent adaptation advice unless the user explicitly asks for it.
- Preserve privacy: use short paraphrases as evidence, not raw message dumps.

## Inputs

Preferred input is the JSON envelope from:

```bash
echo-profile profile collect --scope project --current-project
echo-profile profile collect --scope global
echo-profile profile collect --scope session --session-path <PATH>
```

If `echo-profile` is not available, ask the user for the `profile collect` JSON. Analyze only `data.messages[].text` and related metadata such as provider, scope, timestamps, and omitted counts.

If the JSON envelope has `ok: false`, explain the error and stop. If there are too few messages, produce only lightweight hypotheses and mark evidence quality as low.

## Workflow

1. Choose scope from the user's request:
   - current project: `--scope project --current-project`
   - whole local history: `--scope global`
   - specific session: `--scope session --session-path <PATH>`
2. Collect messages or parse provided JSON.
3. Assess evidence quality: scope, providers, message count, time span, project bias, omitted counts, and noise level.
4. Filter noise: code, logs, diffs, command output, model output, quoted documents, and long pasted material.
5. Extract user-authored intent, constraints, corrections, evaluations, tradeoffs, frustrations, process requirements, and meta-discussion.
6. Aggregate repeated signals into collaboration, decision, cognitive, and growth categories.
7. Generate multiple explanations for each repeated signal before choosing a blindspot hypothesis.
8. Keep only hypotheses with observed pattern, hidden cost, supporting evidence, alternative explanation, evidence strength, and next verification.
9. Rank by potential cost, recurrence, cross-context stability, likelihood of being overlooked, and testability.
10. Output second person blindspot hypotheses with clear uncertainty boundaries.

## Signal Extraction

Use these signal buckets to avoid shallow preference summaries.

### Collaboration Signals

- Frequent corrections, interruptions, or late constraints.
- Shifting autonomy boundaries: direct execution in one turn, strict process control in another.
- Repeated comments about what the agent should have done first.
- Hidden acceptance criteria discovered only after output appears.

Possible hypotheses include: the user may under-specify acceptance criteria, switch between autonomy and control too quickly, or discover the real goal through output samples.

### Decision Signals

- Many options requested without explicit ranking criteria.
- Repeated quality, risk, or maintainability concerns.
- Delayed tradeoff declaration between speed, rigor, scope, and polish.
- Open-ended exploration continuing after enough information appears available.

Possible hypotheses include: the user may have strong quality intuition that is not always operationalized, or may defer decisions until seeing concrete implementation.

### Cognitive Signals

- Compressed instructions that rely on implicit context.
- Assumed shared memory across sessions, projects, or agent tools.
- Broad terms such as "deeper", "usable", "professional", or "not superficial" without examples.
- Optimistic task boundaries that expand during execution.

Possible hypotheses include: the user may overestimate implicit context recovery, or may skip executable boundaries when the direction feels obvious.

### Growth Signals

- Repeated process feedback that remains in conversation rather than docs, tests, scripts, or skills.
- Recurring workflow problems handled ad hoc.
- Frequent interest in productizing, packaging, installing, or making a process reusable.
- High-level method discussions interrupting implementation flow.

Possible hypotheses include: the user may generate strong process insight faster than they codify it into stable assets.

## Blindspot Hypothesis Rules

Each main blindspot hypothesis must include:

- observed pattern
- hidden cost
- supporting evidence
- alternative explanation
- evidence strength
- next verification

Admission rules:

- If no alternative explanation can be written, do not include it.
- If no next verification can be written, move it to low-confidence observations.
- If it is based on one message only, do not include it as a main blindspot.
- If the signal is equally explained by agent failure, mark confidence low or omit it.
- If the claim would sound like "you are..." instead of "you may...", rewrite or remove it.

## Evidence Strength

- `High`: repeated across independent sessions, providers, projects, or time periods; multiple signal types support it; alternative explanations do not cover most evidence.
- `Medium`: repeated inside one project or task type; context is consistent; current project bias may be strong.
- `Low`: sparse, highly context-bound, mostly from one session, or equally explained by agent quality, task ambiguity, or exploration.

## Output Modes

Default to deep mode unless the user asks otherwise.

- Brief mode: summary plus top 3 blindspot hypotheses.
- Deep mode: summary, data basis, top 3-5 hypotheses, category sections, low-confidence observations, and boundaries.
- Observer lens mode: use a full perspective skill from `references/observer-pool.json` to inspect the evidence-backed blindspot hypotheses.
- JSON mode: use `references/profile-output-schema.md`.

## Observer Lens Mode

Use observer lens mode when the user asks for a specific人物视角, asks to choose an observer, or says phrases such as "用芒格视角", "让费曼指出我的盲点", "用张一鸣观察我", "choose an observer", or "observer lens".

Observer pool behavior:

1. Read `references/observer-pool.json`.
2. Match the user's requested observer against each observer's `slug`, `displayName`, and `aliases`.
3. If the user does not specify an observer, show the observer selection list from `observer-pool.json` and ask the user to choose. Do not default to one observer.
4. After selection, read the full `observers/<slug>/SKILL.md` file.
5. Do not summarize or re-distill the observer skill before using it.
6. Resolve observer-relative files from the selected observer directory.
7. First extract blindspot hypotheses from the user's history using this skill's normal evidence workflow.
8. Then use the selected observer skill's full thinking framework, decision heuristics, expression DNA, strengths, limitations, and anti-patterns to re-rank and interpret those hypotheses.

Hard rules:

- The observer must come from `references/observer-pool.json`.
- The observer skill is a lens, not evidence. It may re-rank, interpret, sharpen, or phrase blindspots, but it cannot invent blindspots unsupported by the user's history.
- Do not turn the output into free-form roleplay. The output remains a blindspot profile.
- Preserve the standard fields: observed pattern, hidden cost, supporting evidence, alternative explanation, evidence strength, and next verification.
- Add an observer-specific comment for each main hypothesis.
- Add a section explaining where this observer may misread the user.

Observer lens output additions:

```markdown
# 你的盲点画像：[观察者]观察者视角

## 观察者镜片

- 观察者：
- 使用的 skill：
- 这个视角会特别盯住：
- 这个视角可能看错的地方：

## 最值得验证的盲点假设

### 1. 你可能……

- 观察到的模式：
- 可能被你忽略的代价：
- 支持证据：
- 反向解释：
- 证据强度：
- 下次如何验证：
- 观察者点评：

## 该观察者可能误判你的地方
```

## Default Output Format

Default to Chinese unless the user asks otherwise. Use second person. The summary may be direct; details must stay evidence-bound and restrained.

```markdown
# 你的盲点画像

## 摘要

基于这批 AI 协作记录，你最值得验证的盲点假设是：

1. 你可能……
2. 你可能……
3. 你可能……

这些不是性格定论，而是从重复协作模式中提炼出的待验证假设。

## 数据基础与可信度

- 数据范围：
- 涉及 provider：
- 消息数量：
- 时间跨度：
- 主要项目 / 场景偏向：
- 证据质量：高 / 中 / 低
- 主要限制：

## 最值得验证的盲点假设

### 1. 你可能……

- 观察到的模式：
- 可能被你忽略的代价：
- 支持证据：
- 反向解释：
- 证据强度：
- 下次如何验证：

## 协作盲点

关注你如何让 agent 做事、纠偏、授权、设边界。

### 盲点假设：你可能……

- 观察到的模式：
- 可能被你忽略的代价：
- 支持证据：
- 反向解释：
- 证据强度：
- 下次如何验证：

## 决策盲点

关注你如何比较方案、设标准、处理风险、决定何时推进。

### 盲点假设：你可能……

- 观察到的模式：
- 可能被你忽略的代价：
- 支持证据：
- 反向解释：
- 证据强度：
- 下次如何验证：

## 认知盲点

关注你如何表达上下文、拆问题、估计复杂度、处理不确定性。

### 盲点假设：你可能……

- 观察到的模式：
- 可能被你忽略的代价：
- 支持证据：
- 反向解释：
- 证据强度：
- 下次如何验证：

## 成长盲点

关注你是否把重复经验沉淀成流程、文档、测试、skill、产品机制。

### 盲点假设：你可能……

- 观察到的模式：
- 可能被你忽略的代价：
- 支持证据：
- 反向解释：
- 证据强度：
- 下次如何验证：

## 低置信度观察

- 你可能……  
  证据不足在哪里：

## 不应推断的内容

- 不推断你的人格类型、心理状态或临床意义。
- 不推断年龄、性别、身份、政治、宗教、健康等敏感属性。
- 不把你粘贴的代码、日志、文档内容当成你的信念。
- 不把某一次协作中的急躁、纠偏或偏好当成长期稳定特征。
```

## Quality Rules

- Use second person: "你可能...", "你似乎...", "这批记录显示你在...".
- Avoid "你总是", "你就是", "你的问题是", and other fixed judgments.
- Be direct in the summary and restrained in the evidence sections.
- Do not produce generic productivity advice.
- Do not stop at surface preferences such as "you like concise answers"; explain the possible hidden cost and how to verify it.
- Every main blindspot must include hidden cost, alternative explanation, and next verification.
- Prefer evidence-backed discomfort over vague praise.
- Make project, provider, and scope bias visible.

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
