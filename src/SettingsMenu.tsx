import { invoke } from "@tauri-apps/api/core";
import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [downloadDirectory, setDownloadDirectory] = useState<string>("");
  const [autoExtractTarballs, setAutoExtractTarballs] = useState<boolean>(false);
  const [defaultFolderNameFormat, setDefaultFolderNameFormat] = useState<string>("#-files-via-wyrmhole");

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

  async function export_received_files_json() {
    try {
      const filePath = await save({
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }],
        defaultPath: 'received_files_export.json'
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

  useEffect(() => {
    (async () => {
      const downloadPath = await get_download_directory();
      if (downloadPath) setDownloadDirectory(downloadPath);
      await get_auto_extract_tarballs();
      await get_default_folder_name_format();
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
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16" className="fill-gray-600 hover:fill-gray-800 transition-colors">
          <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/>
          <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/>
        </svg>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setIsOpen(false)}>
          <div className="bg-white rounded-lg sm:rounded-xl shadow-2xl w-full max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-2 sm:px-4 py-2 sm:py-3 rounded-t-lg sm:rounded-t-xl">
              <div className="flex justify-between items-center">
                <h2 className="text-sm sm:text-base xl:text-lg font-bold text-gray-800 select-none">Settings</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 sm:p-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
                  title="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 16 16" className="fill-gray-500 hover:fill-gray-700">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-2 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3">
              {/* Download directory field */}
              <div className="cursor-pointer group" onClick={() => {
                  const selection = window.getSelection?.();
                  if (!selection || selection.toString() === "") {
                    choose_download_directory();
                  }
                }}>
                <label className="block font-semibold text-[10px] sm:text-xs xl:text-sm select-none cursor-pointer mb-1 text-gray-700 group-hover:text-gray-900">Download Directory</label>
                <div className="flex-1 border-2 border-gray-300 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-50 text-[10px] sm:text-xs xl:text-sm select-none hover:border-blue-400 hover:bg-blue-50/30 transition-all group-hover:shadow-sm">
                  <p className="text-gray-700 truncate">{downloadDirectory || "No directory set"}</p>
                </div>
                <p className="text-[9px] sm:text-[10px] xl:text-xs text-gray-500 mt-0.5">Click to change download location</p>
              </div>

              {/* Auto-extract tarballs setting */}
              <div className="p-2 sm:p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition-all">
                <label className="block font-semibold text-[10px] sm:text-xs xl:text-sm select-none mb-1.5 sm:mb-2 text-gray-700">Auto-Extract Tarballs</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoExtractTarballs}
                    onChange={toggle_auto_extract_tarballs}
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] sm:text-xs xl:text-sm text-gray-600 select-none">
                    Automatically extract received tarballs (default: off)
                  </span>
                </div>
              </div>

              {/* Default folder name format setting */}
              <div className="p-2 sm:p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition-all">
                <label className="block font-semibold text-[10px] sm:text-xs xl:text-sm select-none mb-1 text-gray-700">Default Folder Name Format</label>
                <input
                  type="text"
                  value={defaultFolderNameFormat}
                  onChange={(e) => setDefaultFolderNameFormat(e.target.value)}
                  onBlur={save_default_folder_name_format}
                  placeholder="#-files-via-wyrmhole"
                  className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs xl:text-sm border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-all bg-white"
                />
                <p className="text-[9px] sm:text-[10px] xl:text-xs text-gray-500 select-none mt-1">
                  Use # as a placeholder for the number of files (e.g., "#-files-via-wyrmhole")
                </p>
              </div>

              {/* Export received files JSON button */}
              <div className="p-2 sm:p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition-all">
                <label className="block font-semibold text-[10px] sm:text-xs xl:text-sm select-none mb-1.5 sm:mb-2 text-gray-700">Received Files History</label>
                <button
                  onClick={export_received_files_json}
                  className="w-full px-2 sm:px-3 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[10px] sm:text-xs xl:text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/>
                  </svg>
                  <span>Export JSON History</span>
                </button>
                <p className="text-[9px] sm:text-[10px] xl:text-xs text-gray-500 select-none mt-1">
                  Export received files history as a JSON file
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
