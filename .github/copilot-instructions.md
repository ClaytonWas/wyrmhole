# Wyrmhole - AI Coding Instructions

## Project Overview
Wyrmhole is a **Tauri 2 + React 18** desktop app providing a GUI for secure peer-to-peer file transfers using the `magic-wormhole.rs` protocol. The architecture is a Rust backend (`src-tauri/`) + TypeScript/React frontend (`src/`).

## Architecture & Data Flow

### Frontend ↔ Backend Communication
- **Commands**: Frontend calls Rust via `invoke()` from `@tauri-apps/api/core`
- **Events**: Backend emits real-time updates via `app_handle.emit()`, frontend listens with `listen()` from `@tauri-apps/api/event`
- Key event names: `send-progress`, `download-progress`, `send-error`, `download-error`, `connection-code`, `received-file-added`, `sent-file-added`

### Rust Module Structure (`src-tauri/src/`)
- `lib.rs` - Tauri command bindings (thin wrappers that delegate to modules)
- `files.rs` - Core file transfer logic using `magic-wormhole` crate, manages active transfers via static `Lazy<Mutex<HashMap>>` maps
- `files_json.rs` - Persists transfer history to JSON files in app data directory
- `settings.rs` - User preferences (download directory, auto-extract, relay server URL)

### State Management Pattern
- **Rust**: Uses `once_cell::sync::Lazy` with `tokio::sync::Mutex` for thread-safe global state (`ACTIVE_SENDS`, `ACTIVE_DOWNLOADS`, `REQUESTS_HASHMAP`)
- **React**: Uses `useState` with `Map` objects for tracking active transfers by ID, `useEffect` for event listeners with proper cleanup

## Development Commands

```bash
npm run tauri dev      # Start dev mode (hot reload frontend + Rust rebuild)
npm run tauri build    # Production build

# Formatting & Linting
npm run fmt            # Prettier for TS/React
npm run fmt:rs         # rustfmt for Rust
npm run lint           # ESLint for frontend
npm run lint:rs        # Clippy for Rust (treats warnings as errors)

npm run analyze        # Project analysis report (deps, bundle sizes)
```

## Key Patterns & Conventions

### Adding New Tauri Commands
1. Implement logic in appropriate module (`files.rs`, `settings.rs`)
2. Create thin wrapper in `lib.rs` with `#[tauri::command]` attribute
3. Register in `invoke_handler!` macro in `lib.rs`'s `run()` function
4. Commands are async and return `Result<T, String>`

### Event Emission Pattern (Rust → Frontend)
```rust
let _ = app_handle.emit("event-name", serde_json::json!({
    "id": transfer_id,
    "status": "sending",
    "percentage": 50
}));
```

### Event Listening Pattern (Frontend)
```tsx
useEffect(() => {
  const unlistenPromise = listen("event-name", (event) => {
    const payload = event.payload as EventType;
    // Handle payload
  });
  return () => { unlistenPromise.then((unlisten) => unlisten()); };
}, []);
```

### Transfer ID Conventions
- Send operations: Use `crypto.randomUUID()` from frontend
- Receive connections: Use `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
- IDs must be passed consistently between frontend calls and backend events

### Multi-File Transfers
- Multiple files are packaged as `.gz` tarballs using `tar` + `flate2` crates
- Temporary tarballs created in system temp directory, cleaned up after transfer
- `auto_extract_tarballs` setting controls automatic extraction on receive

## File Locations
- User settings: `AppHandle::path().app_config_dir()` → `settings.json`
- Transfer history: Same directory → `received_files.json`, `sent_files.json`
- Frontend components: Flat structure in `src/` (no nested component folders)

## Dependencies to Know
- `magic-wormhole` (0.7.6) - Core transfer protocol
- `sonner` - Toast notifications (replaces react-hot-toast mentioned in README)
- `@tauri-apps/plugin-dialog` - Native file picker
- `tailwindcss` v4 - Styling (uses `@tailwindcss/vite` plugin)
