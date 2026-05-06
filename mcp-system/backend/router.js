import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { parseIntentWithGroq } from "./llm/groqClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const servicesDir = path.join(__dirname, "services");

export function cleanInput(text) {
  return String(text || "")
    .replace(/[●○]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingFillers(text) {
  return text
    .replace(
      /^(?:is|are|named|name|with|the|following|folder|folders|folder names|names|create|inside|and)\s+/i,
      ""
    )
    .trim();
}

export function extractNamesSmart(text) {
  const cleaned = cleanInput(text);
  if (!cleaned) return [];

  if (cleaned.includes(",")) {
    return cleaned
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const words = cleaned.split(" ").filter(Boolean);
  const names = [];
  let i = 0;

  while (i < words.length) {
    if (i === words.length - 1) {
      names.push(words[i]);
      break;
    }

    const group = [words[i], words[i + 1]];
    let j = i + 2;

    while (j < words.length && group.length < 4) {
      const token = words[j];
      if (/^[A-Za-z]$/.test(token)) {
        group.push(token);
        j += 1;
        continue;
      }
      break;
    }

    names.push(group.join(" "));
    i = j;
  }

  return names;
}

export function parseDriveQuery(query) {
  const cleaned = cleanInput(query);
  const parentMatch = cleaned.match(
    /\bnamed\s+(.+?)(?=\s+(?:and|with|inside|create|folders?|names?)\b|$)/i
  );
  const parent = parentMatch ? parentMatch[1].trim() : "Default";

  let namesSection = "";
  const namesIdx = cleaned.search(/\bnames?\b/i);
  if (namesIdx >= 0) {
    namesSection = cleaned.slice(namesIdx).replace(/\bnames?\b/i, "").trim();
  } else {
    const folderIdx = cleaned.search(/\bfolder\b/i);
    if (folderIdx >= 0) {
      namesSection = cleaned.slice(folderIdx).replace(/\bfolder\b/i, "").trim();
    }
  }

  namesSection = stripLeadingFillers(namesSection);

  // Parent/children shorthand, e.g. "STUDENTS/A,B,C"
  if (namesSection.includes("/")) {
    const [parsedParent, right] = namesSection.split("/", 2);
    const folders = extractNamesSmart(stripLeadingFillers(right));
    const finalParent = parsedParent.trim() || parent;
    return {
      parent: finalParent,
      folders,
      command: `create drive folder ${finalParent}/${folders.join(",")}`,
    };
  }

  const folders = extractNamesSmart(namesSection);
  return {
    parent,
    folders,
    command: `create drive folder ${parent}/${folders.join(",")}`,
  };
}

function runPythonService(scriptName, payload) {
  return new Promise((resolve) => {
    const scriptPath = path.join(servicesDir, scriptName);
    const child = spawn("python", [scriptPath, JSON.stringify(payload)], {
      cwd: path.join(__dirname, ".."),
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ scriptName, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export async function processQuery(query) {
  const intent = await parseIntentWithGroq(query);

  if (!intent.platform) {
    throw new Error("Could not detect target platform from query");
  }

  const platform = intent.platform.toLowerCase();
  const runs = [];

  if (platform === "github" || platform === "both") {
    runs.push(await runPythonService("githubServer.py", intent));
  }

  if (platform === "drive" || platform === "both") {
    const driveParsed = parseDriveQuery(query);
    const drivePayload = {
      ...intent,
      parent_folder: driveParsed.parent,
      folders: driveParsed.folders,
      raw_query: driveParsed.command,
    };
    runs.push(await runPythonService("driveServer.py", drivePayload));
  }

  if (runs.length === 0) {
    throw new Error("Unsupported platform in parsed intent");
  }

  const hasError = runs.some((r) => r.code !== 0);
  const lines = runs.map((r) => {
    const status = r.code === 0 ? "OK" : "FAILED";
    const text = r.stdout || r.stderr || "No output";
    return `${r.scriptName}: ${status}\n${text}`;
  });

  return {
    success: !hasError,
    intent: platform === "drive" || platform === "both" ? { ...intent, drive_parsed: parseDriveQuery(query) } : intent,
    message: lines.join("\n\n"),
  };
}
