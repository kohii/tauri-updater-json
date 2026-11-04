import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LatestJsonSchema } from "./types.js";
import { FALLBACK_PRIORITY, resolvePlatformEntries } from "./platforms.js";
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
    // latest.json describes one release. Entries of another release would
    // point to builds of another version.
    let existing = await loadExistingLatestJson(outputDir);
    if (existing && existing.version !== version) {
        console.warn(`Existing latest.json is for version ${existing.version}, replacing it with one for ${version}`);
        existing = null;
    }
    const platforms = existing?.platforms ?? {};
    for (const [key, { artifact, priority }] of resolvePlatformEntries(artifacts)) {
        if (!allowOverwritePlatforms && Object.hasOwn(platforms, key)) {
            if (priority === FALLBACK_PRIORITY)
                continue;
            throw new Error(`Platform entry already exists for key "${key}" (artifact: ${artifact.fileName})`);
        }
        platforms[key] = {
            url: buildUrl(baseUrl, version, artifact.fileName),
            signature: artifact.signature,
        };
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
