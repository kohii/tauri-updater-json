import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
const BASE_URL = "https://example.com/{version}/";

// The shape of a `.sig` file the Tauri CLI writes: a base64-encoded minisign
// signature whose trusted comment records the file and, since tauri-cli 2.12,
// the app version.
function signature(trustedComment: string): string {
  const box = [
    "untrusted comment: signature from tauri secret key",
    "RUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=",
    `trusted comment: ${trustedComment}`,
    "DDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==",
  ].join("\n");
  return Buffer.from(box).toString("base64");
}

function signedFor(file: string, version?: string): string {
  const fields = ["timestamp:1700000000", `file:${file}`];
  if (version) fields.push(`version:${version}`);
  return signature(fields.join("\t"));
}

// bundle paths are relative to src-tauri/target
async function makeProject(
  version: string,
  bundles: Record<string, string | null>
): Promise<{ project: string; out: string }> {
  const root = await mkdtemp(join(tmpdir(), "tauri-updater-json-"));
  const project = join(root, "app");
  const srcTauri = join(project, "src-tauri");
  await mkdir(srcTauri, { recursive: true });
  await writeFile(join(srcTauri, "tauri.conf.json"), JSON.stringify({ version }));
  for (const [path, sig] of Object.entries(bundles)) {
    const file = join(srcTauri, "target", path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `bundle ${path}`);
    if (sig !== null) await writeFile(`${file}.sig`, `${sig}\n`);
  }
  return { project, out: join(root, "out") };
}

async function run(project: string, out: string, ...extra: string[]) {
  const args = [CLI, "--tauri-project", project, "--output-dir", out, "--base-url", BASE_URL, ...extra];
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, args);
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code: number; stdout: string; stderr: string };
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

async function readLatest(out: string) {
  return JSON.parse(await readFile(join(out, "latest.json"), "utf-8"));
}

test("generates basic and bundle keys for every platform", async () => {
  const { project, out } = await makeProject("1.0.0", {
    "release/bundle/appimage/App_1.0.0_amd64.AppImage": signedFor("App_1.0.0_amd64.AppImage", "1.0.0"),
    "release/bundle/nsis/App_1.0.0_x64-setup.exe": signedFor("App_1.0.0_x64-setup.exe", "1.0.0"),
    "release/bundle/msi/App_1.0.0_x64_en-US.msi": signedFor("App_1.0.0_x64_en-US.msi", "1.0.0"),
    "universal-apple-darwin/release/bundle/macos/App.app.tar.gz": signedFor("App.app.tar.gz", "1.0.0"),
  });

  const result = await run(project, out);
  assert.equal(result.code, 0, result.stderr);

  const latest = await readLatest(out);
  assert.equal(latest.version, "1.0.0");
  assert.deepEqual(Object.keys(latest.platforms).sort(), [
    "darwin-aarch64",
    "darwin-aarch64-app",
    "darwin-x86_64",
    "darwin-x86_64-app",
    "linux-x86_64",
    "linux-x86_64-appimage",
    "windows-x86_64",
    "windows-x86_64-msi",
    "windows-x86_64-nsis",
  ]);
  assert.deepEqual(latest.platforms["linux-x86_64"], {
    url: "https://example.com/1.0.0/App_1.0.0_amd64.AppImage",
    signature: signedFor("App_1.0.0_amd64.AppImage", "1.0.0"),
  });
  assert.equal(latest.platforms["windows-x86_64"].url, "https://example.com/1.0.0/App_1.0.0_x64_en-US.msi");
  assert.deepEqual((await readdir(out)).sort(), [
    "App.app.tar.gz",
    "App_1.0.0_amd64.AppImage",
    "App_1.0.0_x64-setup.exe",
    "App_1.0.0_x64_en-US.msi",
    "latest.json",
  ]);
});

test("adds to an existing latest.json and refuses duplicate keys", async () => {
  const linux = await makeProject("1.0.0", {
    "release/bundle/deb/App_1.0.0_amd64.deb": signedFor("App_1.0.0_amd64.deb", "1.0.0"),
  });
  const arm = await makeProject("1.0.0", {
    "release/bundle/deb/App_1.0.0_arm64.deb": signedFor("App_1.0.0_arm64.deb", "1.0.0"),
  });

  assert.equal((await run(linux.project, linux.out)).code, 0);
  assert.equal((await run(arm.project, linux.out)).code, 0);
  assert.deepEqual(Object.keys((await readLatest(linux.out)).platforms).sort(), [
    "linux-aarch64",
    "linux-aarch64-deb",
    "linux-x86_64",
    "linux-x86_64-deb",
  ]);

  const again = await run(linux.project, linux.out);
  assert.equal(again.code, 1);
  assert.match(again.stderr, /Platform entry already exists for key "linux-x86_64"/);
  assert.equal((await run(linux.project, linux.out, "--allow-overwrite-platforms")).code, 0);
});

test("skips bundles signed for another version", async () => {
  const { project, out } = await makeProject("1.1.0", {
    "release/bundle/deb/App_1.1.0_amd64.deb": signedFor("App_1.1.0_amd64.deb", "1.1.0"),
    // left over from an earlier cross build
    "aarch64-unknown-linux-gnu/release/bundle/deb/App_1.0.0_arm64.deb": signedFor("App_1.0.0_arm64.deb", "1.0.0"),
    // signed by a Tauri CLI that did not record the version
    "aarch64-unknown-linux-gnu/release/bundle/rpm/App-1.1.0-1.aarch64.rpm": signedFor("App-1.1.0-1.aarch64.rpm"),
  });

  const result = await run(project, out);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /App_1.0.0_arm64.deb is signed for version 1.0.0, not 1.1.0, skipping/);
  assert.deepEqual(Object.keys((await readLatest(out)).platforms).sort(), [
    "linux-aarch64",
    "linux-aarch64-rpm",
    "linux-x86_64",
    "linux-x86_64-deb",
  ]);
});

test("refuses to keep entries of an earlier release from latest.json", async () => {
  const v1 = await makeProject("1.0.0", {
    "release/bundle/deb/App_1.0.0_amd64.deb": signedFor("App_1.0.0_amd64.deb", "1.0.0"),
    "release/bundle/nsis/App_1.0.0_x64-setup.exe": signedFor("App_1.0.0_x64-setup.exe", "1.0.0"),
  });
  const v2 = await makeProject("2.0.0", {
    "release/bundle/deb/App_2.0.0_amd64.deb": signedFor("App_2.0.0_amd64.deb", "2.0.0"),
  });
  assert.equal((await run(v1.project, v1.out)).code, 0);
  const before = (await readdir(v1.out)).sort();

  const result = await run(v2.project, v1.out, "--allow-overwrite-platforms");
  assert.equal(result.code, 1);
  assert.match(
    result.stderr,
    /Platform entries signed for another version than 2.0.0: windows-x86_64, windows-x86_64-nsis\./
  );
  assert.deepEqual((await readdir(v1.out)).sort(), before, "nothing is copied");
  assert.equal((await readLatest(v1.out)).version, "1.0.0");
});

test("skips bundles without a signature", async () => {
  const { project, out } = await makeProject("1.0.0", {
    "release/bundle/deb/App_1.0.0_amd64.deb": null,
  });
  const result = await run(project, out);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Signature file not found for App_1.0.0_amd64.deb/);
});
