# 🧙‍♂️ Wyrmhole [![macOS](https://img.shields.io/badge/macOS-0A1929?logo=apple&logoColor=4FC3F7)](#) [![Linux](https://img.shields.io/badge/Linux-0A1929?logo=linux&logoColor=4FC3F7)](#) [![Windows](https://img.shields.io/badge/Windows-0A1929?logo=windows11&logoColor=4FC3F7)](#)

**A lightweight, secure file transfer GUI**

[![License: MIT](https://img.shields.io/badge/License-MIT-0A1929?logoColor=4FC3F7)](https://opensource.org/licenses/MIT)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-0A1929?logo=tauri&logoColor=4FC3F7)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18.3-0A1929?logo=react&logoColor=4FC3F7)](https://react.dev/)

## About

Wyrmhole is a cross-platform desktop application that provides a user-friendly interface for secure peer-to-peer file transfers using the [magic-wormhole.rs](https://github.com/magic-wormhole/magic-wormhole.rs/) protocol.

### Features

- 🔐 **End-to-end encrypted file transfers** using the magic-wormhole protocol.
- 📊 **Real-time download progress** for sending and receiving files.
- 📜 **Transfer History** of sent and received files with metadata.
- 🌐 **Custom Relay Server** with the ability configure your own relay server URL.

## Getting Started

### Dependencies

- [**Rust** (latest stable version)](https://rust-lang.org/learn/get-started/)
- [**Node.js** (v18 or higher)](https://nodejs.org/en/download)
- [System Prerequisites for **Tauri**](https://tauri.app/start/prerequisites/)

### Installation

#### From Source

1. Clone the repository:
```bash
git clone https://github.com/ClaytonWas/wyrmhole.git
cd wyrmhole
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run tauri dev
```

4. Build for production:
```bash
npm run tauri build
```

The built application will be in `src-tauri/target/release/`.

## Usage

### Sending Files

1. Click the **Send Files** section
2. Select one or more files/folders to send
3. Click **Send** to generate a transfer code
4. Share the code with the recipient
5. Monitor progress in the **Active Transfers** section

### Receiving Files

1. Enter the transfer code provided by the sender
2. Click **Receive** to start the connection
3. Review the file offer and accept or deny
4. Monitor download progress
5. Access received files from the **File History** section

### Settings

Access settings via the gear icon in the top-right corner:

- **Download Directory** - Set where received files are saved
- **Auto-Extract Tarballs** - Automatically extract received archives
- **Default Folder Name Format** - Customize folder naming for multiple file transfers
- **Custom Relay Server URL** - Use your own relay server
- **Export JSON History** - Export your transfer history as a JSON file

## 🛠️ Development

### Project Structure

```
wyrmhole/
├── src/                    # React frontend
│   ├── App.tsx            # Main application component
│   ├── SettingsMenu.tsx   # Settings modal
│   └── ...
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── lib.rs         # Main Tauri commands
│   │   ├── files.rs       # File transfer logic
│   │   ├── files_json.rs  # File history management
│   │   └── settings.rs    # Settings management
│   └── Cargo.toml
└── package.json
```

### Tech Stack

- **Frontend**: React 18
- **Backend**: Tauri 2

### Formatting, Linting, and Analysis

Use the following commands during development:

- `npm run fmt` – Format the React/TypeScript code with Prettier
- `npm run fmt:rs` – Format the Rust/Tauri backend with `rustfmt`
- `npm run lint` – Lint the frontend TypeScript/React code with ESLint
- `npm run lint:rs` – Run `clippy` on the Rust backend
- `npm run analyze` – Generate a CLI report including:
  - Code style tooling summary
  - Dependency overview and likely-unused packages
  - Bundle size summary from `dist/assets` (run `npm run build` first)
  - Rust binary sizes from `src-tauri/target`

### Building

```bash
# Development build
npm run tauri dev

# Production build
npm run tauri build
```

## Future Features

| Feature | Description |
| ------- | ----------- |
| 👥 **Send to Multiple Recipients** | Send a file to multiple people ([experimental feature](https://github.com/magic-wormhole/magic-wormhole.rs?tab=readme-ov-file)) |
| 🌙 **Dark Mode** | Support for a dark mode at the system level using glassy UI |

## Contributing

Contributions are welcome! Open an issue or submit a pull request. For major changes, please include a comment with decisions made. 

## Resources

- [magic-wormhole.rs on GitHub](https://github.com/magic-wormhole/magic-wormhole.rs/)
- [magic-wormhole.rs documentation on crates.io](https://crates.io/crates/magic-wormhole) 
- [Tauri 2 website](https://tauri.app/)


<div align="center">

**Made with 💙 by [ClaytonWas](https://github.com/ClaytonWas)**

[Report Bug/Request Feature](https://github.com/ClaytonWas/wyrmhole/issues)

</div>
