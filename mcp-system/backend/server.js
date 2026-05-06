import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import config from "./config.js";
import { processQuery } from "./router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

app.use("/", express.static(path.join(__dirname, "..", "frontend")));

app.post("/query", async (req, res) => {
  const { query } = req.body || {};

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const result = await processQuery(query);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
});

app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});

export default app;
