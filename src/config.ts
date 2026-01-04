import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TauriConfigSchema } from "./types.js";

export async function readTauriConfig(projectPath: string): Promise<string> {
  const configPath = join(projectPath, "src-tauri", "tauri.conf.json");

  const content = await readFile(configPath, "utf-8");
  const config = TauriConfigSchema.parse(JSON.parse(content));

  // Try to get version from different locations in config
  const version = config.version ?? config.package?.version;

  if (!version) {
    throw new Error(
      `Could not find version in tauri.conf.json. Please ensure "version" is set.`
    );
  }

  return version;
}
