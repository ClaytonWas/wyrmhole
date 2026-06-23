import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Toaster, toast } from "sonner";
import ReceiveFileCard from "./RecieveFileCardComponent";
import SentFileCard from "./SentFileCard";
import ActiveDownloadCard from "./ActiveDownloadCard";
import ActiveSendCard from "./ActiveSendCard";
import PendingFileOfferCard from "./PendingFileOfferCard";
import ConnectingCard from "./ConnectingCard";
import SettingsMenu from "./SettingsMenu";
import { FileIcon } from "./FileIcon";
import { XIcon } from "./Icons";
import "./App.css";

// Stops vertical wheel scroll from bubbling past a scrollable region when the
// inner element isn't already at the top or bottom edge.
function containScroll(e: React.WheelEvent<HTMLElement>) {
  const t = e.currentTarget;
  const atTop = t.scrollTop === 0;
  const atBottom = t.scrollTop + t.clientHeight >= t.scrollHeight - 1;
  if ((!atTop && e.deltaY < 0) || (!atBottom && e.deltaY > 0)) {
    e.stopPropagation();
  }
}

// --- Shared glass styles -------------------------------------------------
// Inline `style={GLASS_X}` reuses the same object across renders so React
// won't reapply it, and inline hover handlers can still mutate
// `element.style` directly.

const GLASS_CARD: CSSProperties = {
  background: "rgba(255, 255, 255, 0.5)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgb(229, 231, 235)",
  boxShadow: "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
};

const GLASS_INPUT: CSSProperties = {
  background: "rgba(255, 255, 255, 0.3)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgb(229, 231, 235)",
  boxShadow: "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
};

// --- Local hooks ---------------------------------------------------------

// Listen to a Tauri event for the component's lifetime. Handler closure is
// kept fresh via a ref so callers can read the latest state without
// re-attaching the listener.
function useTauriEvent<P = unknown>(name: string, handler: (payload: P) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const unlistenPromise = listen<P>(name, (event) => handlerRef.current(event.payload));
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [name]);
}

// Map-valued state with set/delete/clear/update helpers. The raw Map is
// returned for `.size` / `.values()` / `.get()` reads.
function useMapState<K, V>() {
  const [value, setValue] = useState<Map<K, V>>(new Map());
  const ops = useMemo(
    () => ({
      set: (k: K, v: V) =>
        setValue((prev) => {
          const next = new Map(prev);
          next.set(k, v);
          return next;
        }),
      delete: (k: K) =>
        setValue((prev) => {
          const next = new Map(prev);
          next.delete(k);
          return next;
        }),
      clear: () => setValue(new Map()),
      // Merge `partial` into the existing entry for `k`; if none exists,
      // insert `fallback`.
      update: (k: K, partial: Partial<V>, fallback: V) =>
        setValue((prev) => {
          const next = new Map(prev);
          const existing = next.get(k);
          next.set(k, existing ? { ...existing, ...partial } : fallback);
          return next;
        }),
    }),
    [],
  );
  return [value, ops] as const;
}

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
  const [historySearch, setHistorySearch] = useState("");
  const [historyMinSizeMb, setHistoryMinSizeMb] = useState("");
  const [historySizeMode, setHistorySizeMode] = useState<"atLeast" | "atMost">("atLeast");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateMode, setHistoryDateMode] = useState<"after" | "before">("after");
  const [dateButtonAnimating, setDateButtonAnimating] = useState(false);
  const [sizeButtonAnimating, setSizeButtonAnimating] = useState(false);
  const [downloadProgress, downloadOps] = useMapState<string, DownloadProgress>();
  const [sendProgress, sendOps] = useMapState<string, SendProgress>();
  const [pendingFileOffers, offerOps] = useMapState<string, PendingFileOffer>();
  const [defaultFolderNameFormat, setDefaultFolderNameFormat] =
    useState<string>("#-files-via-wyrmhole");
  const [connectingCodes, connectingOps] = useMapState<string, string>(); // Map<id, code>
  const [isDragging, setIsDragging] = useState(false);
  const cancelledConnections = useRef<Set<string>>(new Set()); // Track cancelled connection IDs
  const connectionCodeToasts = useRef<Map<string | number, string>>(new Map()); // Map<toastId, code>

  function prepare_resend_from_history(paths: string[]) {
    if (!paths || paths.length === 0) {
      toast.error("No file paths recorded for this history item.");
      return;
    }

    setSelectedFiles(paths);
    setFolderName("");

    toast.success(
      `Loaded ${paths.length} ${paths.length === 1 ? "file" : "files"} into the Send panel from history.`,
      { duration: 4000 },
    );
  }

  async function deny_file_receive(id: string) {
    try {
      await invoke("receiving_file_deny", { id });
      console.log("Denied file:", id);
      offerOps.delete(id);
    } catch (error) {
      console.error("Error denying file:", error);
    }
  }

  async function accept_file_receive(id: string, file_name?: string) {
    try {
      offerOps.delete(id);
      downloadOps.set(id, {
        id,
        file_name: file_name || "Unknown file",
        transferred: 0,
        total: 0,
        percentage: 0,
      });

      await invoke("receiving_file_accept", { id });
      console.log("Accepted file:", id);
    } catch (error) {
      console.error("Error accepting file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Don't show toast here - the download-error event handler will show it
      downloadOps.update(
        id,
        { error: errorMessage },
        {
          id,
          file_name: file_name || "Unknown file",
          transferred: 0,
          total: 0,
          percentage: 0,
          error: errorMessage,
        },
      );
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

  async function append_files() {
    try {
      const selected = await open({ multiple: true });
      if (!selected) {
        return;
      }

      const files = Array.isArray(selected) ? selected : [selected];
      const stringFiles = files.filter((f) => typeof f === "string") as string[];

      setSelectedFiles((prev) => {
        const existing = prev ?? [];
        const merged = [...existing];
        for (const f of stringFiles) {
          if (!merged.includes(f)) merged.push(f);
        }
        return merged.length > 0 ? merged : null;
      });
    } catch (err) {
      console.error("Error appending files:", err);
    }
  }

  // Native dialogs can't mix files and folders in a single picker, so folders get
  // their own picker. The selected directory paths are merged into the same
  // selectedFiles state the file picker uses; the backend already tarballs any
  // directory path it receives.
  async function append_folders() {
    try {
      const selected = await open({ directory: true, multiple: true });
      if (!selected) {
        return;
      }

      const folders = Array.isArray(selected) ? selected : [selected];
      const stringFolders = folders.filter((f) => typeof f === "string") as string[];

      setSelectedFiles((prev) => {
        const existing = prev ?? [];
        const merged = [...existing];
        for (const f of stringFolders) {
          if (!merged.includes(f)) merged.push(f);
        }
        return merged.length > 0 ? merged : null;
      });
    } catch (err) {
      console.error("Error selecting folders:", err);
    }
  }

  // Core send routine shared by the manual "Send" button and the OS
  // context-menu ("Send via wyrmhole") entry. Takes explicit paths so it
  // doesn't depend on the async `selectedFiles` state having settled.
  async function startSend(paths: string[], name: string) {
    if (!paths || paths.length === 0) return;

    const sendId = crypto.randomUUID();
    let displayName = "files";

    if (paths.length === 1) {
      const filePath = paths[0];
      displayName = filePath.split(/[/\\]/).pop() || "Unknown file";

      sendOps.set(sendId, {
        id: sendId,
        file_name: displayName,
        sent: 0,
        total: 0,
        percentage: 0,
        status: "preparing",
      });

      try {
        const response = await invoke("send_file_call", { filePath, sendId });
        console.log("Sent file:", response);
      } catch (err) {
        console.error("Error sending file:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendOps.update(
          sendId,
          { error: errorMessage },
          {
            id: sendId,
            file_name: displayName,
            sent: 0,
            total: 0,
            percentage: 0,
            error: errorMessage,
          },
        );
      }
    } else {
      // Multiple files/folders - create tarball and send. Backend will replace
      // the "Preparing..." placeholder via the first send-progress event.
      sendOps.set(sendId, {
        id: sendId,
        file_name: "Preparing...",
        sent: 0,
        total: 0,
        percentage: 0,
      });

      try {
        const response = await invoke("send_multiple_files_call", {
          filePaths: paths,
          sendId,
          folderName: name.trim() || null,
        });
        console.log("Sent files:", response);
      } catch (err) {
        console.error("Error sending files:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendOps.update(
          sendId,
          { error: errorMessage },
          {
            id: sendId,
            file_name: displayName,
            sent: 0,
            total: 0,
            percentage: 0,
            error: errorMessage,
          },
        );
      }
    }
  }

  async function send_files() {
    if (!selectedFiles || selectedFiles.length === 0) return;
    await startSend(selectedFiles, folderName);
    if (selectedFiles.length > 1) setFolderName(""); // Clear after sending
  }

  // Files handed to the app from a file-manager "Send via wyrmhole" entry.
  // Show them in the Send panel and immediately start the transfer so the
  // connection code appears without any extra clicks.
  function send_files_from_os(paths: string[]) {
    if (!paths || paths.length === 0) return;
    setSelectedFiles(paths);
    setFolderName("");
    startSend(paths, "");
  }

  async function request_file() {
    if (!receiveCode.trim()) {
      return;
    }

    const codeToUse = receiveCode.trim();
    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    connectingOps.set(connectionId, codeToUse);
    setReceiveCode("");

    try {
      const response = await invoke("request_file_call", { receiveCode: codeToUse, connectionId });
      const data = JSON.parse(response as string);

      const wasCancelled = cancelledConnections.current.has(connectionId);
      cancelledConnections.current.delete(connectionId);
      connectingOps.delete(connectionId);

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

      offerOps.set(data.id, {
        id: data.id,
        file_name: data.file_name,
        file_size: data.file_size,
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);

      const wasCancelled = cancelledConnections.current.has(connectionId);
      cancelledConnections.current.delete(connectionId);
      connectingOps.delete(connectionId);

      if (!wasCancelled) {
        toast.error(errorMessage || "Failed to connect to sender.");
        console.error("Request file error:", e);
      }
    }
  }

  async function cancelConnection(code: string) {
    let connectionId: string | null = null;
    for (const [id, connCode] of connectingCodes.entries()) {
      if (connCode === code) {
        connectionId = id;
        cancelledConnections.current.add(id);
        connectingOps.delete(id);
        break;
      }
    }

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

  async function cancel_all_transfers() {
    try {
      await invoke("cancel_all_transfers");

      sendOps.clear();
      downloadOps.clear();
      offerOps.clear();
      connectingOps.clear();
      cancelledConnections.current = new Set();

      toast.success("All active transfers cancelled", { duration: 3000 });
    } catch (error) {
      console.error("Error cancelling all transfers:", error);
      toast.error("Failed to cancel all transfers");
    }
  }

  useEffect(() => {
    recieved_files_data();
    sent_files_data();
    get_default_folder_name_format();
    // Signal that our `send-files-from-os` listener (below) is active so the
    // backend can flush any paths the app was cold-started with from a
    // file-manager "Send via wyrmhole" entry — dispatched as one batch.
    invoke("frontend_ready").catch((err) => console.error("Error signaling frontend ready:", err));
  }, []);

  // Listen for native file drag-and-drop events
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    const unlisten = appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        setIsDragging(true);
      } else if (event.payload.type === "leave") {
        setIsDragging(false);
      } else if (event.payload.type === "drop") {
        setIsDragging(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          setSelectedFiles((prev) => {
            if (!prev) return paths;
            const merged = [...prev];
            for (const p of paths) {
              if (!merged.includes(p)) merged.push(p);
            }
            return merged;
          });
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Refresh history tables when backend emits add events.
  useTauriEvent("received-file-added", () => recieved_files_data());
  useTauriEvent("sent-file-added", () => sent_files_data());

  // Files forwarded from a file-manager "Send via wyrmhole" entry while the
  // app is already running in the tray.
  useTauriEvent<string[]>("send-files-from-os", (paths) => send_files_from_os(paths));

  useTauriEvent<{ value: string }>("default-folder-name-format-updated", (payload) => {
    setDefaultFolderNameFormat(payload.value);
  });

  useTauriEvent<{
    status: string;
    code?: string;
    message?: string;
    send_id?: string;
  }>("connection-code", (payload) => {
    if (payload.status === "success" && payload.send_id) {
      const existing = sendProgress.get(payload.send_id);
      if (existing) {
        sendOps.set(payload.send_id, { ...existing, code: payload.code });
      }

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

  useTauriEvent<DownloadProgress>("download-progress", (payload) => {
    downloadOps.set(payload.id, payload);

    if (payload.percentage >= 100) {
      setTimeout(() => {
        toast.success(`Downloaded ${payload.file_name}`, { duration: 5000 });
        downloadOps.delete(payload.id);
      }, 500);
    }
  });

  useTauriEvent<{ id: string; file_name: string; error: string }>("download-error", (payload) => {
    if (payload.error === "Transfer cancelled by user") {
      downloadOps.delete(payload.id);
      return;
    }

    downloadOps.update(
      payload.id,
      { error: payload.error },
      {
        id: payload.id,
        file_name: payload.file_name,
        transferred: 0,
        total: 0,
        percentage: 0,
        error: payload.error,
      },
    );

    toast.error(`Download failed: ${payload.file_name}`, { duration: 5000 });
  });

  useTauriEvent<SendProgress>("send-progress", (payload) => {
    sendOps.set(payload.id, payload);

    if (payload.percentage >= 100) {
      setTimeout(() => {
        toast.success(`Sent ${payload.file_name}`, { duration: 5000 });
        sendOps.delete(payload.id);
      }, 500);
    }
  });

  useTauriEvent<{ id: string; file_name: string; error: string }>("send-error", (payload) => {
    sendOps.update(
      payload.id,
      { error: payload.error },
      {
        id: payload.id,
        file_name: payload.file_name,
        sent: 0,
        total: 0,
        percentage: 0,
        error: payload.error,
      },
    );

    if (payload.error !== "Transfer cancelled by user") {
      toast.error(`Send failed: ${payload.file_name}`, { duration: 5000 });
    }
  });

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

      {/* Inset border glow when dragging files over window */}
      <div
        className="pointer-events-none fixed inset-0 z-50 rounded-lg transition-all duration-200"
        style={{
          boxShadow: isDragging
            ? "inset 0 0 0 4px rgba(59, 130, 246, 0.7), inset 0 0 40px 0 rgba(59, 130, 246, 0.15), inset 0 0 80px 0 rgba(59, 130, 246, 0.06)"
            : "none",
          opacity: isDragging ? 1 : 0,
        }}
      />

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
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs sm:text-sm xl:text-base font-semibold text-gray-800 select-none cursor-default">
                Active Transfers
              </h2>
              {(sendProgress.size > 0 || downloadProgress.size > 0) && (
                <button
                  type="button"
                  onClick={cancel_all_transfers}
                  className="text-[10px] sm:text-xs xl:text-sm text-red-600 hover:text-red-700 px-2 py-1 rounded-xl border border-red-200 hover:border-red-300 bg-red-50/70 cursor-pointer transition-colors"
                >
                  Cancel all
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
              {/* Active Sends */}
              <div
                className={`rounded-2xl overflow-hidden md:h-[140px] flex flex-col ${sendProgress.size === 0 ? "hidden md:flex" : ""}`}
                style={GLASS_CARD}
              >
                <div
                  className="px-2 sm:px-3 py-1.5 border-b border-gray-200 flex-shrink-0"
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
                  onWheel={containScroll}
                >
                  {sendProgress.size > 0 ? (
                    Array.from(sendProgress.values()).map((progress) => (
                      <ActiveSendCard
                        key={progress.id}
                        {...progress}
                        onDismiss={(id) => sendOps.delete(id)}
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
                style={GLASS_CARD}
              >
                <div
                  className="px-2 sm:px-3 py-1.5 border-b border-gray-200 flex-shrink-0"
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
                  onWheel={containScroll}
                >
                  {downloadProgress.size > 0 ? (
                    Array.from(downloadProgress.values()).map((progress) => (
                      <ActiveDownloadCard
                        key={progress.id}
                        {...progress}
                        onDismiss={(id) => downloadOps.delete(id)}
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
                style={GLASS_CARD}
              >
                <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
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
                          className="flex-1 px-2 py-1 text-xs xl:text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all border border-gray-200"
                          style={{
                            background: "rgba(255, 255, 255, 0.7)",
                            backdropFilter: "blur(16px)",
                            WebkitBackdropFilter: "blur(16px)",
                            boxShadow:
                              "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                          }}
                          title="Custom name for the folder when sending multiple files. Leave empty to use the default format."
                        />
                      )}
                      {selectedFiles && (
                        <button
                          onClick={send_files}
                          className="glass-primary-btn font-medium flex items-center justify-center gap-1 px-2 py-1 text-white text-xs xl:text-sm rounded-2xl transition-all cursor-pointer flex-shrink-0"
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
                      className={`flex-1 flex flex-col items-center justify-center cursor-pointer border-2 border-dashed transition-all duration-200 rounded-2xl ${isDragging ? "scale-[1.02]" : ""}`}
                      style={{
                        borderColor: isDragging ? "rgba(59, 130, 246, 0.7)" : "rgb(229, 231, 235)",
                        background: isDragging
                          ? "rgba(219, 234, 254, 0.4)"
                          : "rgba(255, 255, 255, 0.2)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isDragging) {
                          e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.5)";
                          e.currentTarget.style.background = "rgba(239, 246, 255, 0.3)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isDragging) {
                          e.currentTarget.style.borderColor = "rgb(229, 231, 235)";
                          e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                        }
                      }}
                      onClick={select_files}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        className={`w-5 h-5 mb-1 transition-colors ${isDragging ? "text-blue-500" : "text-gray-400"}`}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m0-3-3-3m0 0-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75"
                        />
                      </svg>
                      <span
                        className={`text-xs xl:text-sm transition-colors ${isDragging ? "text-blue-600 font-medium" : "text-gray-600"}`}
                      >
                        {isDragging ? "Drop files here" : "Click or drag files here"}
                      </span>
                      {!isDragging && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            append_folders();
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-blue-300 bg-blue-50/60 text-[10px] xl:text-xs font-medium text-blue-600 hover:bg-blue-100/80 hover:border-blue-400 transition-colors cursor-pointer"
                          title="Select a folder to send"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                            className="w-3.5 h-3.5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                            />
                          </svg>
                          Select a folder instead
                        </button>
                      )}
                    </label>
                  ) : (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-2 flex-shrink-0">
                        <span className="text-xs xl:text-sm font-medium text-gray-700">
                          {selectedFiles.length} {selectedFiles.length === 1 ? "file" : "files"}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              append_files();
                            }}
                            className="text-[10px] xl:text-xs text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                            title="Add more files"
                          >
                            Add files
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              append_folders();
                            }}
                            className="text-[10px] xl:text-xs text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                            title="Add a folder"
                          >
                            Add folder
                          </button>
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
                      </div>
                      <div
                        className="flex-1 overflow-y-auto pr-1 min-h-0"
                        style={{ scrollbarWidth: "thin" }}
                        onWheel={containScroll}
                      >
                        {selectedFiles.length === 1 ? (
                          <div
                            className="group flex items-center gap-2 p-2 rounded-xl"
                            style={GLASS_INPUT}
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
                              <XIcon className="w-4 h-4 fill-gray-400 hover:fill-red-600" />
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
                                  style={GLASS_INPUT}
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
              <div className="rounded-2xl overflow-hidden flex flex-col" style={GLASS_CARD}>
                <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
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
                      style={GLASS_INPUT}
                      title="Enter the connection code provided by the sender. The code format is typically numbers and words separated by hyphens, like '7-helpful-tiger'."
                    />
                    <button
                      type="submit"
                      className="glass-primary-btn font-medium flex items-center justify-center gap-1 px-2 py-1 text-white text-xs xl:text-sm rounded-2xl transition-all cursor-pointer flex-shrink-0"
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
                        onWheel={containScroll}
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
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
                  >
                    Sent
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs">
                <input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search filename"
                  className="px-2 py-1 rounded-xl border border-gray-200 bg-white/60 focus:outline-none focus:ring-1 focus:ring-blue-400/60"
                  style={{ minWidth: "120px" }}
                />
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryDateMode((m) => (m === "after" ? "before" : "after"));
                      setDateButtonAnimating(true);
                      setTimeout(() => setDateButtonAnimating(false), 200);
                    }}
                    className={`px-2 py-1 border border-gray-200 bg-white/60 hover:bg-white/80 hover:cursor-pointer transition-colors rounded-l-xl ${
                      dateButtonAnimating ? "filter-button-click" : ""
                    }`}
                  >
                    {historyDateMode === "after" ? "After" : "Before"}
                  </button>
                  <input
                    type="date"
                    value={historyDateFrom}
                    onChange={(e) => setHistoryDateFrom(e.target.value)}
                    className="px-2 py-1 border border-l-0 border-gray-200 bg-white/60 focus:outline-none focus:ring-1 focus:ring-blue-400/60 rounded-r-xl hover:cursor-pointer"
                  />
                </div>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setHistorySizeMode((m) => (m === "atLeast" ? "atMost" : "atLeast"));
                      setSizeButtonAnimating(true);
                      setTimeout(() => setSizeButtonAnimating(false), 200);
                    }}
                    className={`px-2 py-1 border border-gray-200 bg-white/60 hover:bg-white/80 hover:cursor-pointer transition-colors rounded-l-xl ${
                      sizeButtonAnimating ? "filter-button-click" : ""
                    }`}
                  >
                    {historySizeMode === "atLeast" ? "≥ MB" : "≤ MB"}
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={historyMinSizeMb}
                    onChange={(e) => setHistoryMinSizeMb(e.target.value)}
                    placeholder="MB"
                    className="w-20 px-2 py-1 border border-l-0 border-gray-200 bg-white/60 focus:outline-none focus:ring-1 focus:ring-blue-400/60 rounded-r-xl hover:cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={GLASS_CARD}>
              <div
                className="grid grid-cols-[2fr_1fr_1fr] select-none border-b border-gray-200 px-2 sm:px-3 py-1.5 text-[9px] sm:text-[10px] xl:text-xs font-semibold text-gray-600 uppercase tracking-wide flex-shrink-0"
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
                onWheel={containScroll}
              >
                {historyTab === "received" ? (
                  receivedFiles.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {receivedFiles
                        .slice()
                        .reverse()
                        .filter((file) => {
                          const nameMatch = historySearch
                            ? file.file_name.toLowerCase().includes(historySearch.toLowerCase())
                            : true;

                          let sizeMatch = true;
                          if (historyMinSizeMb.trim() !== "") {
                            const mb = Number(historyMinSizeMb);
                            if (!Number.isNaN(mb) && mb > 0) {
                              const threshold = mb * 1024 * 1024;
                              sizeMatch =
                                historySizeMode === "atLeast"
                                  ? file.file_size >= threshold
                                  : file.file_size <= threshold;
                            }
                          }

                          let dateMatch = true;
                          if (historyDateFrom) {
                            const boundary = new Date(historyDateFrom);
                            const when = new Date(file.download_time);
                            if (!Number.isNaN(boundary.getTime())) {
                              dateMatch =
                                historyDateMode === "after" ? when >= boundary : when <= boundary;
                            }
                          }

                          return nameMatch && sizeMatch && dateMatch;
                        })
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
                      .filter((file) => {
                        const nameMatch = historySearch
                          ? file.file_name.toLowerCase().includes(historySearch.toLowerCase())
                          : true;

                        let sizeMatch = true;
                        if (historyMinSizeMb.trim() !== "") {
                          const mb = Number(historyMinSizeMb);
                          if (!Number.isNaN(mb) && mb > 0) {
                            const threshold = mb * 1024 * 1024;
                            sizeMatch =
                              historySizeMode === "atLeast"
                                ? file.file_size >= threshold
                                : file.file_size <= threshold;
                          }
                        }

                        let dateMatch = true;
                        if (historyDateFrom) {
                          const boundary = new Date(historyDateFrom);
                          const when = new Date(file.send_time);
                          if (!Number.isNaN(boundary.getTime())) {
                            dateMatch =
                              historyDateMode === "after" ? when >= boundary : when <= boundary;
                          }
                        }

                        return nameMatch && sizeMatch && dateMatch;
                      })
                      .map((file, idx) => {
                        const fileWithPaths: { file_paths: string[] } & Omit<
                          SentFile,
                          "file_path" | "file_paths"
                        > = {
                          ...file,
                          file_paths: file.file_paths || (file.file_path ? [file.file_path] : []),
                        };
                        return (
                          <SentFileCard
                            key={idx}
                            {...fileWithPaths}
                            onResend={(paths) => prepare_resend_from_history(paths)}
                          />
                        );
                      })}
                  </div>
                ) : (
                  <div className="flex itemsCenter justify-center h-48 sm:h-64 text-xs sm:text-sm text-gray-400">
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
