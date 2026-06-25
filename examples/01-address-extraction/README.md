# Address Extraction

This is a minimal [mini-eval](https://github.com/ruanmartinelli/mini-eval) demo that tests multiple models on messy shipping text, evaluating how well they extract structured info (`state`, `zip`, and `weight_oz`).

Models are called with [`@openrouter/agent`](https://github.com/OpenRouterTeam/typescript-agent), so you only need a single API key.

## Quick Start

```bash
npm install
cp .env.example .env   # add your OpenRouter key to .env
npm run eval
```

Running this prints a summary for each model and writes the results to `report.html`.
