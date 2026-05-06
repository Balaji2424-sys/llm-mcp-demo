# Vercel Backend Validation

## Required Environment Variables

- `GROQ_API_KEY`
- `GROQ_MODEL` (optional, defaults in code)
- `GITHUB_TOKEN` (required for GitHub repo creation)
- `PYTHON_BIN` (optional, defaults to `python`)
- `PYTHON_TIMEOUT_MS` (optional, defaults to `20000`)
- `GOOGLE_CREDENTIALS_PATH` and `GOOGLE_TOKEN_PATH` (optional; required for Drive actions in serverless if not using local files)

## Endpoint Expectations

- `GET /`: Returns frontend if `../frontend/index.html` exists, otherwise API-only status JSON.
- `GET /health`: Returns runtime diagnostics (Node, Vercel flag, Python availability/version, env presence).
- `POST /query`:
  - `400` for missing/invalid `query`
  - `200` for successful workflows
  - `500` when downstream services fail

## Run Automated Checks

```powershell
cd mcp-system/backend
powershell -ExecutionPolicy Bypass -File .\scripts\verify-vercel.ps1 -BaseUrl "https://llm-mcp-demo.vercel.app"
```

## Inspect Logs on Vercel

Use Vercel function logs for request IDs and timing from `server.js` and `router.js`:

- Request start: `"[<id>] <METHOD> <URL> started"`
- Query success/failure duration
- Intent parse start/completion timing
- Python service spawn, exit code, stderr, and timeout traces
