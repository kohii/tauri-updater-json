import { z } from "zod";
export type OS = "linux" | "darwin" | "windows";
export type Arch = "x86_64" | "aarch64" | "i686" | "armv7" | "universal";
export type BundleType = "appimage" | "deb" | "rpm" | "app" | "nsis" | "msi";
export declare const PlatformInfoSchema: z.ZodObject<{
    url: z.ZodURL;
    signature: z.ZodString;
}, z.core.$strip>;
export type PlatformInfo = z.infer<typeof PlatformInfoSchema>;
export declare const LatestJsonSchema: z.ZodObject<{
    version: z.ZodString;
    notes: z.ZodOptional<z.ZodString>;
    pub_date: z.ZodOptional<z.ZodString>;
    platforms: z.ZodRecord<z.ZodString, z.ZodObject<{
        url: z.ZodURL;
        signature: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
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
export declare const TauriConfigSchema: z.ZodObject<{
    version: z.ZodOptional<z.ZodString>;
    package: z.ZodOptional<z.ZodObject<{
        version: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    identifier: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TauriConfig = z.infer<typeof TauriConfigSchema>;
