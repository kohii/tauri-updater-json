import { execFile } from "node:child_process";
import { readdir, readFile, copyFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { promisify } from "node:util";
import type { Artifact, Arch, OS, BundleType } from "./types.js";

interface BundleConfig {
  os: OS;
  bundle: BundleType;
  dir: string;
  // Pattern to match the bundle file (without .sig)
  pattern: RegExp;
  // Function to extract architecture from filename
  extractArch: (fileName: string, filePath: string) => Arch | null;
}

// Normalize architecture to standard format
function normalizeArch(arch: string): Arch | null {
  switch (arch) {
    case "amd64":
    case "x86_64":
    case "x64":
      return "x86_64";
    case "arm64":
    case "aarch64":
      return "aarch64";
    case "i386":
    case "i686":
    case "x86":
    case "x32":
      return "i686";
    case "arm":
    case "armhf":
    case "armhfp":
    case "armv7":
      return "armv7";
    case "riscv64":
      return "riscv64";
    case "universal":
      return "universal";
    default:
      return null;
  }
}

const BUNDLE_CONFIGS: BundleConfig[] = [
  // Linux AppImage
  {
    os: "linux",
    bundle: "appimage",
    dir: "appimage",
    pattern: /\.AppImage$/,
    extractArch: (fileName) => {
      const match = fileName.match(/_([^_]+)\.AppImage$/);
      return match ? normalizeArch(match[1]) : null;
    },
  },
  // Linux deb
  {
    os: "linux",
    bundle: "deb",
    dir: "deb",
    pattern: /\.deb$/,
    extractArch: (fileName) => {
      const match = fileName.match(/_([^_]+)\.deb$/);
      return match ? normalizeArch(match[1]) : null;
    },
  },
  // Linux rpm
  {
    os: "linux",
    bundle: "rpm",
    dir: "rpm",
    pattern: /\.rpm$/,
    extractArch: (fileName) => {
      // RPM format: name-version-release.arch.rpm
      const match = fileName.match(/\.([^.]+)\.rpm$/);
      return match ? normalizeArch(match[1]) : null;
    },
  },
  // macOS app
  {
    os: "darwin",
    bundle: "app",
    dir: "macos",
    pattern: /\.app\.tar\.gz$/,
    extractArch: (fileName, filePath) => {
      // Prefer target triple from path (tauri-action behavior)
      if (filePath.includes("universal-apple-darwin") || fileName.includes("universal")) {
        return "universal";
      }
      if (filePath.includes("aarch64-apple-darwin")) {
        return "aarch64";
      }
      if (filePath.includes("x86_64-apple-darwin")) {
        return "x86_64";
      }
      // Fallback to filename markers
      if (fileName.includes("aarch64") || fileName.includes("arm64")) {
        return "aarch64";
      }
      if (fileName.includes("x86_64") || fileName.includes("x64")) {
        return "x86_64";
      }
      // Final fallback: use current runtime arch (tauri-action parseAsset fallback)
      return process.arch === "arm64" ? "aarch64" : "x86_64";
    },
  },
  // Windows NSIS
  {
    os: "windows",
    bundle: "nsis",
    dir: "nsis",
    pattern: /-setup\.exe$/,
    extractArch: (fileName) => {
      // Pattern: Name_version_arch-setup.exe
      const match = fileName.match(/_([^_]+)-setup\.exe$/);
      return match ? normalizeArch(match[1]) : null;
    },
  },
  // Windows MSI
  {
    os: "windows",
    bundle: "msi",
    dir: "msi",
    pattern: /\.msi$/,
    extractArch: (fileName) => {
      // Pattern: Name_version_arch_lang.msi
      const match = fileName.match(/_([^_]+)_[^_]+\.msi$/);
      return match ? normalizeArch(match[1]) : null;
    },
  },
];

async function findFilesInDir(
  dirPath: string,
  pattern: RegExp
): Promise<string[]> {
  try {
    const files = await readdir(dirPath);
    return files.filter((f) => pattern.test(f)).map((f) => join(dirPath, f));
  } catch {
    return [];
  }
}

export async function findArtifacts(projectPath: string): Promise<Artifact[]> {
  const bundleRoots = await getBundleRoots(projectPath);
  const artifacts: Artifact[] = [];
  const seen = new Set<string>();

  for (const bundleDir of bundleRoots) {
    for (const config of BUNDLE_CONFIGS) {
      const dirPath = join(bundleDir, config.dir);
      const files = await findFilesInDir(dirPath, config.pattern);

      for (const filePath of files) {
        if (seen.has(filePath)) continue;
        seen.add(filePath);
        const fileName = basename(filePath);

        let signature: string;
        try {
          signature = (await readFile(`${filePath}.sig`, "utf-8")).trim();
        } catch {
          console.warn(`Signature file not found for ${fileName}, skipping`);
          continue;
        }

        const arch = config.extractArch(fileName, filePath);
        if (!arch) {
          console.warn(
            `Could not detect architecture for ${fileName}, skipping`
          );
          continue;
        }

        artifacts.push({
          os: config.os,
          arch,
          bundle: config.bundle,
          bundlePath: filePath,
          signature,
          fileName,
        });
      }
    }
  }

  return artifacts;
}

export async function getSearchDirectories(
  projectPath: string
): Promise<string[]> {
  const roots = await getBundleRoots(projectPath);
  return roots.flatMap((bundleDir) =>
    BUNDLE_CONFIGS.map((config) => join(bundleDir, config.dir))
  );
}

// Cargo decides where the build output goes: a workspace root's `target/`,
// `CARGO_TARGET_DIR`, or `build.target-dir`. It reads that config from the
// directory it runs in and its ancestors, so it runs in src-tauri, as the
// build did. Without cargo, assume the default for a standalone src-tauri crate.
async function getTargetDir(projectPath: string): Promise<string> {
  const srcTauri = join(projectPath, "src-tauri");
  try {
    const { stdout } = await promisify(execFile)(
      "cargo",
      ["metadata", "--no-deps", "--format-version", "1"],
      { cwd: srcTauri, maxBuffer: 64 * 1024 * 1024 }
    );
    return JSON.parse(stdout).target_directory;
  } catch {
    return join(srcTauri, "target");
  }
}

async function getBundleRoots(projectPath: string): Promise<string[]> {
  const targetDir = await getTargetDir(projectPath);
  const roots = new Set<string>([
    join(targetDir, "release", "bundle"),
  ]);

  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "release" || entry.name === "debug") continue;
      roots.add(join(targetDir, entry.name, "release", "bundle"));
    }
  } catch {
    // ignore missing target dir
  }

  return Array.from(roots);
}

export async function copyArtifactToOutput(
  artifact: Artifact,
  outputDir: string
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const destPath = join(outputDir, artifact.fileName);
  await copyFile(artifact.bundlePath, destPath);
}

// Generate platform keys for an artifact
// Returns both basic key (os-arch) and extended key (os-arch-bundle)
export function getPlatformKeys(artifact: Artifact): string[] {
  const keys: string[] = [];
  const { os, arch, bundle } = artifact;

  if (arch === "universal" && os === "darwin") {
    // Universal macOS builds register for both architectures
    keys.push("darwin-x86_64");
    keys.push("darwin-aarch64");
    keys.push("darwin-x86_64-app");
    keys.push("darwin-aarch64-app");
  } else {
    // Basic key: os-arch
    keys.push(`${os}-${arch}`);
    // Extended key: os-arch-bundle
    keys.push(`${os}-${arch}-${bundle}`);
  }

  return keys;
}
