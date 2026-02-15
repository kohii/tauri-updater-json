import type { Artifact, LatestJson } from "./types.js";
export declare function generateLatestJson(artifacts: Artifact[], version: string, baseUrl: string, outputDir: string, notes?: string, allowOverwritePlatforms?: boolean): Promise<LatestJson>;
export declare function writeLatestJson(latestJson: LatestJson, outputDir: string): Promise<void>;
