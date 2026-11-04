import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact, LatestJson, PlatformInfo } from "./types.js";
import { LatestJsonSchema } from "./types.js";
import { FALLBACK_PRIORITY, resolvePlatformEntries } from "./platforms.js";

async function loadExistingLatestJson(
  outputDir: string
): Promise<LatestJson | null> {
  const latestJsonPath = join(outputDir, "latest.json");
  try {
    const content = await readFile(latestJsonPath, "utf-8");
    return LatestJsonSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

const VERSION_PLACEHOLDERS = ["{version}", "${version}", "{{version}}"];

function applyVersionPlaceholder(baseUrl: string, version: string): string {
  let resolved = baseUrl;
  for (const placeholder of VERSION_PLACEHOLDERS) {
    resolved = resolved.replaceAll(placeholder, version);
  }
  return resolved;
}

function buildUrl(baseUrl: string, version: string, fileName: string): string {
  const resolvedBase = applyVersionPlaceholder(baseUrl, version);
  const base = resolvedBase.endsWith("/") ? resolvedBase : `${resolvedBase}/`;
  return `${base}${fileName}`;
}

export async function generateLatestJson(
  artifacts: Artifact[],
  version: string,
  baseUrl: string,
  outputDir: string,
  notes?: string,
  allowOverwritePlatforms?: boolean
): Promise<LatestJson> {
  // latest.json describes one release. Entries of another release would
  // point to builds of another version.
  let existing = await loadExistingLatestJson(outputDir);
  if (existing && existing.version !== version) {
    console.warn(
      `Existing latest.json is for version ${existing.version}, replacing it with one for ${version}`
    );
    existing = null;
  }

  const platforms: Record<string, PlatformInfo> = existing?.platforms ?? {};

  for (const [key, { artifact, priority }] of resolvePlatformEntries(artifacts)) {
    if (!allowOverwritePlatforms && Object.hasOwn(platforms, key)) {
      if (priority === FALLBACK_PRIORITY) continue;
      throw new Error(
        `Platform entry already exists for key "${key}" (artifact: ${artifact.fileName})`
      );
    }
    platforms[key] = {
      url: buildUrl(baseUrl, version, artifact.fileName),
      signature: artifact.signature,
    };
  }

  const latestJson: LatestJson = {
    version,
    pub_date: new Date().toISOString(),
    platforms,
  };

  if (notes) {
    latestJson.notes = notes;
  } else if (existing?.notes) {
    latestJson.notes = existing.notes;
  }

  return latestJson;
}

export async function writeLatestJson(
  latestJson: LatestJson,
  outputDir: string
): Promise<void> {
  const latestJsonPath = join(outputDir, "latest.json");
  await writeFile(latestJsonPath, JSON.stringify(latestJson, null, 2) + "\n");
}
