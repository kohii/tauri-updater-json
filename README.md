# tauri-updater-json

CLI tool to generate `latest.json` for [Tauri v2 Updater](https://v2.tauri.app/plugin/updater/).

## Installation

```bash
pnpm install
pnpm build
```

## Usage

```bash
node dist/index.js \
  --tauri-project <path> \
  --output-dir <path> \
  --base-url <url> \
  [--notes <string>]
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--tauri-project` | Yes | Path to Tauri project directory |
| `--output-dir` | Yes | Output directory for `latest.json` and artifacts |
| `--base-url` | Yes | Base URL for artifact downloads (supports `{version}` placeholder) |
| `--notes` | No | Release notes |

### Example

```bash
node dist/index.js \
  --tauri-project ./my-tauri-app \
  --output-dir ./releases \
  --base-url https://example.com/releases/{version}/
```

## Features

- Reads version from `tauri.conf.json` (supports `version` pointing to a `package.json` path)
- Supports `{version}` placeholder in `--base-url`
- Auto-detects build artifacts from `target/release/bundle/`
- Reads signature content from `.sig` files
- Appends to existing `latest.json` if present
- Copies distribution files to output directory
- Generates both basic (`os-arch`) and extended (`os-arch-bundle`) platform keys
- Supports macOS universal builds (registers for both `x86_64` and `aarch64`)

## Supported Platforms

| OS | Bundle Type | Architectures | Platform Keys |
|----|-------------|---------------|---------------|
| Linux | AppImage | x86_64, aarch64, i686, armv7 | `linux-{arch}`, `linux-{arch}-appimage` |
| Linux | deb | amd64, arm64, i386, armhf | `linux-{arch}`, `linux-{arch}-deb` |
| Linux | rpm | x86_64, aarch64, i386, armhfp | `linux-{arch}`, `linux-{arch}-rpm` |
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

## License

MIT
