# 🧙‍♂️ wyrmhole [![macOS](https://img.shields.io/badge/macOS-0A1929?logo=apple&logoColor=4FC3F7)](#) [![Linux](https://img.shields.io/badge/Linux-0A1929?logo=linux&logoColor=4FC3F7)](#) [![Windows](https://img.shields.io/badge/Windows-0A1929?logo=windows11&logoColor=4FC3F7)](#)

**A lightweight, secure file transfer GUI**

[![License: MIT](https://img.shields.io/badge/License-MIT-0A1929?logoColor=4FC3F7)](https://opensource.org/licenses/MIT)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-0A1929?logo=tauri&logoColor=4FC3F7)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18.3-0A1929?logo=react&logoColor=4FC3F7)](https://react.dev/)

[Demo 3_3.webm](https://github.com/user-attachments/assets/afbcb482-5e8e-4aac-a4f3-4ea870539e63)

## About

Wyrmhole is a cross-platform desktop application that provides a user-friendly interface for secure peer-to-peer file transfers using the [magic-wormhole.rs](https://github.com/magic-wormhole/magic-wormhole.rs/) protocol.

## Features
 
- **End-to-end encrypted** -- PAKE-secured transfers over the magic-wormhole protocol
- **Live progress** -- real-time tracking for sends and receives
- **Transfer history** -- every sent and received file, with metadata and JSON export
- **Bring your own relay** -- point at any custom relay server URL
- **Quality of life** -- auto-extract tarballs, configurable download directory and folder naming
## Quick Start
 
Requires [Rust](https://rust-lang.org/learn/get-started/) (stable), [Node.js](https://nodejs.org/en/download) (v18+), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform.
 
```bash
git clone https://github.com/ClaytonWas/wyrmhole.git
cd wyrmhole
npm install
npm run tauri dev     # development
npm run tauri build   # production, output in src-tauri/target/release/
```
 
## Usage
 
**Send:** select files or folders, click **Send**, and share the generated code.
**Receive:** enter the code, review the offer, and accept. Files land in your configured download directory and appear in **File History**.
 
Settings (gear icon, top right) cover the download directory, tarball auto-extraction, folder naming, relay server, and history export.
 
## Development
 
```
src/         React frontend (App.tsx, SettingsMenu.tsx, ...)
src-tauri/   Rust backend (lib.rs, files.rs, files_json.rs, settings.rs)
```
 
<details>
<summary><strong>Tooling commands</strong></summary>
  
- `npm run fmt` / `npm run fmt:rs` -- Prettier / rustfmt
- `npm run lint` / `npm run lint:rs` -- ESLint / clippy
- `npm run analyze` -- CLI report: tooling summary, dependency overview, bundle and binary sizes (run `npm run build` first)
</details>

## Roadmap
 
Multi-recipient sends ([experimental upstream](https://github.com/magic-wormhole/magic-wormhole.rs?tab=readme-ov-file)) and system-level dark mode. See [issues](https://github.com/ClaytonWas/wyrmhole/issues) for more.
 
## Contributing
 
Issues and pull requests welcome. For major changes, include a note on the decisions made.
 
## Resources
 
[magic-wormhole.rs](https://github.com/magic-wormhole/magic-wormhole.rs/) · [crates.io docs](https://crates.io/crates/magic-wormhole) · [Tauri 2](https://tauri.app/)[Screencast from 2026-06-11 15-24-02.webm](https://github.com/user-attachments/assets/f3d53140-071a-46f1-a94c-802f81de8fb8)



<div align="center">

**Made with 💙 by [ClaytonWas](https://github.com/ClaytonWas)**

[Report Bug/Request Feature](https://github.com/ClaytonWas/wyrmhole/issues)

</div>
