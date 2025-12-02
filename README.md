# 🧙‍♂️ Wyrmhole

<div align="center">

**A lightweight, secure file transfer GUI**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-2C2D72?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://react.dev/)

</div>

## 📖 About

Wyrmhole is a cross-platform desktop application that provides a beautiful, user-friendly interface for secure peer-to-peer file transfers using the [magic-wormhole.rs](https://github.com/magic-wormhole/magic-wormhole.rs/) protocol. It combines the security and efficiency of Rust and the Magic Wormhome protocol with the flexibility of modern React web technologies.

### ✨ Features

- 🔐 **Secure Transfers** - End-to-end encrypted file transfers using the magic-wormhole protocol
- 📁 **Multiple File Support** - Send single files or entire directories with automatic tarball packaging
- 📊 **Real-time Progress** - Live progress tracking for both sending and receiving operations
- 📜 **Transfer History** - Complete history of received files with metadata
- 🚀 **Cross-platform** - Works on Windows, macOS, and Linux
- 📦 **Compact Package** - Builds to < 15mB

## 🌀 Demo 
[Multi_File_Send_and_Receive.webm](https://github.com/user-attachments/assets/16d9d46d-a24b-402e-be05-bc5009b7b30d)

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **Rust** (latest stable version)
- **System dependencies** for Tauri (see [Tauri prerequisites](https://tauri.app/start/prerequisites/))

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

## 💻 Usage

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
│   │   ├── files_json.rs  # File history management
│   │   └── settings.rs    # Settings management
│   └── Cargo.toml
└── package.json
```

### Tech Stack

- **Frontend**: React 18, Tailwind CSS, React Hot Toast
- **Backend**: Tauri 2, magic-wormhole-rs
- **Build Tool**: Vite

### Building

```bash
# Development build
npm run tauri dev

# Production build
npm run tauri build
```

## 📋 Roadmap

### Version 0.4.0 — Foundations of the Warp Engine

Wyrmhole is evolving from a *Magic Wormhole UI* into a **modular P2P teleportation platform**.
This roadmap ensures we grow **safely**, **incrementally**, and **without rewrites**.

#### 🎯 Goal

Prepare the backend for multiple future transports (Warp Mode, LAN mode, QUIC) **without changing current behavior**.

---

### 🧱 Architecture & Maintainability

| Task                                                                                    | Why it matters                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Split `files.rs` into modules: `send.rs`, `receive.rs`, `tar.rs`, `history.rs`          | Avoid giant-file complexity & improve future changes             |
| Create `transport/` module and move wormhole-specific code into `transport/wormhole.rs` | Make “wormhole” one backend option, not the whole system         |
| Introduce a `DataTransport` trait                                                       | Enables plugging in direct, local, or QUIC transports later      |
| Refactor send/receive calls to use `dyn DataTransport`                                  | Prevent UI and history code from depending on wormhole internals |
| Remove wormhole-specific logging from generic layers                                    | Cleaner separation + easier debugging                            |

> This work makes Warp Mode possible later **without a risky rewrite**.

---

### 📊 UI/UX Enhancements

| Task                                                     | Why                                                       |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Show `Transport: Relay (Legacy)` in transfer cards       | Helps users understand what transport they’re on today    |
| Display throughput (MiB/s) below progress bars           | Makes performance visible and measurable before Warp Mode |
| Improved relay test feedback (`Testing…`, inline status) | UX clarity when debugging custom relay setup              |

> Surface speed & transport signals to users early, while everything is still relay-based.

---

### 🔍 Stability & Testing

| Task                                                            | Why                                               |
| --------------------------------------------------------------- | ------------------------------------------------- |
| Write a **Happy Path Integration Test** (script or semi-manual) | Confidence that refactoring won’t break transfers |
| Test: Send a known folder (e.g., 50MB), verify size + history   | Automated objective success criteria              |
| Check error logs remain clean (`no [error]` on success runs)    | Detect regressions immediately                    |

> This ensures **Wyrmhole keeps working** while internals change.

---

### 🧹 Developer Experience

| Task                                                 | Why                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| Optional: add a debug flag for verbose transfer logs | Easier to diagnose relay/path issues during development    |
| Document control-plane vs data-plane separation      | Prevents future contributors from merging the layers again |

> We protect the architecture we’re building now.

---

### 🧭 After 0.4.0

Once 0.4.0 lands, the system is ready for:

| Future feature                | Depends on                          |
| ----------------------------- | ----------------------------------- |
| LAN-only transfers (no relay) | Clean DataTransport API             |
| Direct NAT hole punching      | Wormhole-agnostic transport control |
| Multi-stream Warp Mode        | Pluggable data plane                |
| QUIC experiments              | No coupling to wormhole’s TCP flow  |

> We unlock new performance paths while remaining backward-compatible.


### Future Considerations

- [ ] Dark mode support
- [ ] Transfer queue management
- [ ] File preview capabilities
- [ ] Better transfer telemetry & analytics
- [ ] Direct TCP hole-punch paths
- [ ] Multi-stream file chunking
- [ ] QUIC fallback for WAN
- [ ] LAN broadcast discovery

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📚 Resources

- [magic-wormhole.rs](https://github.com/magic-wormhole/magic-wormhole.rs/) - The secure file transfer protocol used in this application
- [magic-wormhole.rs on crates.io](https://crates.io/crates/magic-wormhole)
- [Tauri](https://tauri.app/) - The framework used for this applciation
- [Tauri Documentation](https://tauri.app/)

## 🙏 Acknowledgments

- [Magic-Wormhole](https://magic-wormhole.readthedocs.io/) - The original Python implementation and documentation

---

<div align="center">

**Made with ❤️ by [ClaytonWas](https://github.com/ClaytonWas)**

[Report Bug](https://github.com/ClaytonWas/wyrmhole/issues) · [Request Feature](https://github.com/ClaytonWas/wyrmhole/issues)

</div>
