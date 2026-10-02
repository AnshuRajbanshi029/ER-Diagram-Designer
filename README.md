# ER Diagram Designer

Browser-based Chen-notation ER diagram editor with a streaming AI assistant that sees your canvas live.

## Configuration

| Variable | Purpose |
| --- | --- |
| `AI_API_KEY` | API key for the OpenAI-compatible provider (required) |
| `AI_BASE_URL` | Defaults to `https://api.xkiro.com/v1` |
| `AI_MODEL` | Fallback model, defaults to `qwen/qwen3.8-omni-flash:free` |
| `AI_PROVIDER` | Set to `anthropic` to use the Anthropic API with `ANTHROPIC_API_KEY` instead |

The chat panel's model picker offers the four allowed models in `netlify/shared/chat-core.js`.

## Run locally

```bash
AI_API_KEY=... node dev-server.mjs   # http://localhost:8899
```

Or put the variables in a git-ignored `.env` file. Without a key the editor works and the assistant explains that it isn't set up.

## Deploy (Netlify)

1. Site settings → Environment variables → add `AI_API_KEY`.
2. Redeploy. The Edge Function in `netlify/edge-functions/chat.js` serves `/api/chat` and streams the response.

The key never reaches the browser. The endpoint only accepts same-origin requests, but it has no per-user rate limit, so add one before sharing a public link widely.

## How the assistant sees your work

On every message the app sends the current canvas (elements, names, positions, connections, selection) plus a list of what changed since your previous message (added, removed, renamed, moved, connected). Images are resized in the browser before upload.
