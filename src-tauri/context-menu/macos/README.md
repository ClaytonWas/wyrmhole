# "Send via wyrmhole" on macOS

macOS doesn't allow arbitrary top-level right-click items, so the entry lives
under **right-click → Quick Actions** (or the Services menu). The app side is
already wired: wyrmhole receives the files via the macOS "open" event
(`RunEvent::Opened`) and starts the send automatically.

## Option A — Automator Quick Action (recommended, no rebuild)

1. Open **Automator** → **New** → **Quick Action**.
2. Set **"Workflow receives current"** to **files or folders** in **Finder**.
3. Add a **Run Shell Script** action.
4. Set **"Pass input"** to **as arguments** and paste:

   ```bash
   open -a wyrmhole "$@"
   ```

5. Save as **Send via wyrmhole**.

It now appears under right-click → **Quick Actions → Send via wyrmhole** for any
selected files/folders. `open -a wyrmhole <paths>` hands them to the running (or
freshly launched) instance through the open event.

To remove it later, delete:
`~/Library/Services/Send via wyrmhole.workflow`.

## Option B — bundle a Services entry into the app (future)

For a turnkey entry that ships with the app, declare an `NSServices` array in the
bundle's `Info.plist` (via Tauri's macOS Info.plist customization) pointing at a
helper that calls `open -a wyrmhole`. This avoids the manual Automator step but
requires changes to the build/signing config, so Option A is the supported path
today.
