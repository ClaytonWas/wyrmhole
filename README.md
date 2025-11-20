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

### Version 0.3.0

- [ ] Refactor console logging to use react-hot-toast consistently
- [ ] Modularize code structure with secure passthroughs in lib.rs
- [ ] Implement sent files history tracking
- [ ] Custom relay server configuration
- [ ] Optimize tarball naming schema

### Future Considerations

- [ ] Dark mode support
- [ ] Transfer queue management
- [ ] File preview capabilities
- [ ] Transfer statistics and analytics
- [ ] Messaging with the wormhole protocol

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [magic-wormhole.rs](https://github.com/magic-wormhole/magic-wormhole.rs/) - The secure file transfer protocol
- [Magic-Wormhole](https://magic-wormhole.readthedocs.io/) - The original Python implementation and documentation
- [Tauri](https://tauri.app/) - The framework for building desktop applications

## 📚 Resources

- [magic-wormhole.rs on crates.io](https://crates.io/crates/magic-wormhole)
- [Tauri Documentation](https://tauri.app/)

---

<div align="center">

**Made with ❤️ by [ClaytonWas](https://github.com/ClaytonWas)**

[Report Bug](https://github.com/ClaytonWas/wyrmhole/issues) · [Request Feature](https://github.com/ClaytonWas/wyrmhole/issues)

</div>
