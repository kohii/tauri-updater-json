import { test } from "node:test";
import assert from "node:assert/strict";
import { isSignedFor, signedVersion } from "../dist/signature.js";

// Signatures from tauri-plugin-updater's own tests (plugins/updater/src/updater.rs),
// encoded the way the Tauri CLI writes `.sig` files
const encode = (box: string) => Buffer.from(box).toString("base64");
const VERSIONED = encode(
  "untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA=="
);
const UNVERSIONED = encode(
  "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1633700835\tfile:test\tprehashed\nwLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ=="
);

test("reads the version from the trusted comment", () => {
  assert.equal(signedVersion(VERSIONED), "2.0.0");
  assert.equal(signedVersion(`${VERSIONED}\n`), "2.0.0");
  assert.equal(signedVersion(UNVERSIONED), undefined);
});

test("accepts a matching or unrecorded version, like the updater", () => {
  assert.ok(isSignedFor(VERSIONED, "2.0.0"));
  assert.ok(isSignedFor(VERSIONED, "v2.0.0"));
  assert.ok(!isSignedFor(VERSIONED, "2.0.1"));
  assert.ok(isSignedFor(UNVERSIONED, "9.9.9"));
});
