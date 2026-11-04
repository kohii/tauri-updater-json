# tauri-updater-json

CLI tool to generate `latest.json` for [Tauri v2 Updater](https://v2.tauri.app/plugin/updater/).

## Installation

Requires Node.js 22.12.0 or later.

```bash
npm install -g tauri-updater-json
```

Or run without installing globally: `npx tauri-updater-json --help`.

## Usage

```bash
tauri-updater-json \
  --tauri-project <path> \
  --output-dir <path> \
  --base-url <url> \
  [--notes <string>] \
  [--allow-overwrite-platforms]
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--tauri-project` | Yes | Path to Tauri project directory |
| `--output-dir` | Yes | Output directory for `latest.json` and artifacts |
| `--base-url` | Yes | Base URL for artifact downloads (supports `{version}` placeholder) |
| `--notes` | No | Release notes |
| `--allow-overwrite-platforms` | No | Allow overwriting existing platform entries in `latest.json` |

### Example

```bash
tauri-updater-json \
  --tauri-project ./my-tauri-app \
  --output-dir ./releases \
  --base-url https://example.com/releases/{version}/
```

## Features

- Reads version from `tauri.conf.json` (supports `version` pointing to a `package.json` path)
- Supports `{version}` placeholder in `--base-url`
- Auto-detects build artifacts from `target/release/bundle/` and `target/<triple>/release/bundle/`, in the target directory cargo reports (a Cargo workspace's root `target/`, or `CARGO_TARGET_DIR`)
- Reads signature content from `.sig` files
- Skips bundles signed for a version other than the one in `tauri.conf.json`, such as leftovers from an earlier build (tauri-plugin-updater 2.14+ rejects them)
- Appends to an existing `latest.json` of the same version (errors on duplicates by default), and replaces one of another version
- Copies distribution files to output directory
- Generates both basic (`os-arch`) and extended (`os-arch-bundle`) platform keys
- Supports macOS universal builds (registers for both `x86_64` and `aarch64`, without overwriting native builds)

## Supported Platforms

| OS | Bundle Type | Architectures | Platform Keys |
|----|-------------|---------------|---------------|
| Linux | AppImage | x86_64, aarch64, i686, armv7 | `linux-{arch}`, `linux-{arch}-appimage` |
| Linux | deb | amd64, arm64, i386, armhf, riscv64 | `linux-{arch}`, `linux-{arch}-deb` |
| Linux | rpm | x86_64, aarch64, i386, armhfp, riscv64 | `linux-{arch}`, `linux-{arch}-rpm` |
| macOS | app | x86_64, aarch64, universal | `darwin-{arch}`, `darwin-{arch}-app` |
| Windows | NSIS | x64, arm64 | `windows-{arch}`, `windows-{arch}-nsis` |
| Windows | MSI | x64, arm64 | `windows-{arch}`, `windows-{arch}-msi` |

**Note:** macOS universal builds automatically register for both `darwin-x86_64` and `darwin-aarch64`.

## Output

Generates a `latest.json` file compatible with Tauri v2 updater:

```json
{
  "version": "1.0.0",
  "pub_date": "2025-01-04T12:00:00.000Z",
  "platforms": {
    "linux-x86_64": {
      "url": "https://example.com/releases/app.AppImage",
      "signature": "..."
    },
    "linux-x86_64-appimage": {
      "url": "https://example.com/releases/app.AppImage",
      "signature": "..."
    },
    "darwin-x86_64": {
      "url": "https://example.com/releases/app_universal.app.tar.gz",
      "signature": "..."
    },
    "darwin-aarch64": {
      "url": "https://example.com/releases/app_universal.app.tar.gz",
      "signature": "..."
    }
  }
}
```

## Development

Use Node.js 26 or later to run the TypeScript tests.

```bash
pnpm install --frozen-lockfile
pnpm test
```

Run the CLI from source with `pnpm build` followed by `node dist/index.js`.

## License

MIT
