import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { TauriConfigSchema } from "./types.js";
const PackageJsonSchema = z.object({
    version: z.string(),
});
async function readVersionFromPackageJson(pathFromConfig, configDir) {
    const packageJsonPath = resolve(configDir, pathFromConfig);
    const content = await readFile(packageJsonPath, "utf-8");
    const parsed = PackageJsonSchema.parse(JSON.parse(content));
    return parsed.version;
}
async function resolveVersion(version, configDir) {
    if (!version)
        return undefined;
    // If version looks like a JSON path, treat it as a relative path from tauri.conf.json
    if (version.endsWith(".json")) {
        return await readVersionFromPackageJson(version, configDir);
    }
    return version;
}
export async function readTauriConfig(projectPath) {
    const configPath = join(projectPath, "src-tauri", "tauri.conf.json");
    const configDir = dirname(configPath);
    const content = await readFile(configPath, "utf-8");
    const config = TauriConfigSchema.parse(JSON.parse(content));
    // Try to get version from different locations in config
    const version = (await resolveVersion(config.version, configDir)) ??
        (await resolveVersion(config.package?.version, configDir));
    if (!version) {
        throw new Error(`Could not find version in tauri.conf.json. Please ensure "version" is set.`);
    }
    return version;
}
