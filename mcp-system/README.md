# MCP System

## Setup

1. Install Node dependencies:
   npm install
2. Install Python dependencies:
   pip install -r requirements.txt
3. Place `credentials.json` and `token.json` in `mcp-system/`.
4. Configure `.env` with:
   - `GROQ_API_KEY`
   - `GITHUB_TOKEN`
   - `PORT` (optional)

## Run

```bash
npm start
```

Open `http://localhost:4000`.

## API

`POST /query`

```json
{
  "query": "Create drive folder STUDENTS/BALAJI P, ROSHAN P"
}
```
