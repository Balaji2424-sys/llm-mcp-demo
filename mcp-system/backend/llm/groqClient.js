import config from "../config.js";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

// ========================================
// SAFE JSON PARSER
// ========================================

function safeJsonParse(text) {

  try {

    return JSON.parse(text);

  } catch {

    const firstBrace =
      text.indexOf("{");

    const lastBrace =
      text.lastIndexOf("}");

    if (
      firstBrace >= 0 &&
      lastBrace > firstBrace
    ) {

      return JSON.parse(
        text.slice(
          firstBrace,
          lastBrace + 1
        )
      );
    }

    throw new Error(
      "LLM did not return valid JSON"
    );
  }
}

// ========================================
// INTENT PARSER
// ========================================

export async function parseIntentWithGroq(query) {

  if (!config.groqApiKey) {

    throw new Error(
      "Missing GROQ_API_KEY environment variable"
    );
  }

  const prompt = `You are an intent parser for automation actions.

Return ONLY strict JSON with this exact schema:

{
  "action": "create",
  "platform": "github | drive | both",
  "repo": "string",
  "parent_folder": "string",
  "folders": ["array"]
}

Rules:
- No explanation
- No markdown
- No extra keys
- Preserve exact folder casing
- For single drive folder, include it inside folders array
- If both github and drive are requested, use "both"
- If github repo missing, set repo to ""
- If parent folder missing, set parent_folder to ""

User query:
${query}`;

  const response =
    await fetch(
      GROQ_URL,
      {
        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${config.groqApiKey}`
        },

        body: JSON.stringify({

          model:
            config.groqModel,

          temperature: 0,

          messages: [

            {
              role: "system",

              content:
                "You output strict JSON only."
            },

            {
              role: "user",

              content: prompt
            }
          ]
        })
      }
    );

  // ====================================
  // API ERROR HANDLING
  // ====================================

  if (!response.ok) {

    const errText =
      await response.text();

    console.error(
      "Groq API Error:",
      errText
    );

    if (
      response.status === 400 &&
      errText.includes(
        "model_decommissioned"
      )
    ) {

      throw new Error(
        `Groq model '${config.groqModel}' is unavailable. Update GROQ_MODEL environment variable.`
      );
    }

    throw new Error(
      `Groq API error (${response.status}): ${errText}`
    );
  }

  // ====================================
  // RESPONSE PARSE
  // ====================================

  const data =
    await response.json();

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content) {

    throw new Error(
      "Empty response from Groq"
    );
  }

  // ====================================
  // SAFE JSON EXTRACTION
  // ====================================

  const parsed =
    safeJsonParse(content);

  return {

    action:
      parsed.action || "create",

    platform:
      parsed.platform || "",

    repo:
      parsed.repo || "",

    parent_folder:
      parsed.parent_folder || "",

    folders:
      Array.isArray(parsed.folders)
        ? parsed.folders
        : [],

    raw_query:
      query
  };
}