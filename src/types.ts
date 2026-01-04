import { z } from "zod";

// OS types
export type OS = "linux" | "darwin" | "windows";

// Architecture types (normalized)
export type Arch = "x86_64" | "aarch64" | "i686" | "armv7" | "universal";

// Bundle types
export type BundleType = "appimage" | "deb" | "rpm" | "app" | "nsis" | "msi";

export const PlatformInfoSchema = z.object({
  url: z.string().url(),
  signature: z.string(),
});

export type PlatformInfo = z.infer<typeof PlatformInfoSchema>;

export const LatestJsonSchema = z.object({
  version: z.string(),
  notes: z.string().optional(),
  pub_date: z.string().optional(),
  platforms: z.record(z.string(), PlatformInfoSchema),
});

export type LatestJson = z.infer<typeof LatestJsonSchema>;

export interface CliOptions {
  tauriProject: string;
  outputDir: string;
  baseUrl: string;
  notes?: string;
  allowOverwritePlatforms?: boolean;
}

export interface Artifact {
  os: OS;
  arch: Arch;
  bundle: BundleType;
  bundlePath: string;
  signaturePath: string;
  fileName: string;
}

// Tauri config schema (partial, only what we need)
export const TauriConfigSchema = z.object({
  version: z.string().optional(),
  package: z
    .object({
      version: z.string().optional(),
    })
    .optional(),
  identifier: z.string().optional(),
});

export type TauriConfig = z.infer<typeof TauriConfigSchema>;
