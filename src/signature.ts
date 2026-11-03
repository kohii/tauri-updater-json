// A Tauri updater signature (`.sig` file, `signature` in latest.json) is a
// base64-encoded minisign signature. Since tauri-cli 2.12 its trusted comment
// records the app version (`timestamp:…\tfile:…\tversion:1.2.3`), and since
// tauri-plugin-updater 2.14 the updater refuses an update whose signed version
// differs from the `version` in latest.json.

// Returns the version the artifact was signed for, or undefined when the
// signature does not record one (signed by an older Tauri CLI).
export function signedVersion(signature: string): string | undefined {
  const box = Buffer.from(signature.trim(), "base64").toString("utf-8");
  const trustedComment = box
    .split("\n")
    .find((line) => line.startsWith("trusted comment: "))
    ?.slice("trusted comment: ".length);
  return trustedComment
    ?.split("\t")
    .find((field) => field.startsWith("version:"))
    ?.slice("version:".length);
}

// Whether the updater accepts this signature for a release announced as
// `version`. Like the updater, a leading `v` is ignored.
export function isSignedFor(signature: string, version: string): boolean {
  const signed = signedVersion(signature);
  return signed === undefined || stripV(signed) === stripV(version);
}

function stripV(version: string): string {
  return version.replace(/^v/, "");
}
