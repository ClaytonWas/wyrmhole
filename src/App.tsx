import { invoke } from "@tauri-apps/api/core";
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import ReceiveFileCard from "./RecieveFileCardComponent";
import ActiveDownloadCard from "./ActiveDownloadCard";
import ActiveSendCard from "./ActiveSendCard";
import SettingsMenu from "./SettingsMenu";
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
}

function App() {
  const [receiveCode, setReceiveCode] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[] | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(new Map());
  const [sendProgress, setSendProgress] = useState<Map<string, SendProgress>>(new Map());

  async function deny_file_receive(id: string) {
    try {
      await invoke("receiving_file_deny", { id });
      console.log("Denied file:", id);
    } catch (error) {
      console.error("Error denying file:", error);
    }
  }

  async function accept_file_receive(id: string, file_name?: string) {
    try {
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
        return;
      }

      const files = Array.isArray(selected) ? selected : [selected];
      // Filter out non-strings for safety
      const stringFiles = files.filter(f => typeof f === "string") as string[];
      setSelectedFiles(stringFiles);

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
      
      // Initialize send progress
      setSendProgress(prev => {
        const next = new Map(prev);
        next.set(sendId, {
          id: sendId,
          file_name: displayName,
          sent: 0,
          total: 0,
          percentage: 0
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
      // Multiple files - create tarball and send
      displayName = `${selectedFiles.length}_files.tar.gz`;
      
      // Initialize send progress
      setSendProgress(prev => {
        const next = new Map(prev);
        next.set(sendId, {
          id: sendId,
          file_name: displayName,
          sent: 0,
          total: 0,
          percentage: 0
        });
        return next;
      });

      try {
        const response = await invoke("send_multiple_files_call", { 
          filePaths: selectedFiles, 
          sendId 
        });
        console.log("Sent files:", response);
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

      toast((t) => (
        <div className="flex flex-col gap-1">
          <span className="font-bold">File offer received</span>
          <span>{data.file_name} ({data.file_size ?? "unknown"} bytes)</span>
          <div className="flex gap-2 pt-1">
            <button
              onClick={async () => {
                toast.dismiss(t.id);
                await accept_file_receive(data.id, data.file_name);
              }}
              className="bg-green-500 text-white cursor-pointer rounded px-2 py-1 text-sm"
            >
              Accept
            </button>
            <button
              onClick={async () => {
                await deny_file_receive(data.id);
                toast.error(`Denied ${data.file_name}`);
                toast.dismiss(t.id);
              }}
              className="bg-red-500 text-white cursor-pointer rounded px-2 py-1 text-sm"
            >
              Deny
            </button>
          </div>
        </div>
      ), { duration: Infinity, icon: '📩' });
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

  useEffect(() => {
    recieved_files_data();
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
      
      // Update download progress with error state
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
    <div className="app-container">
      <Toaster position="bottom-right" reverseOrder={false} />

      <nav>
        <div className="p-4 flex justify-between items-center shadow-md">
          <h1 className="font-bold flex items-center select-none gap-2">
            <span className="spin-on-hover cursor-pointer">🌀</span> 
            wyrmhole
          </h1>
          <SettingsMenu />
        </div>
      </nav>

      <div className="m-4 select-none">
        <h2 className="select-none cursor-default">Sending</h2>
        {sendProgress.size > 0 && (
          <div className="mb-4">
            <p className="text-sm text-gray-700 cursor-default select-none mb-2">Active Sends</p>
            <div className="border border-gray-300 rounded drop-shadow-sm bg-white">
              <div className="grid grid-cols-4 select-none border-b border-gray-300 bg-gray-50 px-2 py-1 text-sm text-gray-500">
                <div>Filename</div>
                <div>Progress</div>
                <div className="text-center">Percentage</div>
                <div className="text-right">Status</div>
              </div>
              <div>
                {Array.from(sendProgress.values()).map((progress) => (
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
                ))}
              </div>
            </div>
          </div>
        )}
        {!selectedFiles && (
          <label htmlFor="File" className="block rounded cursor-pointer bg-white border border-gray-300 text-gray-900 shadow-sm sm:p-6" onClick={select_files}>
          <div className="flex items-center justify-center gap-4 h-20">
            <span className="font-medium"> Upload your file(s) </span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m0-3-3-3m0 0-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75"/>
            </svg>
          </div>
        </label>
        )}

        {selectedFiles && selectedFiles.length > 0 && (
          <div className="relative rounded bg-white border border-gray-300">
            <div className="relative w-full max-h-20 overflow-y-auto"
              style={{
                minHeight: "3.5rem",
                // Always reserve space for scrollbar (width: 8px typical)
                scrollbarWidth: "thin",
                // For Chrome/Edge: always show scrollbar gutter
                scrollbarGutter: "stable",
              }}
            >
              <ul
                className="flex flex-col p-2 gap-2 text-sm text-gray-700 my-2"
                style={{
                  minHeight: "3.5rem",
                  paddingRight: "8px",
                }}
              >
                {selectedFiles && selectedFiles.length > 1 && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    onClick={() => setSelectedFiles(null)}
                    className="absolute right-0.5 top-0.5 cursor-pointer p-0.5 fill-black hover:fill-red-500 active:fill-red-700 transition-colors"
                    style={{ width: "32px", height: "32px", padding: 2 }}
                  >
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
                  </svg>
                )}
                {selectedFiles.map((file, idx) => {
                  const name =
                    typeof file === "string" ? file.split(/[/\\]/).pop() : "Unknown";
                  return (
                    <li
                      key={idx}
                      className="relative flex gap-2 bg-gray-100 rounded px-2 py-1 max-w-[calc(100%-1rem)] items-center"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        className="size-4 text-gray-500"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                      <p className="max-w-xs truncate">{name}</p>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        onClick={() => remove_file_at_index(idx)}
                        className="absolute right-0 top-0 cursor-pointer fill-black hover:fill-red-500 active:fill-red-700 transition-colors"
                        style={{ width: "25px", height: "25px", padding: 2 }}
                      >
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
                      </svg>
                    </li>
                  );
                })}
              </ul>
            </div>
            <button onClick={send_files} type="submit" className="w-full font-bold rounded-b flex items-center justify-center p-2 border-t cursor-pointer border-gray-200 hover:border-gray-300 active:border-gray-400 hover:bg-gray-100 active:bg-blue-200 transition-colors">
              Send
            </button>
          </div>
        )}
      </div>

      <div className="m-4">
        <h2 className="select-none cursor-default">Receiving</h2>
        <form onSubmit={(e) => { e.preventDefault(); request_file(); }} className="flex w-full bg-white border border-gray-300 justify-between rounded">
          <input value={receiveCode} onChange={(e) => setReceiveCode(e.target.value)} placeholder="ex. 5-funny-earth" className="p-2 w-full select-none focus:outline-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"/>
          <button type="submit" className="font-bold flex items-center justify-center px-2 w-30 border-l cursor-pointer border-gray-200 hover:border-gray-300 hover:bg-gray-100 active:bg-blue-200 fill-gray-400 hover:fill-gray-500 active:fill-gray-700 transition-colors">
            Receive
          </button>
        </form>

        <div className="py-2">
          {downloadProgress.size > 0 && (
            <div className="mb-4">
              <p className="text-sm text-gray-700 cursor-default select-none mb-2">Active Downloads</p>
              <div className="border border-gray-300 rounded drop-shadow-sm bg-white">
                <div className="grid grid-cols-4 select-none border-b border-gray-300 bg-gray-50 px-2 py-1 text-sm text-gray-500">
                  <div>Filename</div>
                  <div>Progress</div>
                  <div className="text-center">Percentage</div>
                  <div className="text-right">Status</div>
                </div>
                <div>
                  {Array.from(downloadProgress.values()).map((progress) => (
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
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <p className="text-sm text-gray-700 cursor-default select-none">Received File History</p>
          
          <div className="border border-gray-300 rounded drop-shadow-sm my-2 mt-1 bg-white">
            <div className="h-30 overflow-y-auto">
              <div className="grid grid-cols-3 select-none border-b border-gray-300 bg-white sticky top-0 z-10 px-1">
                <div className="text-sm text-gray-400">Filename</div>
                <div className="text-sm text-gray-400">Extension</div>
                <div className="text-sm text-gray-400">Size</div>
              </div>
              
              <div className="divide-y divide-gray-200">
                {(receivedFiles.slice().reverse()).map((file, idx) => (
                  <ReceiveFileCard key={idx} {...file} />
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
