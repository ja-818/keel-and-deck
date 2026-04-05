import { builtinExperiences } from "./builtin";
import type { Experience, ExperienceManifest } from "../lib/types";

export async function loadAllExperiences(): Promise<Experience[]> {
  const all: Experience[] = [];

  // Built-in experiences
  for (const manifest of builtinExperiences) {
    all.push({ manifest, source: "builtin" });
  }

  // Installed experiences (from ~/.houston/experiences/)
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const installed = await invoke<Array<{ manifest: ExperienceManifest; path: string }>>(
      "list_installed_experiences"
    );
    for (const inst of installed) {
      all.push({
        manifest: inst.manifest,
        source: "installed",
        path: inst.path,
        bundleUrl: inst.manifest.tabs.some(t => t.customComponent)
          ? `asset://localhost/${inst.path}/bundle.js`
          : undefined,
      });
    }
  } catch {
    // Tauri not available (dev mode) or command not registered yet
    console.warn("Could not load installed experiences");
  }

  return all;
}
