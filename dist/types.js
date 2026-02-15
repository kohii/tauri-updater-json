import { z } from "zod";
export const PlatformInfoSchema = z.object({
    url: z.string().url(),
    signature: z.string(),
});
export const LatestJsonSchema = z.object({
    version: z.string(),
    notes: z.string().optional(),
    pub_date: z.string().optional(),
    platforms: z.record(z.string(), PlatformInfoSchema),
});
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
