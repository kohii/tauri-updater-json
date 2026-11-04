import type { Artifact } from "./types.js";
export declare function findArtifacts(projectPath: string): Promise<Artifact[]>;
export declare function getSearchDirectories(projectPath: string): Promise<string[]>;
export declare function copyArtifactToOutput(artifact: Artifact, outputDir: string): Promise<void>;
