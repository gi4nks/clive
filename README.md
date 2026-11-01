# Clive

**A keyboard-first, dual-pane file manager for macOS.** Move between folders, compare locations, preview files, and batch-rename with a live review. Optional AI actions can propose changes for you to inspect before applying.

[Features](#features) · [Install](#install) · [AI and privacy](#ai-and-privacy) · [Contributing](#contributing) · [License](#license)

> **Download:** Get the latest Apple Silicon (`aarch64`) DMG from [GitHub Releases](https://github.com/gi4nks/clive/releases), or build from source below.

## Why Clive?

Finder works well for everyday browsing. Clive is for workflows where seeing two folders at once, navigating with the keyboard, and reviewing file changes before applying them makes the work easier.

## Features

- **Two file panes** with independent navigation history, a resizable split, and quick transfers between locations.
- **Batch rename** with a live pattern preview and an undoable operation.
- **File preview** for images, video, audio, PDF, Markdown, and text, with an expanded view when you need more room.
- **Finder-compatible tags**, Navigator filtering, pinned locations, mounted-volume details, and safe eject.
- **ZIP browsing** without extracting the archive.
- **Optional AI tools** for chat, summaries, rename, and folder-organization proposals. AI can be disabled in Settings. File changes proposed by AI go through review and the app's undoable operation flow.

## Install

Download the latest `Clive_<version>_aarch64.dmg` for Apple Silicon Macs from [GitHub Releases](https://github.com/gi4nks/clive/releases).

Current GitHub builds are ad-hoc signed and are not Developer ID-signed or notarized. On first launch, macOS Gatekeeper may show *"Apple could not verify 'Clive' is free of malware."* To approve it, dismiss the dialog, open **System Settings → Privacy & Security**, click **Open Anyway** next to Clive, and confirm **Open** (or Control-click **Clive.app** in Finder and choose **Open**). SHA-256 checksums are published in each [GitHub Release](https://github.com/gi4nks/clive/releases).

### Build from source

Clive currently targets macOS. To run the development build, install Xcode Command Line Tools, Rust, and Node.js 20 or later, then run:

```sh
git clone --recurse-submodules https://github.com/gi4nks/clive.git
cd clive
make setup
make dev
```

To create a release bundle locally, run `make build`. Build outputs are written to `target/release/bundle/`.

## AI and privacy

AI is optional and can be disabled globally in Settings. Clive supports local and cloud OpenAI-compatible providers. Cloud use is opt-in; when enabled, prompts and the context sent to a provider leave your Mac. Review the provider's privacy terms before connecting it. Clive does not require AI credentials for ordinary file management.

AI-generated file changes are proposals. Review them before applying; supported operations can be undone through Clive's operation history.

## Contributing

Bug reports and feature ideas are welcome through [GitHub Issues](https://github.com/gi4nks/clive/issues). Please include your macOS version, Clive version, steps to reproduce, and expected behavior. Remove personal paths, filenames, and credentials from logs or screenshots before attaching them.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow, [the changelog](CHANGELOG.md) for project history, and [the feature specifications](openspec/specs/) for documented behavior.

## Development

The UI uses React and TypeScript; the desktop shell and filesystem operations use Tauri 2 and Rust. Useful local commands:

```sh
make frontend-test
make frontend-check
make quality
```

The quality gate enforces separate 85% line-coverage floors for the frontend and Rust suites. See [the quality-gate plan](docs/plans/2026-10-18-m6-coverage-gates.md) and [docs/RELEASING.md](docs/RELEASING.md) for coverage and release details.

## Support

Use [GitHub Issues](https://github.com/gi4nks/clive/issues) to report a reproducible bug or request a feature. Do not include API keys, private file contents, or unredacted personal information.

## License

Clive is licensed under the [MIT License](LICENSE).
