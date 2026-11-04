// The updater looks a release up by `{os}-{arch}-{bundle}`, then by
// `{os}-{arch}` when it does not know its bundle type. Without a bundle type
// it installs an AppImage on Linux, so the AppImage goes first. On Windows,
// the MSI goes first, like tauri-action does. The deb goes before the rpm only
// to make the choice not depend on which bundle is found first.
const BASIC_KEY_PRIORITY = {
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
export function getPlatformClaims(artifact) {
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
// Picks the artifact for each platform key, regardless of the order the
// artifacts come in. Two artifacts with the same priority for a key are
// ambiguous, e.g. two debs for the same architecture.
export function resolvePlatformEntries(artifacts) {
    const entries = new Map();
    for (const artifact of artifacts) {
        for (const { key, priority } of getPlatformClaims(artifact)) {
            const current = entries.get(key);
            if (current && current.priority === priority) {
                throw new Error(`${current.artifact.fileName} and ${artifact.fileName} both claim platform key "${key}"`);
            }
            if (!current || current.priority < priority) {
                entries.set(key, { artifact, priority });
            }
        }
    }
    return entries;
}
