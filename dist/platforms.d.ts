import type { Artifact } from "./types.js";
export declare const FALLBACK_PRIORITY = 0;
export interface PlatformClaim {
    key: string;
    priority: number;
}
export declare function getPlatformClaims(artifact: Artifact): PlatformClaim[];
export interface PlatformEntry {
    artifact: Artifact;
    priority: number;
}
export declare function resolvePlatformEntries(artifacts: Artifact[]): Map<string, PlatformEntry>;
