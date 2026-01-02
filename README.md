# tauri-windows-bundle

[![npm](https://img.shields.io/npm/v/@choochmeque/tauri-windows-bundle.svg)](https://www.npmjs.com/package/@choochmeque/tauri-windows-bundle)
[![codecov](https://codecov.io/gh/Choochmeque/tauri-windows-bundle/branch/main/graph/badge.svg)](https://codecov.io/gh/Choochmeque/tauri-windows-bundle)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

MSIX packaging tool for Tauri apps - create Windows Store ready bundles with multiarch support.

## Features

- **MSIX Packaging** - Create Store-ready MSIX packages
- **Multiarch Support** - Build for x64 and arm64 in one bundle
- **tauri.conf.json Integration** - Automatically reads app name, version, icons, and resources
- **Code Signing** - Support for PFX certificates and Windows certificate store
- **Windows Extensions** - Share Target, File Associations, Protocol Handlers, Startup Task, Context Menus, Background Tasks, App Execution Alias, App Services, Toast Activation, Autoplay, Print Task Settings, Thumbnail/Preview Handlers

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
npx @choochmeque/tauri-windows-bundle init [options]
  -p, --path <path>    Path to Tauri project

npx @choochmeque/tauri-windows-bundle build [options]
  --arch <archs>       Architectures (comma-separated: x64,arm64) [default: x64]
  --release            Build in release mode
  --min-windows <ver>  Minimum Windows version [default: 10.0.17763.0]

npx @choochmeque/tauri-windows-bundle extension list
  -p, --path <path>    Path to Tauri project

npx @choochmeque/tauri-windows-bundle extension add <type>
  <type>               Extension type (see below)
  -p, --path <path>    Path to Tauri project

npx @choochmeque/tauri-windows-bundle extension remove <type> [name]
  <type>               Extension type (see below)
  [name]               Extension identifier (required for most types)
  -p, --path <path>    Path to Tauri project

Extension types:
  file-association     Associate file types with your app
  protocol             Register URL protocol handlers (myapp://)
  share-target         Receive shared content from other apps
  startup-task         Run app on Windows login
  context-menu         Add right-click menu items in Explorer
  background-task      Run tasks when app is not in foreground
  app-execution-alias  Run app from command line (e.g., myapp)
  app-service          Allow other apps to call into your app
  toast-activation     Handle toast notification clicks
  autoplay             Launch when media/device is inserted
  print-task-settings  Custom print settings UI
  thumbnail-handler    Custom file thumbnails in Explorer
  preview-handler      Custom file previews in Explorer
```

## Windows Extensions

### File Associations

```bash
npx @choochmeque/tauri-windows-bundle extension add file-association
# Prompts for: name, extensions, description
```

### Protocol Handlers

```bash
npx @choochmeque/tauri-windows-bundle extension add protocol
# Prompts for: protocol name, display name
```

### Share Target

```bash
# Enable
npx @choochmeque/tauri-windows-bundle extension add share-target

# Disable
npx @choochmeque/tauri-windows-bundle extension remove share-target
```

### Startup Task

Run your app automatically when Windows starts.

```bash
# Enable
npx @choochmeque/tauri-windows-bundle extension add startup-task

# Disable
npx @choochmeque/tauri-windows-bundle extension remove startup-task
```

### Context Menu

Add right-click menu items in Windows Explorer.

```bash
npx @choochmeque/tauri-windows-bundle extension add context-menu
# Prompts for: menu name, file types, display name
```

### Background Task

Run tasks when app is not in foreground.

```bash
npx @choochmeque/tauri-windows-bundle extension add background-task
# Prompts for: task name, type (timer/systemEvent/pushNotification)
```

### List Extensions

```bash
npx @choochmeque/tauri-windows-bundle extension list
```

### App Execution Alias

Run your app from command line (e.g., `myapp` instead of full path).

```bash
npx @choochmeque/tauri-windows-bundle extension add app-execution-alias
# Prompts for: alias name
```

### App Service

Allow other apps to call into your app.

```bash
npx @choochmeque/tauri-windows-bundle extension add app-service
# Prompts for: service name
```

### Toast Activation

Handle toast notification clicks and actions.

```bash
# Enable
npx @choochmeque/tauri-windows-bundle extension add toast-activation

# Disable
npx @choochmeque/tauri-windows-bundle extension remove toast-activation
```

### Autoplay

Launch your app when media or devices are inserted.

```bash
npx @choochmeque/tauri-windows-bundle extension add autoplay
# Prompts for: verb, action display name, event type (content/device)
```

### Print Task Settings

Add custom print settings UI.

```bash
# Enable
npx @choochmeque/tauri-windows-bundle extension add print-task-settings

# Disable
npx @choochmeque/tauri-windows-bundle extension remove print-task-settings
```

### Thumbnail Handler

Provide custom thumbnails for your file types in Explorer.

```bash
npx @choochmeque/tauri-windows-bundle extension add thumbnail-handler
# Prompts for: CLSID, file types
```

### Preview Handler

Provide custom file previews in Explorer.

```bash
npx @choochmeque/tauri-windows-bundle extension add preview-handler
# Prompts for: CLSID, file types
```

### List Extensions

```bash
npx @choochmeque/tauri-windows-bundle extension list
```

### Remove Extension

```bash
npx @choochmeque/tauri-windows-bundle extension remove file-association myfiles
npx @choochmeque/tauri-windows-bundle extension remove protocol myapp
npx @choochmeque/tauri-windows-bundle extension remove context-menu open-with-myapp
npx @choochmeque/tauri-windows-bundle extension remove background-task sync-task
npx @choochmeque/tauri-windows-bundle extension remove app-execution-alias myapp
npx @choochmeque/tauri-windows-bundle extension remove app-service com.myapp.service
npx @choochmeque/tauri-windows-bundle extension remove autoplay open
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
