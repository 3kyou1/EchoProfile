# Profile Output Schema

Use this reference when the user wants a more structured or machine-readable profile.

## JSON Shape

```json
{
  "summary": ["string"],
  "evidenceQuality": "low | medium | high",
  "scopeBias": "global | project | session | mixed",
  "workStyle": [
    {
      "claim": "string",
      "confidence": "low | medium | high",
      "evidence": "short paraphrase, not a long quote"
    }
  ],
  "technicalPreferences": [],
  "decisionStyle": [],
  "communicationStyle": [],
  "assistantAdaptation": [],
  "uncertainties": []
}
```

## Evidence Labels

- `high`: repeated across independent sessions or projects
- `medium`: repeated in one project/session or strongly implied
- `low`: sparse signal; useful but tentative

## Red Lines

- No long raw messages.
- No medical or psychological diagnosis.
- No protected-trait inference.
- No treating pasted files, logs, or code as authored beliefs.
