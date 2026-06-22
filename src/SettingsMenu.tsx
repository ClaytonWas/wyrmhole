import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { XIcon } from "./Icons";

// Loads a Tauri-backed value once on mount. Caller drives writes.
function useTauriValue<T>(getCmd: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    invoke<T>(getCmd)
      .then(setValue)
      .catch((e) => console.error(`Error getting ${getCmd}:`, e));
  }, [getCmd]);
  return [value, setValue] as const;
}

function saveTauri(setCmd: string, args: Record<string, unknown>) {
  invoke(setCmd, args).catch((e) => console.error(`Error saving ${setCmd}:`, e));
}

async function exportHistory(cmd: string, defaultPath: string, label: string) {
  try {
    const filePath = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath,
    });
    if (!filePath) return;
    await invoke(cmd, { filePath });
    toast.success(`${label} history exported`);
  } catch (e) {
    console.error(`Error exporting ${label}:`, e);
    toast.error(`Failed to export ${label} history`);
  }
}

const EXPORTS = [
  { label: "Received", cmd: "export_received_files_json", path: "received_files_export.json" },
  { label: "Sent", cmd: "export_sent_files_json", path: "sent_files_export.json" },
] as const;

export default function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [downloadDir, setDownloadDir] = useTauriValue<string>("get_download_path", "");
  const [autoExtract, setAutoExtract] = useTauriValue<boolean>("get_auto_extract_tarballs", false);
  const [minimizeOnStart, setMinimizeOnStart] = useTauriValue<boolean>(
    "get_minimize_on_start",
    false,
  );
  const [minimizeOnClose, setMinimizeOnClose] = useTauriValue<boolean>(
    "get_minimize_on_close",
    true,
  );
  const [autostart, setAutostart] = useTauriValue<boolean>("get_autostart", false);
  const [folderFormat, setFolderFormat] = useTauriValue<string>(
    "get_default_folder_name_format",
    "#-files-via-wyrmhole",
  );
  const [relayUrl, setRelayUrl] = useState("");

  useEffect(() => {
    invoke<string | null>("get_relay_server_url")
      .then((v) => setRelayUrl(v ?? ""))
      .catch((e) => console.error("Error getting relay URL:", e));
  }, []);

  // Refs so close handler reads latest edit without re-binding listeners per keystroke.
  const folderFormatRef = useRef(folderFormat);
  folderFormatRef.current = folderFormat;
  const relayUrlRef = useRef(relayUrl);
  relayUrlRef.current = relayUrl;

  const handleClose = () => {
    saveTauri("set_default_folder_name_format", { value: folderFormatRef.current });
    const trimmed = relayUrlRef.current.trim();
    saveTauri("set_relay_server_url", { value: trimmed.length > 0 ? trimmed : null });
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) handleClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  async function chooseDownloadDir() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    setDownloadDir(selected);
    saveTauri("set_download_directory", { newPath: selected });
  }

  function toggleAutoExtract() {
    const next = !autoExtract;
    setAutoExtract(next);
    saveTauri("set_auto_extract_tarballs", { value: next });
  }

  function toggleMinimizeOnStart() {
    const next = !minimizeOnStart;
    setMinimizeOnStart(next);
    saveTauri("set_minimize_on_start", { value: next });
  }

  function toggleMinimizeOnClose() {
    const next = !minimizeOnClose;
    setMinimizeOnClose(next);
    saveTauri("set_minimize_on_close", { value: next });
  }

  async function toggleAutostart() {
    const next = !autostart;
    setAutostart(next);
    try {
      await invoke("set_autostart", { value: next });
    } catch (e) {
      setAutostart(!next); // revert on failure
      console.error("Error setting autostart:", e);
      toast.error("Failed to update launch on startup");
    }
  }

  async function testRelay() {
    try {
      const msg = await invoke<string>("test_relay_server");
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e ?? "Failed to test relay"));
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => (isOpen ? handleClose() : setIsOpen(true))}
        className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
        title="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 16 16"
          className="fill-gray-600"
        >
          <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0" />
          <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-white/95 border border-gray-200 shadow-xl z-50 p-4 space-y-4"
          style={{ backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Settings</h2>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <XIcon className="w-4 h-4 fill-gray-500 hover:fill-gray-700" />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Download Location</label>
            <button
              onClick={chooseDownloadDir}
              className="w-full text-left px-3 py-2 bg-white hover:bg-blue-50/40 border border-gray-200 rounded-lg text-sm text-gray-900 truncate cursor-pointer transition-colors"
              title={downloadDir}
            >
              {downloadDir
                ? downloadDir.split(/[/\\]/).pop() || downloadDir
                : "Click to select folder..."}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="auto-extract" className="text-xs font-medium text-gray-700 block">
                Auto-Extract Archives
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5">Extract multi-file transfers</p>
            </div>
            <button
              id="auto-extract"
              onClick={toggleAutoExtract}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${autoExtract ? "bg-blue-500" : "bg-gray-300"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoExtract ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="autostart" className="text-xs font-medium text-gray-700 block">
                Launch on Startup
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5">Open wyrmhole when you log in</p>
            </div>
            <button
              id="autostart"
              onClick={toggleAutostart}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${autostart ? "bg-blue-500" : "bg-gray-300"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autostart ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="minimize-on-start"
                className="text-xs font-medium text-gray-700 block"
              >
                Minimize on Start
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5">Launch hidden in the system tray</p>
            </div>
            <button
              id="minimize-on-start"
              onClick={toggleMinimizeOnStart}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${minimizeOnStart ? "bg-blue-500" : "bg-gray-300"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${minimizeOnStart ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="minimize-on-close"
                className="text-xs font-medium text-gray-700 block"
              >
                Minimize on Close
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Closing hides to the tray instead of quitting
              </p>
            </div>
            <button
              id="minimize-on-close"
              onClick={toggleMinimizeOnClose}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${minimizeOnClose ? "bg-blue-500" : "bg-gray-300"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${minimizeOnClose ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="folder-format" className="text-xs font-medium text-gray-700 block">
              Folder Name Pattern
            </label>
            <input
              id="folder-format"
              type="text"
              value={folderFormat}
              onChange={(e) => setFolderFormat(e.target.value)}
              onBlur={() => saveTauri("set_default_folder_name_format", { value: folderFormat })}
              placeholder="#-files-via-wyrmhole"
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all"
            />
            <p className="text-[11px] text-gray-500">
              <code className="font-mono bg-gray-100 px-1 rounded">#</code> = file count
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="relay-url" className="text-xs font-medium text-gray-700 block">
              Custom Relay Server
            </label>
            <div className="flex gap-2">
              <input
                id="relay-url"
                type="text"
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                onBlur={() => {
                  const t = relayUrl.trim();
                  saveTauri("set_relay_server_url", { value: t.length > 0 ? t : null });
                }}
                placeholder="tcp:host:port"
                className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all"
              />
              <button
                type="button"
                onClick={testRelay}
                className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer flex-shrink-0"
              >
                Test
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700 block">Export History</label>
            <div className="grid grid-cols-2 gap-2">
              {EXPORTS.map((e) => (
                <button
                  key={e.cmd}
                  onClick={() => exportHistory(e.cmd, e.path, e.label)}
                  className="glass-primary-btn px-3 py-2 text-sm font-medium text-white rounded-lg transition-all cursor-pointer"
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
