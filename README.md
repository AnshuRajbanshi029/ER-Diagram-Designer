# ER Diagram Designer

Browser-based Chen-notation ER diagram editor with a streaming AI assistant that sees your canvas live.

## Configuration

| Variable | Purpose |
| --- | --- |
| `AI_API_KEY` | API key for the OpenAI-compatible provider (required, keep secret) |
| `AI_BASE_URL` | Provider base URL (required, keep secret) |
| `AI_MODEL` | Optional fallback model, defaults to `qwen/qwen3.8-omni-flash:free` |
| `AI_PROVIDER` | Set to `anthropic` to use the Anthropic API with `ANTHROPIC_API_KEY` instead |

The chat panel's model picker offers the four allowed models listed in `netlify/shared/chat-core.js`.

## Run locally

```bash
AI_API_KEY=... AI_BASE_URL=... node dev-server.mjs   # http://localhost:8888
```

Or put the variables in a git-ignored `.env` file. Without them the editor works and the assistant explains that it isn't set up.

## Deploy (Netlify CLI)

```bash
npm i -g netlify-cli
netlify login
netlify link                      # or: netlify init
netlify env:set AI_API_KEY  "<your key>"  --secret
netlify env:set AI_BASE_URL "<base url>"  --secret
netlify deploy --prod
```

## Security

- The key and base URL live only in Netlify environment variables and are read by the Edge Function (`/api/chat`). They are never sent to the browser or stored in the repo.
- Rate limit: 5 requests per minute per IP, enforced by Netlify (`rateLimit` in `netlify/edge-functions/chat.js`) and again in code. Over the limit returns HTTP 429.
- Same-origin requests only, an allowlist of models, and capped message and image sizes.

## How the assistant works

- **It sees your canvas.** Every message includes the current diagram (elements, names, positions, connections, cardinalities, selection) plus what changed since your previous message. Images are resized in the browser before upload.
- **It builds on your canvas.** Ask it to design, extend, fix or rename things and it replies with a structured diagram block (` ```er-diagram `). The app applies it as soon as the block finishes streaming, lays new elements out automatically (`layout.js`), never moves what you already placed, and shows a card with **Undo** and **Fit view**. One Undo reverts the whole change.
- **Canvas navigation.** Drag empty space to pan, Ctrl/Cmd + wheel to zoom, `F` or the fit button to fit the diagram. Click a connection to edit its cardinality (1, N, M).
