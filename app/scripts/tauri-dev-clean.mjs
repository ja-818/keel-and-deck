#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  removeOldDevBinaries,
  run,
  stopOldDevProcesses,
  verifyPolicyBinary,
  verifyRunningEngine,
  verifyStagedSidecars,
} from "./dev-clean-utils.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(appRoot, "..");
const devDataRoot = process.env.HOUSTON_DATA_DIR ?? resolve(process.env.HOME ?? "", ".dev-houston");
const engineBinary = resolve(
  workspaceRoot,
  "target",
  "debug",
  process.platform === "win32" ? "houston-engine.exe" : "houston-engine",
);
const stagedDir = resolve(appRoot, "src-tauri", "binaries");

stopOldDevProcesses({ workspaceRoot, devDataRoot });
removeOldDevBinaries({ engineBinary, stagedDir });

console.log("Building latest houston-engine sidecar...");
run("cargo", ["build", "--bin", "houston-engine"], workspaceRoot);
const engineInfo = verifyPolicyBinary(engineBinary, "Built target/debug houston-engine");

console.log("Staging latest sidecar through app build script...");
run("cargo", ["build", "-p", "houston-app", "--no-default-features"], workspaceRoot);
verifyStagedSidecars({ stagedDir, expectedHash: engineInfo.hash });

console.log("Starting Tauri dev...");
const child = spawn("pnpm", ["tauri", "dev"], {
  cwd: appRoot,
  stdio: "inherit",
  shell: false,
});
verifyRunningEngine(engineInfo.hash);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
