import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useRef } from "react";
import { Toaster, toast } from "sonner";
import ReceiveFileCard from "./RecieveFileCardComponent";
import SentFileCard from "./SentFileCard";
import ActiveDownloadCard from "./ActiveDownloadCard";
import ActiveSendCard from "./ActiveSendCard";
import PendingFileOfferCard from "./PendingFileOfferCard";
import ConnectingCard from "./ConnectingCard";
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

interface SentFile {
  file_name: string;
  file_size: number;
  file_extension: string;
  file_paths?: string[];
  file_path?: string; // For backward compatibility with old data
  send_time: string;
  connection_code: string;
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
  const [sentFiles, setSentFiles] = useState<SentFile[]>([]);
  const [historyTab, setHistoryTab] = useState<"received" | "sent">("received");
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(
    new Map(),
  );
  const [sendProgress, setSendProgress] = useState<Map<string, SendProgress>>(new Map());
  const [pendingFileOffers, setPendingFileOffers] = useState<Map<string, PendingFileOffer>>(
    new Map(),
  );
  const [defaultFolderNameFormat, setDefaultFolderNameFormat] =
    useState<string>("#-files-via-wyrmhole");
  const [connectingCodes, setConnectingCodes] = useState<Map<string, string>>(new Map()); // Map<id, code>
  const cancelledConnections = useRef<Set<string>>(new Set()); // Track cancelled connection IDs
  const connectionCodeToasts = useRef<Map<string | number, string>>(new Map()); // Map<toastId, code>

  async function deny_file_receive(id: string) {
    try {
      await invoke("receiving_file_deny", { id });
      console.log("Denied file:", id);
      // Remove from pending offers
      setPendingFileOffers((prev) => {
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
      setPendingFileOffers((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      // Initialize download progress
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.set(id, {
          id,
          file_name: file_name || "Unknown file",
          transferred: 0,
          total: 0,
          percentage: 0,
        });
        return next;
      });

      await invoke("receiving_file_accept", { id });
      console.log("Accepted file:", id);
    } catch (error) {
      console.error("Error accepting file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Don't show toast here - the download-error event handler will show it
      // Update download progress with error state
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        const existing = next.get(id);
        if (existing) {
          next.set(id, {
            ...existing,
            error: errorMessage,
          });
        } else {
          next.set(id, {
            id,
            file_name: file_name || "Unknown file",
            transferred: 0,
            total: 0,
            percentage: 0,
            error: errorMessage,
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
      const stringFiles = files.filter((f) => typeof f === "string") as string[];
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
      setSendProgress((prev) => {
        const next = new Map(prev);
        next.set(sendId, {
          id: sendId,
          file_name: displayName,
          sent: 0,
          total: 0,
          percentage: 0,
          status: "preparing",
        });
        return next;
      });

      try {
        const response = await invoke("send_file_call", { filePath, sendId });
        console.log("Sent file:", response);
      } catch (err) {
        console.error("Error sending file:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        // Don't show toast here - the send-error event handler will show it
        // Update send progress with error state
        setSendProgress((prev) => {
          const next = new Map(prev);
          const existing = next.get(sendId);
          if (existing) {
            next.set(sendId, {
              ...existing,
              error: errorMessage,
            });
          } else {
            next.set(sendId, {
              id: sendId,
              file_name: displayName,
              sent: 0,
              total: 0,
              percentage: 0,
              error: errorMessage,
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
      setSendProgress((prev) => {
        const next = new Map(prev);
        next.set(sendId, {
          id: sendId,
          file_name: "Preparing...", // Temporary placeholder, backend will update immediately
          sent: 0,
          total: 0,
          percentage: 0,
        });
        return next;
      });

      try {
        const response = await invoke("send_multiple_files_call", {
          filePaths: selectedFiles,
          sendId,
          folderName: folderName.trim() || null,
        });
        console.log("Sent files:", response);
        // Clear folder name after sending
        setFolderName("");
      } catch (err) {
        console.error("Error sending files:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        // Don't show toast here - the send-error event handler will show it
        // Update send progress with error state
        setSendProgress((prev) => {
          const next = new Map(prev);
          const existing = next.get(sendId);
          if (existing) {
            next.set(sendId, {
              ...existing,
              error: errorMessage,
            });
          } else {
            next.set(sendId, {
              id: sendId,
              file_name: displayName,
              sent: 0,
              total: 0,
              percentage: 0,
              error: errorMessage,
            });
          }
          return next;
        });
      }
    }
  }

  async function request_file() {
    if (!receiveCode.trim()) {
      return;
    }

    const codeToUse = receiveCode.trim();
    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add to connecting codes
    setConnectingCodes((prev) => {
      const next = new Map(prev);
      next.set(connectionId, codeToUse);
      return next;
    });

    // Clear the receive code input
    setReceiveCode("");

    try {
      const response = await invoke("request_file_call", { receiveCode: codeToUse, connectionId });
      const data = JSON.parse(response as string);

      // Check if this connection was cancelled while waiting
      const wasCancelled = cancelledConnections.current.has(connectionId);
      cancelledConnections.current.delete(connectionId); // Clean up

      // Remove from connecting codes
      setConnectingCodes((prev) => {
        const next = new Map(prev);
        next.delete(connectionId);
        return next;
      });

      if (!data || !data.id || !data.file_name) {
        if (!wasCancelled) {
          toast.error("Invalid file offer from backend.");
        }
        return;
      }

      // If the connection was cancelled, automatically deny the file offer
      if (wasCancelled) {
        try {
          await invoke("receiving_file_deny", { id: data.id });
          console.log("Automatically denied file offer from cancelled connection:", data.id);
        } catch (error) {
          console.error("Error denying file from cancelled connection:", error);
        }
        return;
      }

      // Add to pending file offers instead of showing toast
      setPendingFileOffers((prev) => {
        const next = new Map(prev);
        next.set(data.id, {
          id: data.id,
          file_name: data.file_name,
          file_size: data.file_size,
        });
        return next;
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);

      // Check if this connection was cancelled while waiting
      const wasCancelled = cancelledConnections.current.has(connectionId);
      cancelledConnections.current.delete(connectionId); // Clean up

      // Remove from connecting codes
      setConnectingCodes((prev) => {
        const next = new Map(prev);
        next.delete(connectionId);
        return next;
      });

      // Only show error if it wasn't cancelled
      if (!wasCancelled) {
        toast.error(errorMessage || "Failed to connect to sender.");
        console.error("Request file error:", e);
      }
    }
  }

  async function cancelConnection(code: string) {
    // Find the connection ID by code
    let connectionId: string | null = null;
    setConnectingCodes((prev) => {
      const next = new Map(prev);
      for (const [id, connCode] of next.entries()) {
        if (connCode === code) {
          connectionId = id;
          // Mark this connection as cancelled
          cancelledConnections.current.add(id);
          next.delete(id);
          break;
        }
      }
      return next;
    });

    // Call backend to actually cancel the connection
    if (connectionId) {
      try {
        await invoke("cancel_connection", { connectionId });
        toast.success("Connection cancelled");
      } catch (err) {
        console.error("Error cancelling connection:", err);
        toast.error("Failed to cancel connection");
      }
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

  async function sent_files_data() {
    try {
      const response = await invoke("sent_files_data");
      if (Array.isArray(response)) setSentFiles(response as SentFile[]);
      else setSentFiles([]);
    } catch (error) {
      console.error("Error getting sent files data:", error);
    }
  }

  function remove_file_at_index(idx: number) {
    setSelectedFiles((prev) => {
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
    sent_files_data();
    get_default_folder_name_format();
  }, []);

  // Listen for received file added event - updates table automatically
  useEffect(() => {
    console.log("Listening for received-file-added event");
    const unlistenPromise = listen("received-file-added", () => {
      console.log("Received file added event, refreshing received files");
      recieved_files_data();
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Listen for sent file added event - updates table automatically
  useEffect(() => {
    console.log("Listening for sent-file-added event");
    const unlistenPromise = listen("sent-file-added", () => {
      console.log("Sent file added event, refreshing sent files");
      sent_files_data();
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
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
      const payload = event.payload as {
        status: string;
        code?: string;
        message?: string;
        send_id?: string;
      };
      if (payload.status === "success" && payload.send_id) {
        // Update send progress with connection code
        setSendProgress((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.send_id!);
          if (existing) {
            next.set(payload.send_id!, {
              ...existing,
              code: payload.code,
            });
          }
          return next;
        });

        // Show toast with connection code (click to copy)
        const codeToCopy = payload.code ?? "";
        const toastId = toast(`📨 Connection code: ${codeToCopy}`, {
          duration: 10000,
          className: "connection-code-toast",
          description: "Click anywhere to copy",
          style: {
            gap: "2px",
          },
        });
        connectionCodeToasts.current.set(toastId, codeToCopy);
      } else if (payload.status === "success") {
        // Legacy toast for non-send connections - stays until dismissed
        const codeToCopy = payload.code ?? "";
        const toastId = toast(`📨 Connection code: ${codeToCopy}`, {
          duration: 999999999, // Very long duration, effectively infinite
          className: "connection-code-toast",
          description: "Click anywhere to copy",
          style: {
            gap: "2px",
          },
        });
        connectionCodeToasts.current.set(toastId, codeToCopy);
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
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.set(payload.id, payload);
        return next;
      });

      // Check if download is complete
      if (payload.percentage >= 100) {
        setTimeout(() => {
          toast.success(`Downloaded ${payload.file_name}`, { duration: 5000 });
          setDownloadProgress((prev) => {
            const next = new Map(prev);
            next.delete(payload.id);
            return next;
          });
          // File will be added to history and event will trigger refresh
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
        setDownloadProgress((prev) => {
          const next = new Map(prev);
          next.delete(payload.id);
          return next;
        });
        return;
      }

      // For other errors, update download progress with error state
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.id);
        if (existing) {
          next.set(payload.id, {
            ...existing,
            error: payload.error,
          });
        } else {
          // If download wasn't tracked yet, add it with error
          next.set(payload.id, {
            id: payload.id,
            file_name: payload.file_name,
            transferred: 0,
            total: 0,
            percentage: 0,
            error: payload.error,
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
      setSendProgress((prev) => {
        const next = new Map(prev);
        next.set(payload.id, payload);
        return next;
      });

      // Check if send is complete
      if (payload.percentage >= 100) {
        setTimeout(() => {
          toast.success(`Sent ${payload.file_name}`, { duration: 5000 });
          setSendProgress((prev) => {
            const next = new Map(prev);
            next.delete(payload.id);
            return next;
          });
          // File will be added to history and event will trigger refresh
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
      setSendProgress((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.id);
        if (existing) {
          next.set(payload.id, {
            ...existing,
            error: payload.error,
          });
        } else {
          // If send wasn't tracked yet, add it with error
          next.set(payload.id, {
            id: payload.id,
            file_name: payload.file_name,
            sent: 0,
            total: 0,
            percentage: 0,
            error: payload.error,
          });
        }
        return next;
      });

      // Don't show error toast if it was cancelled by user (success toast already shown)
      if (payload.error !== "Transfer cancelled by user") {
        toast.error(`Send failed: ${payload.file_name}`, { duration: 5000 });
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Set up event delegation for connection code toasts
  useEffect(() => {
    const handleToastClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const toastElement = target.closest(
        "[data-sonner-toast].connection-code-toast",
      ) as HTMLElement;
      if (toastElement) {
        // Extract code from toast title text (not description)
        const titleElement = toastElement.querySelector("[data-title]");
        const toastTitleText = titleElement?.textContent || "";
        // Extract just the code part from "Connection code: CODE"
        const codeMatch = toastTitleText.match(/Connection code: (.+)/);
        if (codeMatch && codeMatch[1]) {
          const codeToCopy = codeMatch[1].trim();
          await navigator.clipboard.writeText(codeToCopy);
          toast.success("Code copied to clipboard");

          // Find and dismiss the toast by matching the code
          for (const [toastId, storedCode] of connectionCodeToasts.current.entries()) {
            if (storedCode === codeToCopy) {
              toast.dismiss(toastId);
              connectionCodeToasts.current.delete(toastId);
              break;
            }
          }
        }
      }
    };

    document.addEventListener("click", handleToastClick);
    return () => {
      document.removeEventListener("click", handleToastClick);
    };
  }, []);

  return (
    <div className="app-container h-screen glass-background flex flex-col overflow-hidden">
      <Toaster position="bottom-right" />

      <nav className="glass-navbar flex-shrink-0 z-10">
        <div className="px-3 sm:px-6 py-2 sm:py-2.5 flex justify-between items-center">
          <h1 className="text-lg sm:text-2xl xl:text-3xl font-bold flex items-center select-none gap-1 sm:gap-2 text-gray-800">
            <span className="spin-on-hover cursor-pointer text-lg sm:text-2xl xl:text-3xl flex items-center">
              🌀
            </span>
            <span className="gradient-shimmer flex items-center">wyrmhole</span>
          </h1>
          <SettingsMenu />
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "thin" }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4 select-none">
          {/* Active Transfers Section - Always visible on desktop, conditional on mobile */}
          <div
            className={`mb-3 sm:mb-4 ${sendProgress.size === 0 && downloadProgress.size === 0 ? "hidden md:block" : ""}`}
          >
            <h2 className="text-xs sm:text-sm xl:text-base font-semibold text-gray-800 mb-2 select-none cursor-default">
              Active Transfers
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
              {/* Active Sends */}
              <div
                className={`rounded-2xl overflow-hidden md:h-[140px] flex flex-col ${sendProgress.size === 0 ? "hidden md:flex" : ""}`}
                style={{
                  background: "rgba(255, 255, 255, 0.5)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  boxShadow:
                    "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                }}
              >
                <div
                  className="px-2 sm:px-3 py-1.5 border-b border-white/20 flex-shrink-0"
                  style={{
                    background: "rgba(59, 130, 246, 0.15)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  <p className="text-[9px] sm:text-[10px] xl:text-xs font-semibold text-blue-700 uppercase tracking-wide">
                    Sending {sendProgress.size > 0 && `(${sendProgress.size})`}
                  </p>
                </div>
                <div
                  className={`overflow-y-auto md:flex-1 ${sendProgress.size === 0 ? "flex items-center justify-center" : ""}`}
                  style={{ scrollbarWidth: "thin" }}
                  onWheel={(e) => {
                    const target = e.currentTarget;
                    const isAtTop = target.scrollTop === 0;
                    const isAtBottom =
                      target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
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
                          setSendProgress((prev) => {
                            const next = new Map(prev);
                            next.delete(id);
                            return next;
                          });
                        }}
                      />
                    ))
                  ) : (
                    <div className="text-center text-xs xl:text-sm text-gray-400">
                      No active sends
                    </div>
                  )}
                </div>
              </div>

              {/* Active Downloads */}
              <div
                className={`rounded-2xl overflow-hidden md:h-[140px] flex flex-col ${downloadProgress.size === 0 ? "hidden md:flex" : ""}`}
                style={{
                  background: "rgba(255, 255, 255, 0.5)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  boxShadow:
                    "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                }}
              >
                <div
                  className="px-2 sm:px-3 py-1.5 border-b border-white/20 flex-shrink-0"
                  style={{
                    background: "rgba(34, 197, 94, 0.15)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  <p className="text-[9px] sm:text-[10px] xl:text-xs font-semibold text-green-700 uppercase tracking-wide">
                    Receiving {downloadProgress.size > 0 && `(${downloadProgress.size})`}
                  </p>
                </div>
                <div
                  className={`overflow-y-auto md:flex-1 ${downloadProgress.size === 0 ? "flex items-center justify-center" : ""}`}
                  style={{ scrollbarWidth: "thin" }}
                  onWheel={(e) => {
                    const target = e.currentTarget;
                    const isAtTop = target.scrollTop === 0;
                    const isAtBottom =
                      target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
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
                          setDownloadProgress((prev) => {
                            const next = new Map(prev);
                            next.delete(id);
                            return next;
                          });
                        }}
                      />
                    ))
                  ) : (
                    <div className="text-center text-xs xl:text-sm text-gray-400">
                      No active downloads
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions Section - Fixed Height */}
          <div className="mb-3 sm:mb-4">
            <h2 className="text-xs sm:text-sm xl:text-base font-semibold text-gray-800 mb-2 select-none cursor-default">
              Actions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
              {/* Send Files Section - Fixed Height */}
              <div
                className="rounded-2xl overflow-hidden min-h-[200px] md:max-h-[240px] flex flex-col"
                style={{
                  background: "rgba(255, 255, 255, 0.5)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  boxShadow:
                    "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                }}
              >
                <div className="px-3 py-2 border-b border-white/20 flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm xl:text-base font-semibold text-gray-700 flex-shrink-0">
                      Send Files
                    </h3>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      {selectedFiles && selectedFiles.length > 1 && (
                        <input
                          type="text"
                          value={folderName}
                          onChange={(e) => setFolderName(e.target.value)}
                          placeholder={`Folder Name: ${(defaultFolderNameFormat.trim() || "#-files-via-wyrmhole").replace("#", selectedFiles.length.toString())}`}
                          className="flex-1 px-2 py-1 text-xs xl:text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                          style={{
                            background: "rgba(255, 255, 255, 0.7)",
                            backdropFilter: "blur(16px)",
                            WebkitBackdropFilter: "blur(16px)",
                            border: "1px solid rgba(255, 255, 255, 0.5)",
                            boxShadow:
                              "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                          }}
                          title="Custom name for the folder when sending multiple files. Leave empty to use the default format."
                        />
                      )}
                      {selectedFiles && (
                        <button
                          onClick={send_files}
                          className="font-medium flex items-center justify-center gap-1 px-2 py-1 text-white text-xs xl:text-sm rounded-2xl transition-all cursor-pointer flex-shrink-0"
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
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="2"
                            stroke="currentColor"
                            className="w-3.5 h-3.5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                            />
                          </svg>
                          <span>Send</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col p-3 min-h-0">
                  {!selectedFiles ? (
                    <label
                      htmlFor="File"
                      className="flex-1 flex flex-col items-center justify-center cursor-pointer border-2 border-dashed transition-all duration-200 rounded-2xl"
                      style={{
                        borderColor: "rgba(255, 255, 255, 0.3)",
                        background: "rgba(255, 255, 255, 0.2)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.5)";
                        e.currentTarget.style.background = "rgba(239, 246, 255, 0.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                      }}
                      onClick={select_files}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        className="w-5 h-5 text-gray-400 mb-1"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m0-3-3-3m0 0-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75"
                        />
                      </svg>
                      <span className="text-xs xl:text-sm text-gray-600">
                        Click to select files
                      </span>
                    </label>
                  ) : (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-2 flex-shrink-0">
                        <span className="text-xs xl:text-sm font-medium text-gray-700">
                          {selectedFiles.length} {selectedFiles.length === 1 ? "file" : "files"}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFiles(null);
                            setFolderName("");
                          }}
                          className="text-[10px] xl:text-xs text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
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
                          const isAtBottom =
                            target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
                          if ((!isAtTop && e.deltaY < 0) || (!isAtBottom && e.deltaY > 0)) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {selectedFiles.length === 1 ? (
                          <div
                            className="group flex items-center gap-2 p-2 rounded-xl"
                            style={{
                              background: "rgba(255, 255, 255, 0.3)",
                              backdropFilter: "blur(16px)",
                              WebkitBackdropFilter: "blur(16px)",
                              border: "1px solid rgba(255, 255, 255, 0.3)",
                              boxShadow:
                                "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                            }}
                          >
                            <FileIcon
                              fileName={selectedFiles[0].split(/[/\\]/).pop() || "Unknown"}
                              className="w-4 h-4 flex-shrink-0"
                            />
                            <p className="text-xs xl:text-sm font-medium text-gray-900 truncate flex-1">
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
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 16 16"
                                className="w-4 h-4 fill-gray-400 hover:fill-red-600"
                              >
                                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {selectedFiles.map((file, idx) => {
                              const name =
                                typeof file === "string"
                                  ? file.split(/[/\\]/).pop() || "Unknown"
                                  : "Unknown";
                              return (
                                <div
                                  key={idx}
                                  className="group flex items-center gap-2 p-1.5 rounded-xl"
                                  style={{
                                    background: "rgba(255, 255, 255, 0.3)",
                                    backdropFilter: "blur(16px)",
                                    WebkitBackdropFilter: "blur(16px)",
                                    border: "1px solid rgba(255, 255, 255, 0.3)",
                                    boxShadow:
                                      "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                                  }}
                                >
                                  <FileIcon fileName={name} className="w-3.5 h-3.5 flex-shrink-0" />
                                  <p className="text-[11px] xl:text-xs font-medium text-gray-900 truncate flex-1">
                                    {name}
                                  </p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      remove_file_at_index(idx);
                                    }}
                                    className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                                    title="Remove"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 16 16"
                                      className="w-4 h-4 fill-gray-400 hover:fill-red-600"
                                    >
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

              {/* Receive Files Section - Compact - Grows with content */}
              <div
                className="rounded-2xl overflow-hidden flex flex-col"
                style={{
                  background: "rgba(255, 255, 255, 0.5)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  boxShadow:
                    "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                }}
              >
                <div className="px-3 py-2 border-b border-white/20 flex-shrink-0">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      request_file();
                    }}
                    className="flex items-center gap-2"
                  >
                    <h3 className="text-xs sm:text-sm xl:text-base font-semibold text-gray-700 flex-shrink-0">
                      Receive Files
                    </h3>
                    <input
                      value={receiveCode}
                      onChange={(e) => setReceiveCode(e.target.value)}
                      placeholder="Enter code: ex. 7-helpful-tiger"
                      className="flex-1 px-2 py-1 text-xs xl:text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                      style={{
                        background: "rgba(255, 255, 255, 0.3)",
                        backdropFilter: "blur(16px)",
                        WebkitBackdropFilter: "blur(16px)",
                        border: "1px solid rgba(255, 255, 255, 0.3)",
                        boxShadow:
                          "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                      }}
                      title="Enter the connection code provided by the sender. The code format is typically numbers and words separated by hyphens, like '7-helpful-tiger'."
                    />
                    <button
                      type="submit"
                      className="font-medium flex items-center justify-center gap-1 px-2 py-1 text-white text-xs xl:text-sm rounded-2xl transition-all cursor-pointer flex-shrink-0"
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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                        />
                      </svg>
                      <span>Receive</span>
                    </button>
                  </form>
                </div>
                <div className="flex flex-col p-3">
                  {/* Connecting Cards and Pending File Offers */}
                  {connectingCodes.size > 0 || pendingFileOffers.size > 0 ? (
                    <div className="flex flex-col">
                      {(connectingCodes.size > 0 || pendingFileOffers.size > 0) && (
                        <div className="text-[10px] sm:text-xs xl:text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2 flex-shrink-0">
                          {connectingCodes.size > 0 && pendingFileOffers.size > 0
                            ? `Connecting (${connectingCodes.size}) • Pending Offers (${pendingFileOffers.size})`
                            : connectingCodes.size > 0
                              ? `Connecting (${connectingCodes.size})`
                              : `Pending Offers (${pendingFileOffers.size})`}
                        </div>
                      )}
                      <div
                        className="overflow-y-auto space-y-1 max-h-[200px] md:max-h-[240px]"
                        style={{ scrollbarWidth: "thin" }}
                        onWheel={(e) => {
                          const target = e.currentTarget;
                          const isAtTop = target.scrollTop === 0;
                          const isAtBottom =
                            target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
                          if ((!isAtTop && e.deltaY < 0) || (!isAtBottom && e.deltaY > 0)) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {/* Connecting Cards */}
                        {Array.from(connectingCodes.entries()).map(([id, code]) => (
                          <ConnectingCard key={id} code={code} onCancel={cancelConnection} />
                        ))}
                        {/* Pending File Offers */}
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
                    <div className="flex items-center justify-center text-xs xl:text-sm text-gray-400 py-2">
                      No pending offers
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* File History Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xs sm:text-sm xl:text-base font-semibold text-gray-800 select-none cursor-default">
                File History
              </h2>
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => {
                    if (historyTab !== "received") {
                      setHistoryTab("received");
                      recieved_files_data();
                    }
                  }}
                  className={`px-2 py-1 rounded-xl transition-all duration-200 ${
                    historyTab === "received"
                      ? "text-blue-700 font-semibold"
                      : "text-gray-500 hover:text-blue-600"
                  }`}
                  style={
                    historyTab === "received"
                      ? {
                          background: "rgba(239, 246, 255, 0.5)",
                          backdropFilter: "blur(8px)",
                          WebkitBackdropFilter: "blur(8px)",
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                        }
                      : {
                          background: "transparent",
                        }
                  }
                  onMouseEnter={(e) => {
                    if (historyTab !== "received") {
                      e.currentTarget.style.background = "rgba(239, 246, 255, 0.3)";
                      e.currentTarget.style.backdropFilter = "blur(8px)";
                      e.currentTarget.style.setProperty("-webkit-backdrop-filter", "blur(8px)");
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (historyTab !== "received") {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.backdropFilter = "none";
                      e.currentTarget.style.setProperty("-webkit-backdrop-filter", "none");
                    }
                  }}
                >
                  Received
                </button>
                <span className="text-gray-400">/</span>
                <button
                  onClick={() => {
                    if (historyTab !== "sent") {
                      setHistoryTab("sent");
                      sent_files_data();
                    }
                  }}
                  className={`px-2 py-1 rounded-xl transition-all duration-200 ${
                    historyTab === "sent"
                      ? "text-blue-700 font-semibold"
                      : "text-gray-500 hover:text-blue-600"
                  }`}
                  style={
                    historyTab === "sent"
                      ? {
                          background: "rgba(239, 246, 255, 0.5)",
                          backdropFilter: "blur(8px)",
                          WebkitBackdropFilter: "blur(8px)",
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                        }
                      : {
                          background: "transparent",
                        }
                  }
                  onMouseEnter={(e) => {
                    if (historyTab !== "sent") {
                      e.currentTarget.style.background = "rgba(239, 246, 255, 0.3)";
                      e.currentTarget.style.backdropFilter = "blur(8px)";
                      e.currentTarget.style.setProperty("-webkit-backdrop-filter", "blur(8px)");
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (historyTab !== "sent") {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.backdropFilter = "none";
                      e.currentTarget.style.setProperty("-webkit-backdrop-filter", "none");
                    }
                  }}
                >
                  Sent
                </button>
              </div>
            </div>
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgba(255, 255, 255, 0.5)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(255, 255, 255, 0.4)",
                boxShadow:
                  "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
              }}
            >
              <div
                className="grid grid-cols-[2fr_1fr_1fr] select-none border-b border-white/20 px-2 sm:px-3 py-1.5 text-[9px] sm:text-[10px] xl:text-xs font-semibold text-gray-600 uppercase tracking-wide flex-shrink-0"
                style={{
                  background: "rgba(255, 255, 255, 0.3)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
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
                  const isAtBottom =
                    target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
                  if ((!isAtTop && e.deltaY < 0) || (!isAtBottom && e.deltaY > 0)) {
                    e.stopPropagation();
                  }
                }}
              >
                {historyTab === "received" ? (
                  receivedFiles.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {receivedFiles
                        .slice()
                        .reverse()
                        .map((file, idx) => (
                          <ReceiveFileCard key={idx} {...file} />
                        ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 sm:h-64 text-xs sm:text-sm text-gray-400">
                      No Received File History
                    </div>
                  )
                ) : sentFiles.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {sentFiles
                      .slice()
                      .reverse()
                      .map((file, idx) => {
                        // Handle backward compatibility: convert file_path to file_paths if needed
                        const fileWithPaths: { file_paths: string[] } & Omit<
                          SentFile,
                          "file_path" | "file_paths"
                        > = {
                          ...file,
                          file_paths: file.file_paths || (file.file_path ? [file.file_path] : []),
                        };
                        return <SentFileCard key={idx} {...fileWithPaths} />;
                      })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 sm:h-64 text-xs sm:text-sm text-gray-400">
                    No Sent File History
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
