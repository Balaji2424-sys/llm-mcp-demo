import "./config/env.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const query = process.argv.slice(2).join(" ");
const venvPython = path.resolve(".venv", "Scripts", "python.exe");
const pythonCmd = fs.existsSync(venvPython) ? venvPython : "python";

if (!query) {
  console.log("Provide a query");
  process.exit(1);
}

function runPython(file, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(pythonCmd, [file, ...args]);

    process.stdout.on("data", data => {
      console.log(data.toString());
    });

    process.stderr.on("data", err => {
      console.error(err.toString());
    });

    process.on("error", reject);
    process.on("close", resolve);
  });
}

// Simple intent routing
if (query.includes("github") || query.includes("repo")) {
  runPython("src/servers/githubServer.py", [query]);
}
else if (query.includes("drive") || query.includes("folder")) {
  runPython("src/servers/driveServer.py", [query]);
}
else {
  console.log("No matching service found");
}
