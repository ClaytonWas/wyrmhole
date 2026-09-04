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
/// Returns a short human-readable summary for the Settings toast.
pub fn set_enabled(enabled: bool) -> Result<String, String> {
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

    pub fn set_enabled(enabled: bool) -> Result<String, String> {
        if enabled {
            register()?;
            Ok("Added to the File Explorer right-click menu.".to_string())
        } else {
            unregister()?;
            Ok("Removed from the File Explorer right-click menu.".to_string())
        }
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
// Linux: per-user files for every mainstream file manager, written under
// $XDG_DATA_HOME / $XDG_CONFIG_HOME. Nothing here needs root, and nothing
// outside the user's own directories is touched.
//
// Coverage (the two mechanisms overlap on purpose so at least one always hits):
//   * Scripts        - Nautilus/Nemo/Caja read executables out of their scripts
//                      directory with no extra packages. This is what makes the
//                      entry work on a stock Ubuntu install, under
//                      "Scripts -> Send via wyrmhole".
//   * Native actions - a top-level entry where the file manager supports one:
//                      Nemo actions, Thunar custom actions (uca.xml), KDE
//                      service menus (Dolphin), the freedesktop file-manager
//                      action spec (PCManFM/PCManFM-Qt), and the optional
//                      Nautilus/Caja Python extensions.
// ---------------------------------------------------------------------------
#[cfg(target_os = "linux")]
mod imp {
    use std::path::{Path, PathBuf};

    // Bundled app icon, copied into the user's hicolor theme so `Icon=wyrmhole`
    // resolves for AppImage users too (packaged installs ship it already).
    const ICON_PNG: &[u8] = include_bytes!("../icons/128x128.png");

    const MENU_LABEL: &str = "Send via wyrmhole";
    const MENU_TIP: &str = "Send the selected files/folders via wyrmhole";
    // Identifies our block inside the shared Thunar uca.xml so we only ever
    // rewrite or remove our own action, never the user's.
    const THUNAR_UID: &str = "wyrmhole-send-via-wyrmhole";

    fn env_dir(var: &str, fallback: &str) -> PathBuf {
        match std::env::var_os(var).filter(|s| !s.is_empty()) {
            Some(x) => PathBuf::from(x),
            None => home().join(fallback),
        }
    }

    fn home() -> PathBuf {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_default()
    }

    fn data_home() -> PathBuf {
        env_dir("XDG_DATA_HOME", ".local/share")
    }

    fn config_home() -> PathBuf {
        env_dir("XDG_CONFIG_HOME", ".config")
    }

    // What a menu entry should actually run. Inside an AppImage `current_exe`
    // points at a temporary mount that disappears on exit, so the AppImage file
    // itself ($APPIMAGE) is the only durable launch target.
    fn launch_target() -> Result<String, String> {
        if std::env::var_os("FLATPAK_ID").is_some() {
            return Err("Flatpak sandboxes can't add file-manager menu entries. \
                        Use the .deb, .rpm or AppImage build for right-click sending."
                .to_string());
        }
        if let Some(appimage) = std::env::var_os("APPIMAGE").filter(|s| !s.is_empty()) {
            return Ok(PathBuf::from(appimage).to_string_lossy().into_owned());
        }
        std::env::current_exe()
            .map(|p| p.to_string_lossy().into_owned())
            .map_err(|e| format!("Could not resolve the wyrmhole executable path: {e}"))
    }

    // ---- quoting helpers ---------------------------------------------------

    // POSIX single-quoted shell word.
    fn sh_quote(s: &str) -> String {
        format!("'{}'", s.replace('\'', r"'\''"))
    }

    // Double-quoted argument for a desktop-entry `Exec=` line, per the
    // freedesktop spec (backslash, quote, dollar and backtick are reserved).
    fn desktop_quote(s: &str) -> String {
        let escaped = s
            .replace('\\', r"\\")
            .replace('"', "\\\"")
            .replace('$', r"\$")
            .replace('`', r"\`");
        format!("\"{escaped}\"")
    }

    fn xml_escape(s: &str) -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    fn py_quote(s: &str) -> String {
        format!("\"{}\"", s.replace('\\', r"\\").replace('"', "\\\""))
    }

    // ---- entry templates ---------------------------------------------------

    // Executable dropped into the Nautilus/Nemo/Caja scripts directory. These
    // file managers export the selection through a newline-separated env var
    // (and also pass it as arguments), so read the var when it's set and fall
    // back to argv otherwise.
    fn script(exe: &str) -> String {
        format!(
            "#!/bin/sh\n\
             # \"{MENU_LABEL}\" - file-manager script (Nautilus / Nemo / Caja).\n\
             # Written by wyrmhole: Settings -> Right-Click \"{MENU_LABEL}\".\n\
             # Toggling that setting off deletes this file.\n\
             \n\
             selected=\"${{NAUTILUS_SCRIPT_SELECTED_FILE_PATHS:-\
             ${{NEMO_SCRIPT_SELECTED_FILE_PATHS:-\
             ${{CAJA_SCRIPT_SELECTED_FILE_PATHS:-}}}}}}\"\n\
             \n\
             if [ -n \"$selected\" ]; then\n\
             \tset -f\n\
             \tIFS='\n\
             '\n\
             \tset -- $selected\n\
             \tunset IFS\n\
             \tset +f\n\
             fi\n\
             \n\
             [ \"$#\" -eq 0 ] && exit 0\n\
             exec {exe} \"$@\"\n",
            exe = sh_quote(exe)
        )
    }

    // Optional top-level entry for Nautilus/Caja. Needs python3-nautilus /
    // python3-caja; harmless (simply ignored) when the package is absent, which
    // is why the scripts entry above exists as the always-works path.
    fn python_extension(namespace: &str, versions: &[&str], exe: &str) -> String {
        let versions = versions
            .iter()
            .map(|v| format!("\"{v}\""))
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            r#"# "{MENU_LABEL}" - {namespace} extension written by wyrmhole.
# Toggling Settings -> Right-Click "{MENU_LABEL}" off deletes this file.
import subprocess

import gi

for _version in ({versions},):
    try:
        gi.require_version("{namespace}", _version)
        break
    except ValueError:
        continue

from gi.repository import GObject, {namespace}  # noqa: E402

WYRMHOLE = {exe}


class WyrmholeMenuProvider(GObject.GObject, {namespace}.MenuProvider):
    def _launch(self, _menu, files):
        paths = [f.get_location().get_path() for f in files]
        paths = [p for p in paths if p]
        if paths:
            subprocess.Popen([WYRMHOLE, *paths])

    def _item(self, files):
        item = {namespace}.MenuItem(
            name="WyrmholeMenuProvider::send",
            label="{MENU_LABEL}",
            tip="{MENU_TIP}",
            icon="wyrmhole",
        )
        item.connect("activate", self._launch, files)
        return [item]

    # Nautilus 4 passes (files); Nautilus 3 and Caja pass (window, files).
    def get_file_items(self, *args):
        files = args[-1]
        return self._item(files) if files else []

    def get_background_items(self, *args):
        folder = args[-1]
        return self._item([folder]) if folder else []
"#,
            exe = py_quote(exe)
        )
    }

    // KDE service menu (Dolphin, Konqueror). Plasma >= 5.85 reads these from
    // kio/servicemenus and only loads them when the file carries the executable
    // bit. The pre-5.85 kservices5/ServiceMenus directory is deliberately not
    // written too: 5.85+ still scans it, so shipping both shows the entry twice.
    fn kde_service_menu(exe: &str) -> String {
        format!(
            "[Desktop Entry]\n\
             Type=Service\n\
             ServiceTypes=KonqPopupMenu/Plugin\n\
             # all/all covers files and folders alike; %F passes every selection.\n\
             MimeType=all/all;\n\
             Actions=sendViaWyrmhole;\n\
             X-KDE-Priority=TopLevel\n\
             \n\
             [Desktop Action sendViaWyrmhole]\n\
             Name={MENU_LABEL}\n\
             Icon=wyrmhole\n\
             Exec={exec} %F\n",
            exec = desktop_quote(exe)
        )
    }

    fn nemo_action(exe: &str) -> String {
        format!(
            "[Nemo Action]\n\
             Name={MENU_LABEL}\n\
             Comment={MENU_TIP}\n\
             Exec={exec} %F\n\
             Icon-Name=wyrmhole\n\
             Selection=NotNone\n\
             Extensions=any;\n\
             Quote=double\n",
            exec = desktop_quote(exe)
        )
    }

    // freedesktop "Desktop Entry Extension for File Manager Actions", read by
    // PCManFM, PCManFM-Qt and the *-actions plugins for Caja/Nautilus.
    fn file_manager_action(exe: &str) -> String {
        format!(
            "[Desktop Entry]\n\
             Type=Action\n\
             Name={MENU_LABEL}\n\
             Tooltip={MENU_TIP}\n\
             Icon=wyrmhole\n\
             Profiles=wyrmhole;\n\
             \n\
             [X-Action-Profile wyrmhole]\n\
             Name={MENU_LABEL}\n\
             MimeTypes=*/*;\n\
             Exec={exec} %F\n",
            exec = desktop_quote(exe)
        )
    }

    fn thunar_action(exe: &str) -> String {
        format!(
            "<action>\n\
             \t<icon>wyrmhole</icon>\n\
             \t<name>{label}</name>\n\
             \t<unique-id>{THUNAR_UID}</unique-id>\n\
             \t<command>{command} %F</command>\n\
             \t<description>{tip}</description>\n\
             \t<patterns>*</patterns>\n\
             \t<directories/>\n\
             \t<audio-files/>\n\
             \t<image-files/>\n\
             \t<other-files/>\n\
             \t<text-files/>\n\
             \t<video-files/>\n\
             </action>",
            label = xml_escape(MENU_LABEL),
            tip = xml_escape(MENU_TIP),
            command = xml_escape(&desktop_quote(exe)),
        )
    }

    // ---- target table ------------------------------------------------------

    struct Target {
        path: PathBuf,
        contents: Vec<u8>,
        executable: bool,
    }

    fn targets(exe: &str) -> Vec<Target> {
        let data = data_home();
        let config = config_home();

        let text = |path: PathBuf, contents: String, executable: bool| Target {
            path,
            contents: contents.into_bytes(),
            executable,
        };

        vec![
            // Always-works path on GNOME/MATE: no extra packages, and the file
            // managers pick it up without a restart. Nemo is deliberately not
            // in here - its built-in actions below already give it a top-level
            // entry, so a script would just duplicate it under Scripts.
            text(
                data.join("nautilus/scripts").join(MENU_LABEL),
                script(exe),
                true,
            ),
            text(
                config.join("caja/scripts").join(MENU_LABEL),
                script(exe),
                true,
            ),
            // Native top-level entries.
            text(
                data.join("nemo/actions/wyrmhole.nemo_action"),
                nemo_action(exe),
                false,
            ),
            text(
                data.join("kio/servicemenus/wyrmhole.desktop"),
                kde_service_menu(exe),
                true,
            ),
            text(
                data.join("file-manager/actions/wyrmhole.desktop"),
                file_manager_action(exe),
                false,
            ),
            // Optional, only active when the python bindings are installed.
            text(
                data.join("nautilus-python/extensions/wyrmhole-nautilus.py"),
                python_extension("Nautilus", &["4.0", "3.0"], exe),
                false,
            ),
            text(
                data.join("caja-python/extensions/wyrmhole-caja.py"),
                python_extension("Caja", &["2.0"], exe),
                false,
            ),
            Target {
                path: data.join("icons/hicolor/128x128/apps/wyrmhole.png"),
                contents: ICON_PNG.to_vec(),
                executable: false,
            },
        ]
    }

    fn thunar_uca_path() -> PathBuf {
        config_home().join("Thunar/uca.xml")
    }

    // ---- Thunar uca.xml merging -------------------------------------------
    //
    // Thunar keeps every custom action in one shared per-user file, so this
    // rewrites only the <action> block carrying our unique-id and leaves the
    // rest of the document byte-for-byte intact.

    fn strip_thunar_action(xml: &str) -> String {
        let mut out = String::with_capacity(xml.len());
        let mut rest = xml;
        while let Some(start) = rest.find("<action>") {
            let Some(end_rel) = rest[start..].find("</action>") else {
                break;
            };
            let end = start + end_rel + "</action>".len();
            if rest[start..end].contains(THUNAR_UID) {
                out.push_str(&rest[..start]);
                // Swallow the blank line the removed block leaves behind.
                let tail = rest[end..].strip_prefix('\n').unwrap_or(&rest[end..]);
                rest = tail;
            } else {
                out.push_str(&rest[..end]);
                rest = &rest[end..];
            }
        }
        out.push_str(rest);
        out
    }

    fn write_thunar_action(exe: &str) -> Result<(), String> {
        let path = thunar_uca_path();
        let existing = std::fs::read_to_string(&path).unwrap_or_default();
        let action = thunar_action(exe);

        let updated = if existing.trim().is_empty() {
            format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<actions>\n{action}\n</actions>\n")
        } else {
            let cleaned = strip_thunar_action(&existing);
            let Some(close) = cleaned.rfind("</actions>") else {
                // Not a shape we recognise - leave the user's file alone.
                return Ok(());
            };
            format!("{}{action}\n{}", &cleaned[..close], &cleaned[close..])
        };

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
        }
        std::fs::write(&path, updated)
            .map_err(|e| format!("Failed to write {}: {e}", path.display()))
    }

    fn remove_thunar_action() -> Result<(), String> {
        let path = thunar_uca_path();
        let Ok(existing) = std::fs::read_to_string(&path) else {
            return Ok(());
        };
        if !existing.contains(THUNAR_UID) {
            return Ok(());
        }
        std::fs::write(&path, strip_thunar_action(&existing))
            .map_err(|e| format!("Failed to update {}: {e}", path.display()))
    }

    fn thunar_action_present() -> bool {
        std::fs::read_to_string(thunar_uca_path())
            .map(|xml| xml.contains(THUNAR_UID))
            .unwrap_or(false)
    }

    // ---- summary -----------------------------------------------------------

    fn on_path(binary: &str) -> bool {
        let Some(path) = std::env::var_os("PATH") else {
            return false;
        };
        std::env::split_paths(&path).any(|dir| dir.join(binary).exists())
    }

    // Names the file managers actually installed, so the toast tells the user
    // where to look instead of listing every distro's file manager.
    fn detected_file_managers() -> Vec<&'static str> {
        [
            ("nautilus", "Files"),
            ("nemo", "Nemo"),
            ("caja", "Caja"),
            ("thunar", "Thunar"),
            ("dolphin", "Dolphin"),
            ("pcmanfm", "PCManFM"),
            ("pcmanfm-qt", "PCManFM-Qt"),
        ]
        .into_iter()
        .filter(|(bin, _)| on_path(bin))
        .map(|(_, name)| name)
        .collect()
    }

    fn summary() -> String {
        let found = detected_file_managers();
        let mut msg = if found.is_empty() {
            "Right-click entry installed for all supported file managers.".to_string()
        } else {
            format!("Right-click entry installed for {}.", found.join(", "))
        };
        if found.contains(&"Files") || found.contains(&"Caja") {
            msg.push_str(
                " In GNOME Files it appears under Scripts \u{2192} Send via wyrmhole \
                 (install python3-nautilus for a top-level entry).",
            );
        }
        msg
    }

    // ---- public API --------------------------------------------------------

    pub fn is_enabled() -> Result<bool, String> {
        let exe = launch_target().unwrap_or_default();
        Ok(targets(&exe).iter().any(|t| t.path.exists()) || thunar_action_present())
    }

    pub fn set_enabled(enabled: bool) -> Result<String, String> {
        // Without an absolute base every target path would be relative and the
        // entries would land in the working directory instead of the user's.
        if !data_home().is_absolute() || !config_home().is_absolute() {
            return Err("Could not locate your home directory ($HOME is not set).".to_string());
        }
        let exe = launch_target()?;

        for target in targets(&exe) {
            if enabled {
                write_target(&target)?;
            } else {
                remove_file(&target.path)?;
            }
        }

        if enabled {
            write_thunar_action(&exe)?;
            Ok(summary())
        } else {
            remove_thunar_action()?;
            Ok("Removed from your file manager's right-click menu.".to_string())
        }
    }

    fn write_target(target: &Target) -> Result<(), String> {
        if let Some(parent) = target.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
        }
        std::fs::write(&target.path, &target.contents)
            .map_err(|e| format!("Failed to write {}: {e}", target.path.display()))?;
        if target.executable {
            set_executable(&target.path)?;
        }
        Ok(())
    }

    fn set_executable(path: &Path) -> Result<(), String> {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path)
            .map_err(|e| format!("Failed to stat {}: {e}", path.display()))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms)
            .map_err(|e| format!("Failed to make {} executable: {e}", path.display()))
    }

    fn remove_file(path: &Path) -> Result<(), String> {
        match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Failed to remove {}: {e}", path.display())),
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn strips_only_our_thunar_action() {
            let xml = format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<actions>\n\
                 <action><name>Mine</name><unique-id>keep-me</unique-id></action>\n\
                 {}\n</actions>\n",
                thunar_action("/usr/bin/wyrmhole")
            );
            let stripped = strip_thunar_action(&xml);
            assert!(!stripped.contains(THUNAR_UID));
            assert!(stripped.contains("keep-me"));
            assert!(stripped.contains("</actions>"));
        }

        #[test]
        fn thunar_action_survives_paths_needing_escapes() {
            let action = thunar_action("/home/a b/we\"ird & co/wyrmhole");
            assert!(action.contains("&amp;"));
            assert!(!action.contains(" & "));
            assert!(action.contains("&quot;"));
        }

        #[test]
        fn script_quotes_the_launch_target() {
            let body = script("/home/it's here/wyrmhole");
            assert!(body.contains(r"'/home/it'\''s here/wyrmhole'"));
            assert!(body.starts_with("#!/bin/sh"));
        }

        #[test]
        fn desktop_exec_is_quoted() {
            assert_eq!(desktop_quote("/opt/a b/wyrmhole"), "\"/opt/a b/wyrmhole\"");
            assert_eq!(desktop_quote("/opt/$x"), "\"/opt/\\$x\"");
        }

        // The scripts entry is the path that works on a stock Ubuntu install,
        // so run the generated script for real and check the selection - spaces
        // and all - reaches the launch target as separate arguments.
        #[test]
        fn script_forwards_the_selection_as_arguments() {
            let dir =
                std::env::temp_dir().join(format!("wyrmhole-script-test-{}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();

            // Stands in for the wyrmhole binary: echoes back the argv it got.
            let echo_args = dir.join("echo args");
            std::fs::write(&echo_args, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n").unwrap();
            set_executable(&echo_args).unwrap();

            let entry = dir.join("send");
            std::fs::write(&entry, script(&echo_args.to_string_lossy())).unwrap();
            set_executable(&entry).unwrap();

            let run = |env: Option<&str>, args: &[&str]| {
                let mut cmd = std::process::Command::new(&entry);
                cmd.args(args);
                match env {
                    Some(v) => cmd.env("NAUTILUS_SCRIPT_SELECTED_FILE_PATHS", v),
                    None => cmd.env_remove("NAUTILUS_SCRIPT_SELECTED_FILE_PATHS"),
                };
                let out = cmd.output().unwrap();
                assert!(out.status.success());
                String::from_utf8(out.stdout).unwrap()
            };

            // Selection passed the way Nautilus/Nemo/Caja pass it.
            assert_eq!(
                run(Some("/home/u/a file.txt\n/home/u/some dir\n"), &[]),
                "/home/u/a file.txt\n/home/u/some dir\n"
            );
            // Globbing stays off, so a literal `*` is not expanded.
            assert_eq!(run(Some("/home/u/*.txt"), &[]), "/home/u/*.txt\n");
            // No env var set: fall back to whatever argv the menu supplied.
            assert_eq!(run(None, &["/home/u/x y"]), "/home/u/x y\n");
            // Nothing selected: exit quietly instead of launching the app.
            assert_eq!(run(None, &[]), "");

            std::fs::remove_dir_all(&dir).ok();
        }

        // Full install/uninstall round-trip. Ignored by default because it
        // writes into $HOME; run it against a throwaway one:
        //   HOME=$(mktemp -d) cargo test -- --ignored
        #[test]
        #[ignore = "writes into $HOME"]
        fn installs_then_fully_removes_every_entry() {
            let exe = launch_target().unwrap();

            assert!(!set_enabled(true).unwrap().is_empty());
            assert!(is_enabled().unwrap());
            for target in targets(&exe) {
                assert!(target.path.exists(), "missing {}", target.path.display());
                if target.executable {
                    use std::os::unix::fs::PermissionsExt;
                    let mode = std::fs::metadata(&target.path)
                        .unwrap()
                        .permissions()
                        .mode();
                    assert_eq!(
                        mode & 0o111,
                        0o111,
                        "{} is not executable",
                        target.path.display()
                    );
                }
            }
            assert!(thunar_action_present());

            // Re-enabling refreshes rather than duplicating the Thunar action.
            set_enabled(true).unwrap();
            let uca = std::fs::read_to_string(thunar_uca_path()).unwrap();
            assert_eq!(uca.matches(THUNAR_UID).count(), 1);

            set_enabled(false).unwrap();
            assert!(!is_enabled().unwrap());
            for target in targets(&exe) {
                assert!(
                    !target.path.exists(),
                    "left behind {}",
                    target.path.display()
                );
            }
            assert!(!thunar_action_present());
        }
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

    pub fn set_enabled(_enabled: bool) -> Result<String, String> {
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

    pub fn set_enabled(_enabled: bool) -> Result<String, String> {
        Err("Context-menu integration is not supported on this platform.".to_string())
    }
}
