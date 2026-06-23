# "Send via wyrmhole" context-menu integration

Right-click a file or folder → **Send via wyrmhole** → the app opens with the
transfer code ready, exactly as if you'd dropped the file in manually.

## Opt-in, never silent

The installer does **not** modify the registry or drop any files into your
system. The entry is added only when you turn on
**Settings → Right-Click "Send via wyrmhole"**, and turning it back off removes
everything it added. The toggle reflects the live OS state, so it's always
accurate.

Implementation: `src-tauri/src/context_menu.rs`
(`get_context_menu_enabled` / `set_context_menu_enabled` commands).

- **Windows** — writes per-user keys under `HKCU\Software\Classes` (no admin).
- **Linux** — writes per-user files under `$XDG_DATA_HOME` (`~/.local/share`)
  for KDE (`kio/servicemenus/`), Nautilus (`nautilus-python/extensions/`, needs
  the `python3-nautilus` package), and Nemo (`nemo/actions/`). The launch
  command points at the running binary, so it works for packaged installs and
  AppImages.
- **macOS** — Finder Quick Actions can't be registered programmatically without
  extra entitlements, so the toggle reports this and you add it manually once
  (see `macos/README.md`). Thunar (XFCE) is likewise per-user/manual — see
  `linux/thunar/uca-snippet.xml`.

## How the send itself works

The same on every platform:

1. The menu entry launches `wyrmhole <path…>`.
2. [`tauri-plugin-single-instance`](https://github.com/tauri-apps/plugins-workspace)
   forwards that launch to the already-running tray instance (no duplicate
   process). See `src-tauri/src/lib.rs`.
3. The paths become a send:
   - **Cold start** — stored in `PendingSendPaths`, drained once by the frontend
     via `take_pending_send_paths` on mount.
   - **Already running** — emitted as the `send-files-from-os` event.
   - **macOS** — delivered as the `RunEvent::Opened` "open" event.
4. The frontend (`src/App.tsx` → `send_files_from_os`) fills the Send panel and
   starts the transfer, so the connection code appears with no extra clicks.

## Reference files (manual setup)

The files under `linux/` and `macos/` are the same entries the toggle writes,
provided for manual or system-wide installation if you'd rather not use the
in-app toggle.

## Testing the engine without any menu

What the menu entries ultimately do — run from a terminal:

```bash
# Linux / macOS
wyrmhole /path/to/file /path/to/folder

# Windows (PowerShell)
& "$env:LOCALAPPDATA\wyrmhole\wyrmhole.exe" "C:\path\to\file"
```

Run once with the app closed (cold start) and once with it open (single-instance
forwarding) — both should pop the window with a code.
