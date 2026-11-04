import type { Artifact, BundleType } from "./types.js";

// The updater looks a release up by `{os}-{arch}-{bundle}`, then by
// `{os}-{arch}` when it does not know its bundle type. Without a bundle type
// it installs an AppImage on Linux, so the AppImage goes first. On Windows,
// the MSI goes first, like tauri-action does. The deb goes before the rpm only
// to make the choice not depend on which bundle is found first.
const BASIC_KEY_PRIORITY: Record<BundleType, number> = {
  appimage: 3,
  deb: 2,
  rpm: 1,
  msi: 2,
  nsis: 1,
  app: 1,
};

// A universal macOS build serves both architectures, but a native build of
// the architecture is preferred to it. It fills only the keys that nothing
// else claims, and that an existing latest.json has no entry for.
export const FALLBACK_PRIORITY = 0;

export interface PlatformClaim {
  key: string;
  // Of the artifacts that claim a key, the one with the highest priority gets it.
  priority: number;
}

export function getPlatformClaims(artifact: Artifact): PlatformClaim[] {
  const { os, arch, bundle } = artifact;
  if (os === "darwin" && arch === "universal") {
    return ["x86_64", "aarch64"].flatMap((target) => [
      { key: `darwin-${target}`, priority: FALLBACK_PRIORITY },
      { key: `darwin-${target}-${bundle}`, priority: FALLBACK_PRIORITY },
    ]);
  }
  return [
    { key: `${os}-${arch}`, priority: BASIC_KEY_PRIORITY[bundle] },
    { key: `${os}-${arch}-${bundle}`, priority: 1 },
  ];
}

export interface PlatformEntry {
  artifact: Artifact;
  priority: number;
}

// Picks the artifact for each platform key, regardless of the order the
// artifacts come in. Two artifacts with the same priority for a key are
// ambiguous, e.g. two debs for the same architecture.
export function resolvePlatformEntries(
  artifacts: Artifact[]
): Map<string, PlatformEntry> {
  const entries = new Map<string, PlatformEntry>();
  for (const artifact of artifacts) {
    for (const { key, priority } of getPlatformClaims(artifact)) {
      const current = entries.get(key);
      if (current && current.priority === priority) {
        throw new Error(
          `${current.artifact.fileName} and ${artifact.fileName} both claim platform key "${key}"`
        );
      }
      if (!current || current.priority < priority) {
        entries.set(key, { artifact, priority });
      }
    }
  }
  return entries;
}
