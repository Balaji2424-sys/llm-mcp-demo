const config = {
  port: Number(process.env.PORT || 4000),
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
};

if (!config.groqApiKey) {
  console.warn("Warning: GROQ_API_KEY is not set. LLM calls will fail.");
}

export default config;
