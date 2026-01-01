# tauri-windows-bundle

MSIX packaging tool for Tauri apps - create Windows Store ready bundles with multiarch support.

## Features

- **MSIX Packaging** - Create Store-ready MSIX packages
- **Multiarch Support** - Build for x64 and arm64 in one bundle
- **tauri.conf.json Integration** - Automatically reads app name, version, icons, and resources
- **Code Signing** - Support for PFX certificates and Windows certificate store
- **Windows Extensions** (future) - Share Target, File Associations, Protocol Handlers

## Prerequisites

- [Rust](https://rustup.rs/) with Windows targets
- [msixbundle-cli](https://github.com/Choochmeque/msixbundle-rs) (auto-installed on first build)
- Windows SDK (for signing)

```bash
# Install Rust targets for multiarch builds
rustup target add x86_64-pc-windows-msvc
rustup target add aarch64-pc-windows-msvc
```

## Installation

```bash
# One-time setup
npx @choochmeque/tauri-windows-bundle init

# Or install as dev dependency
npm install -D @choochmeque/tauri-windows-bundle
```

## Usage

### Initialize

```bash
npx @choochmeque/tauri-windows-bundle init
```

This creates:
- `src-tauri/gen/windows/bundle.config.json` - MSIX-specific configuration
- `src-tauri/gen/windows/AppxManifest.xml.template` - Manifest template
- `src-tauri/gen/windows/Assets/` - Placeholder icons
- Adds `tauri:windows:build` script to package.json

### Configure

Edit `src-tauri/gen/windows/bundle.config.json`:

```json
{
  "publisher": "CN=YourCompany",
  "publisherDisplayName": "Your Company Name",
  "capabilities": ["internetClient"],
  "signing": {
    "pfx": null,
    "pfxPassword": null
  }
}
```

**Auto-read from tauri.conf.json:**
- `displayName` ← `productName`
- `version` ← `version` (auto-converted to 4-part: `1.0.0` → `1.0.0.0`)
- `description` ← `bundle.shortDescription`
- `icons` ← `bundle.icon`
- `resources` ← `bundle.resources`
- `signing` ← `bundle.windows.certificateThumbprint`

### Build

```bash
# Build x64 only (default)
pnpm tauri:windows:build

# Build multiarch bundle (x64 + arm64)
pnpm tauri:windows:build --arch x64,arm64

# Release build
pnpm tauri:windows:build --release
```

### Output

```
target/msix/
├── MyApp_x64.msix
├── MyApp_arm64.msix      # if --arch x64,arm64
└── MyApp.msixbundle      # combined bundle
```

## CLI Reference

```bash
tauri-windows-bundle init [options]
  -p, --path <path>    Path to Tauri project

tauri-windows-bundle build [options]
  --arch <archs>       Architectures (comma-separated: x64,arm64) [default: x64]
  --release            Build in release mode
  --min-windows <ver>  Minimum Windows version [default: 10.0.17763.0]
```

## Code Signing

### Option 1: PFX Certificate

```json
{
  "signing": {
    "pfx": "path/to/certificate.pfx",
    "pfxPassword": null
  }
}
```

Set password via environment variable:
```bash
export MSIX_PFX_PASSWORD=your-password
```

### Option 2: Windows Certificate Store

Use thumbprint from `tauri.conf.json`:
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "ABC123..."
    }
  }
}
```

## License

[MIT](LICENSE)
