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
- **Linux** — writes per-user files under `$XDG_DATA_HOME` / `$XDG_CONFIG_HOME`
  (see the table below). Nothing needs root.
- **macOS** — Finder Quick Actions can't be registered programmatically without
  extra entitlements, so the toggle reports this and you add it manually once
  (see `macos/README.md`).

## Linux: what gets written

Two mechanisms are used, deliberately overlapping so at least one lands on any
given desktop.

| File manager | Written to | Where the entry shows up |
| --- | --- | --- |
| Files / Nautilus (GNOME, **Ubuntu**) | `nautilus/scripts/Send via wyrmhole` | Scripts ▸ Send via wyrmhole |
| Files / Nautilus, with `python3-nautilus` | `nautilus-python/extensions/wyrmhole-nautilus.py` | top level |
| Nemo (Cinnamon, Mint) | `nemo/actions/wyrmhole.nemo_action` | top level |
| Caja (MATE) | `$XDG_CONFIG_HOME/caja/scripts/…`, `caja-python/extensions/…` | Scripts ▸, or top level with `python3-caja` |
| Thunar (XFCE, Xubuntu) | merged into `$XDG_CONFIG_HOME/Thunar/uca.xml` | top level |
| Dolphin (KDE, Kubuntu) | `kio/servicemenus/wyrmhole.desktop` (made executable, as Plasma ≥ 5.85 requires) | top level |
| PCManFM / PCManFM-Qt (LXDE/LXQt, Lubuntu) | `file-manager/actions/wyrmhole.desktop` | top level |

The **scripts** entries are what make this work on a stock Ubuntu install: they
are plain executables the file manager picks up with no extra packages and no
restart. The Python extensions are a nicer top-level entry when the (optional)
bindings happen to be installed, and are silently ignored otherwise.

Two more details the toggle handles:

- The bundled icon is copied to
  `icons/hicolor/128x128/apps/wyrmhole.png` so `Icon=wyrmhole` resolves for
  AppImage users too.
- Thunar keeps every custom action in one shared `uca.xml`, so only the
  `<action>` block carrying the `wyrmhole-send-via-wyrmhole` unique-id is
  rewritten or removed — your own actions are left byte-for-byte intact.

### The launch target

Menu entries point at `$APPIMAGE` when running from an AppImage (the AppImage
file itself, since the extracted mount disappears on exit) and at the real
binary otherwise, so packaged installs and AppImages both work. Inside a Flatpak
sandbox the toggle reports that it can't write host menu entries instead of
writing ones that would never fire.

### If the entry doesn't appear

The scripts entries show up immediately, and Nemo, Thunar and Dolphin re-read
their action files on demand. Only the Python extensions need the file manager
restarted (`nautilus -q`, `caja -q`).

## How the send itself works

The same on every platform:

1. The menu entry launches `wyrmhole <path…>`.
2. [`tauri-plugin-single-instance`](https://github.com/tauri-apps/plugins-workspace)
   forwards that launch to the already-running tray instance (no duplicate
   process). See `src-tauri/src/lib.rs`.
3. The paths land in `OsSendQueue` — cold-start argv and single-instance
   forwards alike — and are flushed as one debounced batch on the
   `send-files-from-os` event once the frontend reports in via `frontend_ready`.
   macOS instead delivers them as the `RunEvent::Opened` "open" event.
4. The frontend (`src/App.tsx` → `send_files_from_os`) fills the Send panel and
   starts the transfer, so the connection code appears with no extra clicks.

## Reference files (manual setup)

The files under `linux/` and `macos/` are the same entries the toggle writes,
with the launch target set to `/usr/bin/wyrmhole`. They're there for manual or
system-wide installation if you'd rather not use the in-app toggle; each one
carries its install path in a header comment.

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
