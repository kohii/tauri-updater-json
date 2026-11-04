import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

const roots: string[] = [];
after(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

// bundle paths are relative to src-tauri/target
async function makeProject(
  version: string,
  bundles: Record<string, string | null>
): Promise<{ project: string; out: string }> {
  const root = await mkdtemp(join(tmpdir(), "tauri-updater-json-"));
  roots.push(root);
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

function entryFor(file: string) {
  return { url: `https://example.com/1.0.0/${file}`, signature: signedFor(file, "1.0.0") };
}

// The order artifacts are found in: `release/bundle` comes before
// `<triple>/release/bundle`, and within a bundle root the bundle types come
// in a fixed order. Each case below puts the preferred bundle last as well.
for (const appImageRoot of ["release", "x86_64-unknown-linux-gnu/release"]) {
  test(`prefers the AppImage for the os-arch key on Linux (AppImage in ${appImageRoot})`, async () => {
    const { project, out } = await makeProject("1.0.0", {
      [`${appImageRoot}/bundle/appimage/App_1.0.0_amd64.AppImage`]: signedFor("App_1.0.0_amd64.AppImage", "1.0.0"),
      "release/bundle/deb/App_1.0.0_amd64.deb": signedFor("App_1.0.0_amd64.deb", "1.0.0"),
      "release/bundle/rpm/App-1.0.0-1.x86_64.rpm": signedFor("App-1.0.0-1.x86_64.rpm", "1.0.0"),
    });
    const result = await run(project, out);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual((await readLatest(out)).platforms, {
      "linux-x86_64": entryFor("App_1.0.0_amd64.AppImage"),
      "linux-x86_64-appimage": entryFor("App_1.0.0_amd64.AppImage"),
      "linux-x86_64-deb": entryFor("App_1.0.0_amd64.deb"),
      "linux-x86_64-rpm": entryFor("App-1.0.0-1.x86_64.rpm"),
    });
  });
}

test("prefers the deb over the rpm for the os-arch key on Linux", async () => {
  const { project, out } = await makeProject("1.0.0", {
    "x86_64-unknown-linux-gnu/release/bundle/deb/App_1.0.0_amd64.deb": signedFor("App_1.0.0_amd64.deb", "1.0.0"),
    "release/bundle/rpm/App-1.0.0-1.x86_64.rpm": signedFor("App-1.0.0-1.x86_64.rpm", "1.0.0"),
  });
  const result = await run(project, out);
  assert.equal(result.code, 0, result.stderr);
  const latest = await readLatest(out);
  assert.deepEqual(latest.platforms["linux-x86_64"], entryFor("App_1.0.0_amd64.deb"));
  assert.deepEqual(latest.platforms["linux-x86_64-rpm"], entryFor("App-1.0.0-1.x86_64.rpm"));
});

for (const [msiRoot, nsisRoot] of [
  ["release", "x86_64-pc-windows-msvc/release"],
  ["x86_64-pc-windows-msvc/release", "release"],
]) {
  test(`prefers the MSI for the os-arch key on Windows (MSI in ${msiRoot}, NSIS in ${nsisRoot})`, async () => {
    const { project, out } = await makeProject("1.0.0", {
      [`${msiRoot}/bundle/msi/App_1.0.0_x64_en-US.msi`]: signedFor("App_1.0.0_x64_en-US.msi", "1.0.0"),
      [`${nsisRoot}/bundle/nsis/App_1.0.0_x64-setup.exe`]: signedFor("App_1.0.0_x64-setup.exe", "1.0.0"),
    });
    const result = await run(project, out);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual((await readLatest(out)).platforms, {
      "windows-x86_64": entryFor("App_1.0.0_x64_en-US.msi"),
      "windows-x86_64-msi": entryFor("App_1.0.0_x64_en-US.msi"),
      "windows-x86_64-nsis": entryFor("App_1.0.0_x64-setup.exe"),
    });
  });
}

test("a universal macOS build does not replace a native one found before or after it", async () => {
  const { project, out } = await makeProject("1.0.0", {
    "release/bundle/macos/App_universal.app.tar.gz": signedFor("App_universal.app.tar.gz", "1.0.0"),
    "aarch64-apple-darwin/release/bundle/macos/App.app.tar.gz": signedFor("App.app.tar.gz", "1.0.0"),
  });
  const result = await run(project, out);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual((await readLatest(out)).platforms, {
    "darwin-aarch64": entryFor("App.app.tar.gz"),
    "darwin-aarch64-app": entryFor("App.app.tar.gz"),
    "darwin-x86_64": entryFor("App_universal.app.tar.gz"),
    "darwin-x86_64-app": entryFor("App_universal.app.tar.gz"),
  });
});

test("refuses two bundles of the same type for the same platform", async () => {
  const { project, out } = await makeProject("1.0.0", {
    "release/bundle/deb/App_1.0.0_amd64.deb": signedFor("App_1.0.0_amd64.deb", "1.0.0"),
    "x86_64-unknown-linux-gnu/release/bundle/deb/Other_1.0.0_amd64.deb": signedFor("Other_1.0.0_amd64.deb", "1.0.0"),
  });
  const result = await run(project, out);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /App_1.0.0_amd64.deb and Other_1.0.0_amd64.deb both/);
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

  const rebuilt = await makeProject("1.0.0", {
    "release/bundle/deb/Renamed_1.0.0_amd64.deb": signedFor("Renamed_1.0.0_amd64.deb", "1.0.0"),
  });
  const again = await run(rebuilt.project, linux.out);
  assert.equal(again.code, 1);
  assert.match(again.stderr, /Platform entry already exists for key "linux-x86_64"/);
  assert.ok(!(await readdir(linux.out)).includes("Renamed_1.0.0_amd64.deb"), "a rejected run copies nothing");
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

test("explains when every bundle is signed for another version", async () => {
  // e.g. the app was built before tauri.conf.json got its new version
  const { project, out } = await makeProject("1.1.0", {
    "release/bundle/deb/App_1.0.0_amd64.deb": signedFor("App_1.0.0_amd64.deb", "1.0.0"),
  });
  const result = await run(project, out);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /No artifacts are signed for version 1.1.0 from tauri.conf.json/);
});

test("replaces a latest.json of another release", async () => {
  const v1 = await makeProject("1.0.0", {
    "release/bundle/deb/App_1.0.0_amd64.deb": signedFor("App_1.0.0_amd64.deb", "1.0.0"),
    "release/bundle/nsis/App_1.0.0_x64-setup.exe": signedFor("App_1.0.0_x64-setup.exe", "1.0.0"),
  });
  const v2 = await makeProject("2.0.0", {
    "release/bundle/deb/App_2.0.0_amd64.deb": signedFor("App_2.0.0_amd64.deb", "2.0.0"),
  });
  assert.equal((await run(v1.project, v1.out, "--notes", "v1 notes")).code, 0);

  const result = await run(v2.project, v1.out);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /Existing latest.json is for version 1.0.0, replacing it with one for 2.0.0/);
  const latest = await readLatest(v1.out);
  assert.equal(latest.version, "2.0.0");
  assert.equal(latest.notes, undefined);
  assert.deepEqual(Object.keys(latest.platforms).sort(), ["linux-x86_64", "linux-x86_64-deb"]);
});

test("supports riscv64", async () => {
  const { project, out } = await makeProject("1.0.0", {
    "riscv64gc-unknown-linux-gnu/release/bundle/deb/App_1.0.0_riscv64.deb": signedFor("App_1.0.0_riscv64.deb", "1.0.0"),
  });
  assert.equal((await run(project, out)).code, 0);
  assert.deepEqual(Object.keys((await readLatest(out)).platforms).sort(), [
    "linux-riscv64",
    "linux-riscv64-deb",
  ]);
});

test("skips bundles without a signature", async () => {
  const { project, out } = await makeProject("1.0.0", {
    "release/bundle/deb/App_1.0.0_amd64.deb": null,
  });
  const result = await run(project, out);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Signature file not found for App_1.0.0_amd64.deb/);
});
