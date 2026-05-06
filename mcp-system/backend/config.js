const config = {

  port:
    Number(process.env.PORT || 4000),

  groqApiKey:
    process.env.GROQ_API_KEY,

  groqModel:
    process.env.GROQ_MODEL ||
    "llama-3.3-70b-versatile"
};

if (!config.groqApiKey) {

  console.warn(
    "Warning: GROQ_API_KEY is not set. LLM calls will fail."
  );
}

export default config;