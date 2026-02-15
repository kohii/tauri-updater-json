import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LatestJsonSchema } from "./types.js";
import { readSignature, getPlatformKeys } from "./artifacts.js";
async function loadExistingLatestJson(outputDir) {
    const latestJsonPath = join(outputDir, "latest.json");
    try {
        const content = await readFile(latestJsonPath, "utf-8");
        return LatestJsonSchema.parse(JSON.parse(content));
    }
    catch {
        return null;
    }
}
const VERSION_PLACEHOLDERS = ["{version}", "${version}", "{{version}}"];
function applyVersionPlaceholder(baseUrl, version) {
    let resolved = baseUrl;
    for (const placeholder of VERSION_PLACEHOLDERS) {
        resolved = resolved.replaceAll(placeholder, version);
    }
    return resolved;
}
function buildUrl(baseUrl, version, fileName) {
    const resolvedBase = applyVersionPlaceholder(baseUrl, version);
    const base = resolvedBase.endsWith("/") ? resolvedBase : `${resolvedBase}/`;
    return `${base}${fileName}`;
}
export async function generateLatestJson(artifacts, version, baseUrl, outputDir, notes, allowOverwritePlatforms) {
    const existing = await loadExistingLatestJson(outputDir);
    const platforms = existing?.platforms ?? {};
    for (const artifact of artifacts) {
        const signature = await readSignature(artifact.signaturePath);
        const platformInfo = {
            url: buildUrl(baseUrl, version, artifact.fileName),
            signature: signature.trim(),
        };
        // Get all platform keys for this artifact (basic and extended)
        const keys = getPlatformKeys(artifact);
        for (const key of keys) {
            const isBasicKey = key === `${artifact.os}-${artifact.arch}`;
            const isWindowsBasic = artifact.os === "windows" && isBasicKey;
            if (!allowOverwritePlatforms &&
                Object.prototype.hasOwnProperty.call(platforms, key)) {
                const isUniversalDarwin = artifact.os === "darwin" && artifact.arch === "universal";
                const isUniversalKey = key === "darwin-aarch64" ||
                    key === "darwin-x86_64" ||
                    key === "darwin-aarch64-app" ||
                    key === "darwin-x86_64-app";
                if (isUniversalDarwin && isUniversalKey) {
                    continue;
                }
                if (isWindowsBasic) {
                    if (artifact.bundle === "msi") {
                        platforms[key] = platformInfo;
                        continue;
                    }
                    // Prefer MSI for os-arch key; keep existing entry for NSIS.
                    continue;
                }
                throw new Error(`Platform entry already exists for key "${key}" (artifact: ${artifact.fileName})`);
            }
            if (allowOverwritePlatforms ||
                !Object.prototype.hasOwnProperty.call(platforms, key)) {
                platforms[key] = platformInfo;
            }
        }
    }
    const latestJson = {
        version,
        pub_date: new Date().toISOString(),
        platforms,
    };
    if (notes) {
        latestJson.notes = notes;
    }
    else if (existing?.notes) {
        latestJson.notes = existing.notes;
    }
    return latestJson;
}
export async function writeLatestJson(latestJson, outputDir) {
    const latestJsonPath = join(outputDir, "latest.json");
    await writeFile(latestJsonPath, JSON.stringify(latestJson, null, 2) + "\n");
}
