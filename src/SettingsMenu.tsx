import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

export default function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [downloadDirectory, setDownloadDirectory] = useState<string>("");
  const [autoExtractTarballs, setAutoExtractTarballs] = useState<boolean>(false);
  const [defaultFolderNameFormat, setDefaultFolderNameFormat] =
    useState<string>("#-files-via-wyrmhole");
  const [relayServerUrl, setRelayServerUrl] = useState<string>("");

  async function choose_download_directory() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setDownloadDirectory(selected);
      await invoke("set_download_directory", { newPath: selected });
    }
  }

  async function get_download_directory() {
    try {
      const path = await invoke<string>("get_download_path");
      setDownloadDirectory(path);
    } catch (error) {
      console.error("Error getting directory:", error);
      return "";
    }
  }

  async function get_auto_extract_tarballs() {
    try {
      const value = await invoke<boolean>("get_auto_extract_tarballs");
      setAutoExtractTarballs(value);
    } catch (error) {
      console.error("Error getting auto-extract setting:", error);
    }
  }

  async function toggle_auto_extract_tarballs() {
    try {
      const newValue = !autoExtractTarballs;
      await invoke("set_auto_extract_tarballs", { value: newValue });
      setAutoExtractTarballs(newValue);
    } catch (error) {
      console.error("Error setting auto-extract:", error);
    }
  }

  async function get_default_folder_name_format() {
    try {
      const value = await invoke<string>("get_default_folder_name_format");
      setDefaultFolderNameFormat(value);
    } catch (error) {
      console.error("Error getting default folder name format:", error);
    }
  }

  async function save_default_folder_name_format() {
    try {
      await invoke("set_default_folder_name_format", { value: defaultFolderNameFormat });
    } catch (error) {
      console.error("Error setting default folder name format:", error);
    }
  }

  async function get_relay_server_url() {
    try {
      const value = await invoke<string | null>("get_relay_server_url");
      setRelayServerUrl(value ?? "");
    } catch (error) {
      console.error("Error getting relay server URL:", error);
    }
  }

  async function save_relay_server_url() {
    try {
      const trimmed = relayServerUrl.trim();
      await invoke("set_relay_server_url", {
        value: trimmed.length > 0 ? trimmed : null,
      });
    } catch (error) {
      console.error("Error setting relay server URL:", error);
    }
  }

  async function test_relay() {
    try {
      const message = await invoke<string>("test_relay_server");
      toast.success(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "Failed to test relay");
      console.error("Error testing relay server:", error);
      toast.error(message);
    }
  }

  async function export_received_files_json() {
    try {
      const filePath = await save({
        filters: [
          {
            name: "JSON",
            extensions: ["json"],
          },
        ],
        defaultPath: "received_files_export.json",
      });

      if (filePath) {
        await invoke("export_received_files_json", { filePath });
        toast.success("Received files history exported successfully");
      }
    } catch (error) {
      console.error("Error exporting received files JSON:", error);
      toast.error("Failed to export received files history");
    }
  }

  async function export_sent_files_json() {
    try {
      const filePath = await save({
        filters: [
          {
            name: "JSON",
            extensions: ["json"],
          },
        ],
        defaultPath: "sent_files_export.json",
      });

      if (filePath) {
        await invoke("export_sent_files_json", { filePath });
        toast.success("Sent files history exported successfully");
      }
    } catch (error) {
      console.error("Error exporting sent files JSON:", error);
      toast.error("Failed to export sent files history");
    }
  }

  useEffect(() => {
    (async () => {
      const downloadPath = await get_download_directory();
      if (downloadPath) setDownloadDirectory(downloadPath);
      await get_auto_extract_tarballs();
      await get_default_folder_name_format();
      await get_relay_server_url();
    })();
  }, []);

  return (
    <div>
      {/* Settings Open Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-3 sm:p-3.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
        title="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 16 16"
          className="fill-gray-600 hover:fill-gray-800 transition-colors"
        >
          <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0" />
          <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z" />
        </svg>
      </button>

      {/* Modal */}
      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9999] p-3 sm:p-4"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto bg-white/95 border border-gray-200 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 border-b border-gray-100 px-3 sm:px-4 py-2.5 sm:py-3 bg-white/95 rounded-t-2xl">
                <div className="flex justify-between items-center gap-2">
                  <h2 className="text-sm sm:text-base font-semibold text-gray-900 select-none">
                    Settings
                  </h2>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 16 16"
                      className="fill-gray-500 hover:fill-gray-700"
                    >
                      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Settings Content */}
              <div className="px-3 sm:px-4 py-3 sm:py-4 space-y-4">
                {/* Transfer Settings Section */}
                <div className="bg-gray-50 rounded-2xl p-5 space-y-5 border border-gray-300 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 tracking-tight">Transfer</h3>

                  {/* Download directory field */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-900">Download Location</label>
                    <button
                      onClick={() => {
                        const selection = window.getSelection?.();
                        if (!selection || selection.toString() === "") {
                          choose_download_directory();
                        }
                      }}
                      className="w-full text-left px-4 py-3 bg-white hover:bg-blue-50/30 border border-gray-200 rounded-lg transition-all text-sm text-gray-900 truncate cursor-pointer group active:scale-[0.98]"
                    >
                      <p className="truncate font-medium">
                        {downloadDirectory
                          ? downloadDirectory.split("/").pop() || downloadDirectory
                          : "Click to select folder..."}
                      </p>
                    </button>
                  </div>

                  {/* Auto-extract tarballs setting */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <label
                          htmlFor="auto-extract"
                          className="text-sm font-medium text-gray-900 block"
                        >
                          Auto-Extract Archives
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          Automatically extract multi-file transfers
                        </p>
                      </div>
                      <button
                        onClick={toggle_auto_extract_tarballs}
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors cursor-pointer ${autoExtractTarballs ? "bg-blue-500" : "bg-gray-300"}`}
                        style={
                          autoExtractTarballs
                            ? {
                                background: "rgba(59, 130, 246, 0.9)",
                                boxShadow:
                                  "0 2px 8px 0 rgba(59, 130, 246, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                              }
                            : undefined
                        }
                        id="auto-extract"
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${autoExtractTarballs ? "translate-x-4" : "translate-x-0.5"}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Default folder name format setting */}
                  <div className="space-y-2">
                    <label
                      htmlFor="folder-format"
                      className="text-sm font-medium text-gray-900 block"
                    >
                      Folder Name Pattern
                    </label>
                    <input
                      id="folder-format"
                      type="text"
                      value={defaultFolderNameFormat}
                      onChange={(e) => setDefaultFolderNameFormat(e.target.value)}
                      onBlur={save_default_folder_name_format}
                      placeholder="#-files-via-wyrmhole"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all"
                    />
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Use{" "}
                      <code className="font-mono text-[11px] text-gray-700 bg-gray-100 px-2 py-1 rounded">
                        #
                      </code>{" "}
                      for file count. Example:{" "}
                      <code className="font-mono text-[11px] text-gray-700">#-photos</code>
                    </p>
                  </div>
                </div>

                {/* Advanced Section - Collapsible Card */}
                <div className="bg-gray-50 rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                    className="w-full p-5 hover:bg-gray-100/50 transition-colors text-left active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 tracking-tight">
                        Advanced
                      </h3>
                      <svg
                        className={`w-5 h-5 text-gray-600 transition-transform duration-300 ${
                          isAdvancedOpen ? "rotate-180" : ""
                        }`}
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </button>

                  {/* Advanced Content */}
                  {isAdvancedOpen && (
                    <div className="border-t border-gray-200 px-5 pt-5 pb-5 space-y-5">
                      {/* Relay server URL setting */}
                      <div className="space-y-2">
                        <label
                          htmlFor="relay-url"
                          className="text-sm font-medium text-gray-900 block"
                        >
                          Custom Relay Server
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="relay-url"
                            type="text"
                            value={relayServerUrl}
                            onChange={(e) => setRelayServerUrl(e.target.value)}
                            onBlur={save_relay_server_url}
                            placeholder="tcp:host:port"
                            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all"
                          />
                          <button
                            type="button"
                            onClick={test_relay}
                            className="px-4 py-3 text-sm font-medium text-blue-600 hover:text-blue-700 rounded-lg transition-colors active:scale-[0.98] cursor-pointer"
                          >
                            Test
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          Leave blank to use default relay
                        </p>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-gray-200" />

                      {/* Data Management Section */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-900">Export History</h4>
                        <p className="text-xs text-gray-500 mb-3">
                          Backup your transfer history as JSON files
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={export_received_files_json}
                            className="px-4 py-3 text-sm font-medium text-white rounded-lg transition-all active:scale-[0.98] duration-100 cursor-pointer"
                            style={{
                              background: "rgba(59, 130, 246, 0.9)",
                              backdropFilter: "blur(4px)",
                              WebkitBackdropFilter: "blur(4px)",
                              border: "1px solid rgba(255, 255, 255, 0.3)",
                              boxShadow:
                                "0 2px 8px 0 rgba(59, 130, 246, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(59, 130, 246, 1)";
                              e.currentTarget.style.boxShadow =
                                "0 4px 16px 0 rgba(59, 130, 246, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(59, 130, 246, 0.9)";
                              e.currentTarget.style.boxShadow =
                                "0 2px 8px 0 rgba(59, 130, 246, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)";
                            }}
                          >
                            <span className="flex items-center justify-center gap-1.5">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                className="flex-shrink-0"
                              >
                                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
                                <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z" />
                              </svg>
                              Received
                            </span>
                          </button>
                          <button
                            onClick={export_sent_files_json}
                            className="px-4 py-3 text-sm font-medium text-white rounded-lg transition-all active:scale-[0.98] duration-100 cursor-pointer"
                            style={{
                              background: "rgba(59, 130, 246, 0.9)",
                              backdropFilter: "blur(4px)",
                              WebkitBackdropFilter: "blur(4px)",
                              border: "1px solid rgba(255, 255, 255, 0.3)",
                              boxShadow:
                                "0 2px 8px 0 rgba(59, 130, 246, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(59, 130, 246, 1)";
                              e.currentTarget.style.boxShadow =
                                "0 4px 16px 0 rgba(59, 130, 246, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(59, 130, 246, 0.9)";
                              e.currentTarget.style.boxShadow =
                                "0 2px 8px 0 rgba(59, 130, 246, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)";
                            }}
                          >
                            <span className="flex items-center justify-center gap-1.5">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                className="flex-shrink-0"
                              >
                                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
                                <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z" />
                              </svg>
                              Sent
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
