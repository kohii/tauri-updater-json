import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact, LatestJson, PlatformInfo } from "./types.js";
import { LatestJsonSchema } from "./types.js";
import { readSignature, getPlatformKeys } from "./artifacts.js";

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

function buildUrl(baseUrl: string, fileName: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}${fileName}`;
}

export async function generateLatestJson(
  artifacts: Artifact[],
  version: string,
  baseUrl: string,
  outputDir: string,
  notes?: string
): Promise<LatestJson> {
  const existing = await loadExistingLatestJson(outputDir);

  const platforms: Record<string, PlatformInfo> = existing?.platforms ?? {};

  for (const artifact of artifacts) {
    const signature = await readSignature(artifact.signaturePath);
    const platformInfo: PlatformInfo = {
      url: buildUrl(baseUrl, artifact.fileName),
      signature: signature.trim(),
    };

    // Get all platform keys for this artifact (basic and extended)
    const keys = getPlatformKeys(artifact);
    for (const key of keys) {
      platforms[key] = platformInfo;
    }
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
