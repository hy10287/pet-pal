#!/usr/bin/env node
"use strict";

/**
 * Launch Electron without the ELECTRON_RUN_AS_NODE pitfall.
 * VS Code / some IDE terminals set ELECTRON_RUN_AS_NODE=1, which makes
 * `npx electron .` execute as a plain Node process and never open a window.
 */
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let electronPath;
try {
  electronPath = require("electron");
} catch {
  console.error("Electron is not installed. Run: npm install");
  process.exit(1);
}

const entry = path.join(__dirname, "dist", "main", "index.js");
if (!fs.existsSync(entry)) {
  console.error("Missing build output. Run: npm run build");
  process.exit(1);
}

const child = spawn(electronPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: false,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
