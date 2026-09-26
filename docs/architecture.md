# Architecture

```text
Browser
  |
  v
Next.js app + API route
  |
  +--> Deterministic security engine
  |      +--> capability rules
  |      +--> policy decision
  |      +--> manifest comparison
  |      +--> evidence generation
  |
  +--> Optional IBM watsonx.ai explanation
          +--> IAM token
          +--> Granite model
```

The hackathon build keeps policy enforcement deterministic and explainability modular. This avoids making the security boundary dependent on model output.
