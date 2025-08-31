import { invoke } from "@tauri-apps/api/core";
import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from "react";

export default function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [downloadDirectory, setDownloadDirectory] = useState<string>("");

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

    useEffect(() => {
      (async () => {
        const downloadPath = await get_download_directory();
        if (downloadPath) setDownloadDirectory(downloadPath);
      })();
    }, []);

  return (
    <div>
      {/* Settings Open Button */}
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" onClick={() => setIsOpen(true)} className="spin-on-hover cursor-pointer p-0.5 fill-black hover:fill-gray-500 active:fill-blue-500 transition-colors">
        <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/>
        <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/>
      </svg>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-gray-500/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-96 p-6">
            <div className="justify-between items-center flex mb-2">
              <p className="font-bold">Settings</p>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" onClick={() => setIsOpen(false)} className="cursor-pointer p-0.5 fill-black hover:fill-gray-500 active:fill-red-500 transition-colors">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
              </svg>
            </div>

            {/* Download directory field */}
            <div className="p-2 mb-2 rounded-lg cursor-pointer hover:bg-gray-200/70 group" onClick={(e) => {
                const selection = window.getSelection?.();
                if (!selection || selection.toString() === "") {
                  choose_download_directory();
                }
              }}>
              <label className="block font-medium text-xs select-none cursor-pointer mb-0.5 text-gray-600 group-hover:text-gray-950">Download Directory</label>
              <div className="flex-1 border rounded px-2 py-1 bg-gray-100 text-sm select-none">
                {downloadDirectory || "No directory set"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
