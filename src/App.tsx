import { invoke } from "@tauri-apps/api/core";
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import ReceiveFileCard from "./RecieveFileCardComponent";
import ActiveDownloadCard from "./ActiveDownloadCard";
import ActiveSendCard from "./ActiveSendCard";
import PendingFileOfferCard from "./PendingFileOfferCard";
import SettingsMenu from "./SettingsMenu";
import { FileIcon } from "./FileIcon";
import "./App.css";

interface ReceivedFile {
  connection_type: string;
  download_time: string;
  download_url: string;
  file_extension: string;
  file_name: string;
  file_size: number;
  peer_address: string;
}

interface DownloadProgress {
  id: string;
  file_name: string;
  transferred: number;
  total: number;
  percentage: number;
  error?: string;
}

interface SendProgress {
  id: string;
  file_name: string;
  sent: number;
  total: number;
  percentage: number;
  error?: string;
  code?: string;
  status?: string;
}

interface PendingFileOffer {
  id: string;
  file_name: string;
  file_size?: number;
}

function App() {
  const [receiveCode, setReceiveCode] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[] | null>(null);
  const [folderName, setFolderName] = useState<string>("");
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(new Map());
  const [sendProgress, setSendProgress] = useState<Map<string, SendProgress>>(new Map());
  const [pendingFileOffers, setPendingFileOffers] = useState<Map<string, PendingFileOffer>>(new Map());
  const [defaultFolderNameFormat, setDefaultFolderNameFormat] = useState<string>("#-files-via-wyrmhole");

  async function deny_file_receive(id: string) {
    try {
      await invoke("receiving_file_deny", { id });
      console.log("Denied file:", id);
      // Remove from pending offers
      setPendingFileOffers(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      console.error("Error denying file:", error);
    }
  }

  async function accept_file_receive(id: string, file_name?: string) {
    try {
      // Remove from pending offers first
      setPendingFileOffers(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      // Initialize download progress
      setDownloadProgress(prev => {
        const next = new Map(prev);
        next.set(id, {
          id,
          file_name: file_name || "Unknown file",
          transferred: 0,
          total: 0,
          percentage: 0
        });
        return next;
      });

      await invoke("receiving_file_accept", { id });
      console.log("Accepted file:", id);
    } catch (error) {
      console.error("Error accepting file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to download ${file_name || "file"}`, { duration: 5000 });
      
      // Update download progress with error state
      setDownloadProgress(prev => {
        const next = new Map(prev);
        const existing = next.get(id);
        if (existing) {
          next.set(id, {
            ...existing,
            error: errorMessage
          });
        } else {
          next.set(id, {
            id,
            file_name: file_name || "Unknown file",
            transferred: 0,
            total: 0,
            percentage: 0,
            error: errorMessage
          });
        }
        return next;
      });
    }
  }

  async function select_files() {
    try {
      const selected = await open({ multiple: true });
      if (!selected) {
        setSelectedFiles(null);
        setFolderName("");
        return;
      }

      const files = Array.isArray(selected) ? selected : [selected];
      // Filter out non-strings for safety
      const stringFiles = files.filter(f => typeof f === "string") as string[];
      setSelectedFiles(stringFiles);
      setFolderName(""); // Clear folder name when selecting new files

    } catch (err) {
      console.error("Error selecting files:", err);
    }
  }


  async function send_files() {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const sendId = crypto.randomUUID();
    let displayName: string;
    
    if (selectedFiles.length === 1) {
      const filePath = selectedFiles[0];
      displayName = filePath.split(/[/\\]/).pop() || "Unknown file";
      
      // Initialize send progress with "preparing" status
      setSendProgress(prev => {
        const next = new Map(prev);
        next.set(sendId, {
          id: sendId,
          file_name: displayName,
          sent: 0,
          total: 0,
          percentage: 0,
          status: "preparing"
        });
        return next;
      });

      try {
        const response = await invoke("send_file_call", { filePath, sendId });
        console.log("Sent file:", response);
      } catch (err) {
        console.error("Error sending file:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to send ${displayName}`, { duration: 5000 });
        
        // Update send progress with error state
        setSendProgress(prev => {
          const next = new Map(prev);
          const existing = next.get(sendId);
          if (existing) {
            next.set(sendId, {
              ...existing,
              error: errorMessage
            });
          } else {
            next.set(sendId, {
              id: sendId,
              file_name: displayName,
              sent: 0,
              total: 0,
              percentage: 0,
              error: errorMessage
            });
          }
          return next;
        });
      }
    } else {
      // Multiple files/folders - create tarball and send
      // Don't set an initial name - let the backend emit it immediately via progress event
      // This ensures we show the correct name (custom, folder name, or default format) from the start
      
      // Initialize send progress with a temporary placeholder that will be updated immediately
      setSendProgress(prev => {
        const next = new Map(prev);
        next.set(sendId, {
          id: sendId,
          file_name: "Preparing...", // Temporary placeholder, backend will update immediately
          sent: 0,
          total: 0,
          percentage: 0
        });
        return next;
      });

      try {
        const response = await invoke("send_multiple_files_call", { 
          filePaths: selectedFiles, 
          sendId,
          folderName: folderName.trim() || null
        });
        console.log("Sent files:", response);
        // Clear folder name after sending
        setFolderName("");
      } catch (err) {
        console.error("Error sending files:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to send ${selectedFiles.length} files`, { duration: 5000 });
        
        // Update send progress with error state
        setSendProgress(prev => {
          const next = new Map(prev);
          const existing = next.get(sendId);
          if (existing) {
            next.set(sendId, {
              ...existing,
              error: errorMessage
            });
          } else {
            next.set(sendId, {
              id: sendId,
              file_name: displayName,
              sent: 0,
              total: 0,
              percentage: 0,
              error: errorMessage
            });
          }
          return next;
        });
      }
    }
  }

  async function request_file() {
    try {
      const response = await invoke("request_file_call", { receiveCode });
      const data = JSON.parse(response as string);

      if (!data || !data.id || !data.file_name) {
        toast.error("Invalid file offer from backend.");
        return;
      }

      // Add to pending file offers instead of showing toast
      setPendingFileOffers(prev => {
        const next = new Map(prev);
        next.set(data.id, {
          id: data.id,
          file_name: data.file_name,
          file_size: data.file_size
        });
        return next;
      });

      // Clear the receive code input
      setReceiveCode("");
    } catch (e) {
      toast.error("Failed to parse backend response.");
      console.error("Request file error:", e);
    }
  }

  async function recieved_files_data() {
    try {
      const response = await invoke("received_files_data");
      if (Array.isArray(response)) setReceivedFiles(response as ReceivedFile[]);
      else setReceivedFiles([]);
    } catch (error) {
      console.error("Error getting received files data:", error);
    }
  }

  function remove_file_at_index(idx: number) {
    setSelectedFiles(prev => {
      if (!prev) return null;
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : null;
    });
  }

  async function get_default_folder_name_format() {
    try {
      const value = await invoke<string>("get_default_folder_name_format");
      setDefaultFolderNameFormat(value);
    } catch (error) {
      console.error("Error getting default folder name format:", error);
    }
  }

  useEffect(() => {
    recieved_files_data();
    get_default_folder_name_format();
  }, []);

  useEffect(() => {
    console.log("Listening for default-folder-name-format-updated event");

    const unlistenPromise = listen("default-folder-name-format-updated", (event) => {
      const payload = event.payload as { value: string };
      console.log("Default folder name format updated:", payload.value);
      setDefaultFolderNameFormat(payload.value);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    console.log("Listening for connection-code event");

    const unlistenPromise = listen("connection-code", (event) => {
      const payload = event.payload as { status: string, code?: string, message?: string, send_id?: string };
      if (payload.status === "success" && payload.send_id) {
        // Update send progress with connection code
        setSendProgress(prev => {
          const next = new Map(prev);
          const existing = next.get(payload.send_id!);
          if (existing) {
            next.set(payload.send_id!, {
              ...existing,
              code: payload.code
            });
          }
          return next;
        });
        
        // Show toast with connection code (click to copy)
        toast(
          (t) => (
            <div
              className="flex items-center justify-between gap-2"
              onClick={() => {
                navigator.clipboard.writeText(payload.code ?? "");
                toast.success("Code copied to clipboard", { id: t.id });
              }}
            >
              <span>📨 Connection code: {payload.code}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(t.id);
                }}
                className="cursor-pointer px-4 py-2 font-bold text-gray-900 hover:text-red-500 active:text-red-700"
              >
                ✕
              </button>
            </div>
          ),
          { duration: 5000 }
        );
      } else if (payload.status === "success") {
        // Legacy toast for non-send connections
        toast(
          (t) => (
            <div
              className="flex items-center justify-between gap-2"
              onClick={() => {
                navigator.clipboard.writeText(payload.code ?? "");
              }}
            >
              <span>📨 Connection code: {payload.code}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(t.id);
                }}
                className="cursor-pointer px-4 py-2 font-bold text-gray-900 hover:text-red-500 active:text-red-700"
              >
                ✕
              </button>
            </div>
          ),
          { duration: Infinity }
        );
      } else {
        toast.error(payload.message ?? "Unknown error in mailbox creation");
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    console.log("Listening for download-progress event");

    const unlistenPromise = listen("download-progress", (event) => {
      const payload = event.payload as DownloadProgress;
      
      // Update download progress
      setDownloadProgress(prev => {
        const next = new Map(prev);
        next.set(payload.id, payload);
        return next;
      });
      
      // Check if download is complete
      if (payload.percentage >= 100) {
        setTimeout(() => {
          toast.success(`Downloaded ${payload.file_name}`, { duration: 5000 });
          recieved_files_data();
          setDownloadProgress(prev => {
            const next = new Map(prev);
            next.delete(payload.id);
            return next;
          });
        }, 500);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    console.log("Listening for download-error event");

    const unlistenPromise = listen("download-error", (event) => {
      const payload = event.payload as { id: string; file_name: string; error: string };
      
      // If cancelled by user, remove it immediately instead of showing error
      if (payload.error === "Transfer cancelled by user") {
        setDownloadProgress(prev => {
          const next = new Map(prev);
          next.delete(payload.id);
          return next;
        });
        return;
      }
      
      // For other errors, update download progress with error state
      setDownloadProgress(prev => {
        const next = new Map(prev);
        const existing = next.get(payload.id);
        if (existing) {
          next.set(payload.id, {
            ...existing,
            error: payload.error
          });
        } else {
          // If download wasn't tracked yet, add it with error
          next.set(payload.id, {
            id: payload.id,
            file_name: payload.file_name,
            transferred: 0,
            total: 0,
            percentage: 0,
            error: payload.error
          });
        }
        return next;
      });

      toast.error(`Download failed: ${payload.file_name}`, { duration: 5000 });
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    console.log("Listening for send-progress event");

    const unlistenPromise = listen("send-progress", (event) => {
      const payload = event.payload as SendProgress;
      console.log("Received send-progress event:", payload);
      
      // Update send progress (includes code from backend)
      setSendProgress(prev => {
        const next = new Map(prev);
        next.set(payload.id, payload);
        return next;
      });
      
      // Check if send is complete
      if (payload.percentage >= 100) {
        setTimeout(() => {
          toast.success(`Sent ${payload.file_name}`, { duration: 5000 });
          setSendProgress(prev => {
            const next = new Map(prev);
            next.delete(payload.id);
            return next;
          });
        }, 500);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    console.log("Listening for send-error event");

    const unlistenPromise = listen("send-error", (event) => {
      const payload = event.payload as { id: string; file_name: string; error: string };
      
      // Update send progress with error state
      setSendProgress(prev => {
        const next = new Map(prev);
        const existing = next.get(payload.id);
        if (existing) {
          next.set(payload.id, {
            ...existing,
            error: payload.error
          });
        } else {
          // If send wasn't tracked yet, add it with error
          next.set(payload.id, {
            id: payload.id,
            file_name: payload.file_name,
            sent: 0,
            total: 0,
            percentage: 0,
            error: payload.error
          });
        }
        return next;
      });

      toast.error(`Send failed: ${payload.file_name}`, { duration: 5000 });
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <div className="app-container min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      <Toaster position="bottom-right" reverseOrder={false} />

      <nav className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="px-3 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <h1 className="text-lg sm:text-2xl font-bold flex items-center select-none gap-1 sm:gap-2 text-gray-800">
            <span className="spin-on-hover cursor-pointer text-lg sm:text-2xl flex items-center">🌀</span> 
            <span className="gradient-shimmer flex items-center">wyrmhole</span>
          </h1>
          <SettingsMenu />
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4 select-none">
        {/* Active Transfers Section - Always Visible */}
        <div className="mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-base font-semibold text-gray-800 mb-2 select-none cursor-default">Active Transfers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
            {/* Active Sends */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden h-[140px] flex flex-col">
              <div className="px-2 sm:px-3 py-1.5 bg-blue-50 border-b border-gray-200 flex-shrink-0">
                <p className="text-[10px] sm:text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  Sending {sendProgress.size > 0 && `(${sendProgress.size})`}
                </p>
              </div>
              <div 
                className="flex-1 overflow-y-auto"
                style={{ scrollbarWidth: "thin" }}
                onWheel={(e) => {
                  const target = e.currentTarget;
                  const isAtTop = target.scrollTop === 0;
                  const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
                  if ((!isAtTop && e.deltaY < 0) || (!isAtBottom && e.deltaY > 0)) {
                    e.stopPropagation();
                  }
                }}
              >
                {sendProgress.size > 0 ? (
                  Array.from(sendProgress.values()).map((progress) => (
                    <ActiveSendCard 
                      key={progress.id} 
                      {...progress} 
                      onDismiss={(id) => {
                        setSendProgress(prev => {
                          const next = new Map(prev);
                          next.delete(id);
                          return next;
                        });
                      }}
                    />
                  ))
                ) : (
                  <div className="p-3 text-center text-xs text-gray-400">No active sends</div>
                )}
              </div>
            </div>
            
            {/* Active Downloads */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden h-[140px] flex flex-col">
              <div className="px-2 sm:px-3 py-1.5 bg-green-50 border-b border-gray-200 flex-shrink-0">
                <p className="text-[10px] sm:text-xs font-semibold text-green-700 uppercase tracking-wide">
                  Receiving {downloadProgress.size > 0 && `(${downloadProgress.size})`}
                </p>
              </div>
              <div 
                className="flex-1 overflow-y-auto"
                style={{ scrollbarWidth: "thin" }}
                onWheel={(e) => {
                  const target = e.currentTarget;
                  const isAtTop = target.scrollTop === 0;
                  const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
                  if ((!isAtTop && e.deltaY < 0) || (!isAtBottom && e.deltaY > 0)) {
                    e.stopPropagation();
                  }
                }}
              >
                {downloadProgress.size > 0 ? (
                  Array.from(downloadProgress.values()).map((progress) => (
                    <ActiveDownloadCard 
                      key={progress.id} 
                      {...progress} 
                      onDismiss={(id) => {
                        setDownloadProgress(prev => {
                          const next = new Map(prev);
                          next.delete(id);
                          return next;
                        });
                      }}
                    />
                  ))
                ) : (
                  <div className="p-3 text-center text-xs text-gray-400">No active downloads</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions Section - Fixed Height */}
        <div className="mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-base font-semibold text-gray-800 mb-2 select-none cursor-default">Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
            {/* Send Files Section - Fixed Height */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden min-h-[200px] md:max-h-[240px] flex flex-col">
              <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-700 flex-shrink-0">Send Files</h3>
                  {selectedFiles && selectedFiles.length > 1 && (
                    <input
                      type="text"
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      placeholder={`Folder Name: ${(defaultFolderNameFormat.trim() || "#-files-via-wyrmhole").replace("#", selectedFiles.length.toString())}`}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      title="Custom name for the folder when sending multiple files. Leave empty to use the default format."
                    />
                  )}
                  {selectedFiles && (
                    <button 
                      onClick={send_files} 
                      className="font-medium flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors cursor-pointer flex-shrink-0"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                      </svg>
                      <span>Send</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 flex flex-col p-3 min-h-0">
                {!selectedFiles ? (
                  <label 
                    htmlFor="File" 
                    className="flex-1 flex flex-col items-center justify-center cursor-pointer border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-200 rounded-lg"
                    onClick={select_files}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 text-gray-400 mb-1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m0-3-3-3m0 0-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75"/>
                    </svg>
                    <span className="text-xs text-gray-600">Click to select files</span>
                  </label>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                      <span className="text-xs font-medium text-gray-700">
                        {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFiles(null);
                          setFolderName("");
                        }}
                        className="text-[10px] text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
                        title="Clear"
                      >
                        Clear
                      </button>
                    </div>
                    <div 
                      className="flex-1 overflow-y-auto pr-1 min-h-0" 
                      style={{ scrollbarWidth: "thin" }}
                      onWheel={(e) => {
                        const target = e.currentTarget;
                        const isAtTop = target.scrollTop === 0;
                        const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
                        if ((!isAtTop && e.deltaY < 0) || (!isAtBottom && e.deltaY > 0)) {
                          e.stopPropagation();
                        }
                      }}
                    >
                      {selectedFiles.length === 1 ? (
                        <div className="group flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
                          <FileIcon fileName={selectedFiles[0].split(/[/\\]/).pop() || "Unknown"} className="w-4 h-4 flex-shrink-0" />
                          <p className="text-xs font-medium text-gray-900 truncate flex-1">
                            {selectedFiles[0].split(/[/\\]/).pop() || "Unknown"}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              remove_file_at_index(0);
                            }}
                            className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                            title="Remove"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className="w-4 h-4 fill-gray-400 hover:fill-red-600">
                              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {selectedFiles.map((file, idx) => {
                            const name = typeof file === "string" ? file.split(/[/\\]/).pop() || "Unknown" : "Unknown";
                            return (
                              <div key={idx} className="group flex items-center gap-2 p-1.5 bg-gray-50 rounded border border-gray-200">
                                <FileIcon fileName={name} className="w-3.5 h-3.5 flex-shrink-0" />
                                <p className="text-[11px] font-medium text-gray-900 truncate flex-1">{name}</p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    remove_file_at_index(idx);
                                  }}
                                  className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                                  title="Remove"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className="w-4 h-4 fill-gray-400 hover:fill-red-600">
                                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
                                  </svg>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Receive Files Section - Compact */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden min-h-[200px] md:max-h-[240px] flex flex-col">
              <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
                <form onSubmit={(e) => { e.preventDefault(); request_file(); }} className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-700 flex-shrink-0">Receive Files</h3>
                  <input 
                    value={receiveCode} 
                    onChange={(e) => setReceiveCode(e.target.value)} 
                    placeholder="Enter code: ex. 7-helpful-tiger" 
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title="Enter the connection code provided by the sender. The code format is typically numbers and words separated by hyphens, like '7-helpful-tiger'."
                  />
                  <button 
                    type="submit" 
                    className="font-medium flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors cursor-pointer flex-shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    <span>Receive</span>
                  </button>
                </form>
              </div>
              <div className="flex-1 flex flex-col p-3 min-h-0">
                {/* Pending File Offers */}
                {pendingFileOffers.size > 0 ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="text-[10px] sm:text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2 flex-shrink-0">
                      Pending Offers ({pendingFileOffers.size})
                    </div>
                    <div 
                      className="flex-1 overflow-y-auto min-h-0" 
                      style={{ scrollbarWidth: "thin" }}
                      onWheel={(e) => {
                        const target = e.currentTarget;
                        const isAtTop = target.scrollTop === 0;
                        const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
                        if ((!isAtTop && e.deltaY < 0) || (!isAtBottom && e.deltaY > 0)) {
                          e.stopPropagation();
                        }
                      }}
                    >
                      {Array.from(pendingFileOffers.values()).map((offer) => (
                        <PendingFileOfferCard 
                          key={offer.id} 
                          {...offer} 
                          onAccept={(id) => {
                            const offer = pendingFileOffers.get(id);
                            if (offer) {
                              accept_file_receive(id, offer.file_name);
                            }
                          }}
                          onDeny={(id) => {
                            deny_file_receive(id);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
                    No pending offers
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* File History Section */}
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-gray-800 mb-2 select-none cursor-default">File History</h2>
          <div className="border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr] select-none border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold text-gray-600 uppercase tracking-wide flex-shrink-0">
              <div className="truncate">Filename</div>
              <div className="truncate">Extension</div>
              <div className="truncate">Size</div>
            </div>
            <div 
              className="max-h-48 sm:max-h-64 overflow-y-auto"
              style={{ scrollbarWidth: "thin" }}
              onWheel={(e) => {
                const target = e.currentTarget;
                const isAtTop = target.scrollTop === 0;
                const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
                if ((!isAtTop && e.deltaY < 0) || (!isAtBottom && e.deltaY > 0)) {
                  e.stopPropagation();
                }
              }}
            >
              <div className="divide-y divide-gray-100">
                {(receivedFiles.slice().reverse()).map((file, idx) => (
                  <ReceiveFileCard key={idx} {...file} />
                ))}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

export default App;
