import config from "../config.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("LLM did not return valid JSON");
  }
}

export async function parseIntentWithGroq(query) {
  const prompt = `You are an intent parser for automation actions.
Return only strict JSON with this exact schema:
{
  "action": "create",
  "platform": "github | drive | both",
  "repo": "string",
  "parent_folder": "string",
  "folders": ["array"]
}
Rules:
- No explanation, no markdown, no extra keys.
- Keep folder names exactly as user wrote (preserve casing).
- For single drive folder, put it in folders array.
- If both github and drive are requested, set platform to "both".
- If github repo is not mentioned, set repo to "".
- If parent folder isn't explicit, set parent_folder to "".
User query: ${query}`;

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify({
      model: config.groqModel,
      temperature: 0,
      messages: [
        { role: "system", content: "You output strict JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 400 && errText.includes("model_decommissioned")) {
      throw new Error(
        `Groq model '${config.groqModel}' is unavailable/decommissioned. Update GROQ_MODEL in .env to a supported model. Raw error: ${errText}`
      );
    }
    throw new Error(
      `Groq API error (${response.status}) using model '${config.groqModel}': ${errText}`
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from Groq");
  }

  const parsed = safeJsonParse(content);

  return {
    action: parsed.action || "create",
    platform: parsed.platform || "",
    repo: parsed.repo || "",
    parent_folder: parsed.parent_folder || "",
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    raw_query: query,
  };
}
