// Runtime registration of the optional "Send via wyrmhole" file-manager
// context-menu entry. The installer never touches this; the user opts in from
// Settings, and toggling off fully removes what was added. `is_enabled` reads
// the live OS state (registry on Windows, per-user files on Linux) so the
// Settings toggle always reflects reality, mirroring the autostart pattern.

/// True if the context-menu entry is currently registered for this user.
pub fn is_enabled() -> Result<bool, String> {
    imp::is_enabled()
}

/// Add (`true`) or remove (`false`) the context-menu entry for this user.
pub fn set_enabled(enabled: bool) -> Result<(), String> {
    imp::set_enabled(enabled)
}

// ---------------------------------------------------------------------------
// Windows: per-user entries under HKCU\Software\Classes (no admin required).
// ---------------------------------------------------------------------------
#[cfg(windows)]
mod imp {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    // Files, folders, and folder-background. %1 = clicked item, %V = open folder.
    const KEYS: [(&str, &str); 3] = [
        (r"Software\Classes\*\shell\Wyrmhole", "%1"),
        (r"Software\Classes\Directory\shell\Wyrmhole", "%1"),
        (
            r"Software\Classes\Directory\Background\shell\Wyrmhole",
            "%V",
        ),
    ];

    fn exe_path() -> Result<String, String> {
        Ok(std::env::current_exe()
            .map_err(|e| format!("Could not resolve executable path: {e}"))?
            .to_string_lossy()
            .into_owned())
    }

    pub fn is_enabled() -> Result<bool, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        Ok(hkcu.open_subkey(KEYS[0].0).is_ok())
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        if enabled { register() } else { unregister() }
    }

    fn register() -> Result<(), String> {
        let exe = exe_path()?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for (base, arg) in KEYS {
            let (key, _) = hkcu.create_subkey(base).map_err(|e| e.to_string())?;
            key.set_value("", &"Send via wyrmhole")
                .map_err(|e| e.to_string())?;
            key.set_value("Icon", &exe).map_err(|e| e.to_string())?;
            let (cmd, _) = hkcu
                .create_subkey(format!(r"{base}\command"))
                .map_err(|e| e.to_string())?;
            cmd.set_value("", &format!("\"{exe}\" \"{arg}\""))
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    fn unregister() -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for (base, _) in KEYS {
            match hkcu.delete_subkey_all(base) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Linux: per-user files for the major file managers under $XDG_DATA_HOME.
// ---------------------------------------------------------------------------
#[cfg(target_os = "linux")]
mod imp {
    use std::path::PathBuf;

    // Nautilus (GNOME) extension. The launch target is substituted in at write
    // time so it works for packaged installs and AppImages alike. Needs the
    // python3-nautilus package; harmless if absent.
    const NAUTILUS_PY: &str = r#"import gi
try:
    gi.require_version("Nautilus", "4.0")
except ValueError:
    gi.require_version("Nautilus", "3.0")
import subprocess
from gi.repository import GObject, Nautilus


class WyrmholeMenuProvider(GObject.GObject, Nautilus.MenuProvider):
    def _launch(self, _menu, files):
        paths = [f.get_location().get_path() for f in files]
        paths = [p for p in paths if p]
        if paths:
            subprocess.Popen(["__WYRMHOLE_EXE__", *paths])

    def get_file_items(self, *args):
        files = args[-1]
        if not files:
            return []
        item = Nautilus.MenuItem(
            name="WyrmholeMenuProvider::send",
            label="Send via wyrmhole",
            tip="Send the selected files/folders via wyrmhole",
        )
        item.connect("activate", self._launch, files)
        return [item]
"#;

    fn data_home() -> PathBuf {
        match std::env::var_os("XDG_DATA_HOME").filter(|s| !s.is_empty()) {
            Some(x) => PathBuf::from(x),
            None => std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_default()
                .join(".local/share"),
        }
    }

    fn exe_path() -> String {
        std::env::current_exe()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "wyrmhole".to_string())
    }

    // (path, contents) for each file manager's entry.
    fn targets() -> Vec<(PathBuf, String)> {
        let exe = exe_path();
        let data = data_home();

        let kde = format!(
            "[Desktop Entry]\n\
             Type=Service\n\
             ServiceTypes=KonqPopupMenu/Plugin\n\
             MimeType=all/all;\n\
             Actions=sendViaWyrmhole;\n\
             X-KDE-Priority=TopLevel\n\n\
             [Desktop Action sendViaWyrmhole]\n\
             Name=Send via wyrmhole\n\
             Icon=wyrmhole\n\
             Exec=\"{exe}\" %F\n"
        );
        let nemo = format!(
            "[Nemo Action]\n\
             Name=Send via wyrmhole\n\
             Comment=Send the selected files/folders via wyrmhole\n\
             Exec=\"{exe}\" %F\n\
             Icon-Name=wyrmhole\n\
             Selection=NotNone\n\
             Extensions=any;\n"
        );
        let nautilus = NAUTILUS_PY.replace("__WYRMHOLE_EXE__", &exe);

        vec![
            (data.join("kio/servicemenus/wyrmhole.desktop"), kde),
            (data.join("nemo/actions/wyrmhole.nemo_action"), nemo),
            (
                data.join("nautilus-python/extensions/wyrmhole-nautilus.py"),
                nautilus,
            ),
        ]
    }

    pub fn is_enabled() -> Result<bool, String> {
        Ok(targets().iter().any(|(path, _)| path.exists()))
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        for (path, contents) in targets() {
            if enabled {
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
                }
                std::fs::write(&path, contents)
                    .map_err(|e| format!("Failed to write {}: {e}", path.display()))?;
            } else {
                match std::fs::remove_file(&path) {
                    Ok(()) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => return Err(format!("Failed to remove {}: {e}", path.display())),
                }
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// macOS: Finder entries require an Automator Quick Action that can't be added
// programmatically without extra entitlements, so this is a guided manual step.
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
mod imp {
    pub fn is_enabled() -> Result<bool, String> {
        Ok(false)
    }

    pub fn set_enabled(_enabled: bool) -> Result<(), String> {
        Err(
            "On macOS, add this via Automator: Finder \u{2192} Quick Actions. \
             See the context-menu docs for the one-time setup."
                .to_string(),
        )
    }
}

// ---------------------------------------------------------------------------
// Any other target: not supported.
// ---------------------------------------------------------------------------
#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
mod imp {
    pub fn is_enabled() -> Result<bool, String> {
        Ok(false)
    }

    pub fn set_enabled(_enabled: bool) -> Result<(), String> {
        Err("Context-menu integration is not supported on this platform.".to_string())
    }
}
