# ER Diagram Designer

Browser-based Chen-notation ER diagram editor with a streaming AI assistant that sees your canvas live.

## Run locally

```bash
ANTHROPIC_API_KEY=sk-ant-... node dev-server.mjs   # http://localhost:8899
```

Put the key in a git-ignored `.env` file instead if you prefer. Without a key the editor works and the assistant explains that it isn't set up.

## Deploy (Netlify)

1. Site settings → Environment variables → add `ANTHROPIC_API_KEY` (optionally `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`).
2. Redeploy. The Edge Function in `netlify/edge-functions/chat.js` serves `/api/chat` and streams the response.

The key never reaches the browser. The endpoint only accepts same-origin requests, but it has no per-user rate limit, so add one before sharing a public link widely.

## How the assistant sees your work

On every message the app sends the current canvas (elements, names, positions, connections, selection) plus a list of what changed since your previous message (added, removed, renamed, moved, connected). Images are resized in the browser before upload.
