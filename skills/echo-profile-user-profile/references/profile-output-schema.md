# Blindspot Profile Output Schema

Use this reference when the user wants a structured or machine-readable blindspot profile.

## JSON Shape

```json
{
  "summary": ["string"],
  "evidenceQuality": "low | medium | high",
  "scopeBias": "global | project | session | mixed",
  "dataBasis": {
    "scope": "string",
    "providers": ["string"],
    "messageCount": 0,
    "timeSpan": "string",
    "limitations": ["string"]
  },
  "observerLens": {
    "enabled": false,
    "slug": "string",
    "displayName": "string",
    "skillPath": "string",
    "focus": ["string"],
    "limitations": ["string"]
  },
  "topBlindspotHypotheses": [
    {
      "hypothesis": "You may...",
      "category": "collaboration | decision | cognitive | growth",
      "observedPattern": "string",
      "hiddenCost": "string",
      "supportingEvidence": ["short paraphrase, not a long quote"],
      "alternativeExplanation": "string",
      "evidenceStrength": "low | medium | high",
      "nextVerification": "string",
      "observerComment": "string"
    }
  ],
  "categories": {
    "collaboration": [],
    "decision": [],
    "cognitive": [],
    "growth": []
  },
  "lowConfidenceObservations": [
    {
      "observation": "string",
      "whyLowConfidence": "string"
    }
  ],
  "doNotInfer": [
    "No clinical or psychological diagnosis.",
    "No protected-trait inference.",
    "No treating pasted material as the user's own belief."
  ]
}
```

## Evidence Labels

- `high`: repeated across independent sessions, providers, projects, or time periods
- `medium`: repeated in one project or task type, but possibly scope-biased
- `low`: sparse, context-bound, or equally explained by agent failure or task ambiguity

## Required Hypothesis Fields

Every main blindspot hypothesis must include:

- `hypothesis`
- `category`
- `observedPattern`
- `hiddenCost`
- `supportingEvidence`
- `alternativeExplanation`
- `evidenceStrength`
- `nextVerification`

## Red Lines

- No long raw messages.
- No medical, psychological, or personality diagnosis.
- No protected-trait inference.
- No treating pasted files, logs, code, or documents as authored beliefs.
- No agent adaptation advice unless the user explicitly requests it.
