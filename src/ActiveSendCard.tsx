import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { FileIcon } from "./FileIcon";
import { LoadingDots } from "./LoadingDots";
import { DetailModal } from "./DetailModal";
import { XIcon } from "./Icons";

type Props = {
  id: string;
  file_name: string;
  sent: number;
  total: number;
  percentage: number;
  error?: string;
  code?: string;
  status?: string;
  onDismiss?: (id: string) => void;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const ActiveSendCard = ({
  id,
  file_name,
  sent,
  total,
  percentage,
  error,
  code,
  status: statusProp,
  onDismiss,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasError = !!error;

  // Determine status text based on statusProp
  let statusText = "Preparing"; // Default to "Preparing" instead of "Sending..."
  let showDots = false;
  if (hasError) {
    statusText = "Failed";
    showDots = false;
  } else if (percentage >= 100) {
    statusText = "Completed";
    showDots = false;
  } else if (statusProp === "preparing") {
    statusText = "Preparing";
    showDots = true;
  } else if (statusProp === "waiting") {
    statusText = "Waiting";
    showDots = true;
  } else if (statusProp === "packaging") {
    statusText = "Packaging";
    showDots = true;
  } else if (statusProp === "sending") {
    statusText = "Sending";
    showDots = true;
  }

  const status = showDots ? (
    <>
      {statusText}
      <LoadingDots />
    </>
  ) : (
    statusText
  );
  const progressBarColor = hasError ? "bg-red-600" : "bg-blue-600";
  const isComplete = percentage >= 100;

  async function handleCancel() {
    try {
      await invoke("cancel_send", { sendId: id });
      toast.success("Send cancelled");
      if (onDismiss) {
        onDismiss(id);
      }
      setIsOpen(false);
    } catch (err) {
      console.error("Error cancelling send:", err);
      toast.error("Failed to cancel send");
    }
  }

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className={`grid grid-cols-[minmax(0,1fr)_minmax(60px,1fr)_auto_auto] items-center gap-1 sm:gap-2 md:gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b border-white/20 cursor-pointer transition-all m-0 ${
          hasError
            ? "bg-[rgba(254,242,242,0.5)] backdrop-blur-sm"
            : "bg-transparent hover:bg-[rgba(255,255,255,0.3)] hover:backdrop-blur-sm"
        }`}
      >
        <div
          className={`flex items-center gap-1 sm:gap-1.5 md:gap-2 min-w-0 ${hasError ? "text-red-700" : "text-gray-700"}`}
        >
          <FileIcon fileName={file_name} className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span className="text-[10px] sm:text-xs xl:text-sm truncate">{file_name}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2 md:h-2.5 shadow-inner">
            <div
              className={`${progressBarColor} h-1.5 sm:h-2 md:h-2.5 rounded-full transition-all duration-300 shadow-sm`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            ></div>
          </div>
          {hasError && (
            <div
              className="text-[8px] sm:text-[9px] md:text-[10px] xl:text-xs text-red-600 mt-0.5 sm:mt-1 truncate"
              title={error}
            >
              {error}
            </div>
          )}
        </div>
        <div
          className={`text-[8px] sm:text-[9px] md:text-[10px] xl:text-xs text-center whitespace-nowrap ${hasError ? "text-red-600" : "text-gray-600"}`}
        >
          {percentage}%
        </div>
        <div
          className={`text-[8px] sm:text-[9px] md:text-[10px] xl:text-xs text-right flex items-center justify-end gap-0.5 sm:gap-1 md:gap-2 min-w-0 ${hasError ? "text-red-600 font-semibold" : "text-gray-500"}`}
        >
          <span className="flex items-center truncate">{status}</span>
          {hasError && onDismiss && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(id);
              }}
              className="p-1.5 sm:p-2 rounded-md hover:bg-red-100 active:bg-red-200 text-red-600 hover:text-red-800 active:text-red-900 cursor-pointer transition-colors flex items-center justify-center"
              title="Dismiss"
            >
              <XIcon className="w-5 h-5 fill-current" />
            </button>
          )}
        </div>
      </div>
      <DetailModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        iconSlot={
          <div className="flex-shrink-0 p-2 bg-blue-50 rounded-xl">
            <FileIcon fileName={file_name} className="w-5 h-5 text-blue-600" />
          </div>
        }
        title={file_name}
        subtitle="Sending file"
        footer={
          !isComplete && !hasError ? (
            <div className="px-6 py-4 border-t border-white/20">
              <button
                onClick={handleCancel}
                className="modal-btn-danger w-full px-4 py-2.5 text-red-600 text-sm font-semibold rounded-2xl transition-all duration-200"
              >
                Cancel Send
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="px-6 py-5 space-y-4">
                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-sm font-medium text-gray-700">Progress</span>
                    <span className="text-sm font-bold text-gray-900">{percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`${progressBarColor} h-full rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {formatBytes(sent)} / {formatBytes(total)}
                  </p>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Size</p>
                    <p className="text-sm font-semibold text-gray-900">{formatBytes(total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Status</p>
                    <p className="text-sm font-semibold text-gray-900">{status}</p>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {/* Connection Code - Refined */}
                {code && (
                  <div className="pt-2">
                    <p className="text-xs font-medium text-gray-500 mb-2.5 uppercase tracking-wide">
                      Connection Code
                    </p>
                    <div className="relative group">
                      <input
                        type="text"
                        readOnly
                        value={code}
                        className="w-full text-sm font-mono text-gray-900 rounded-xl px-4 py-3 pr-10 cursor-pointer transition-all"
                        style={{
                          background: "rgba(255, 255, 255, 0.7)",
                          backdropFilter: "blur(16px)",
                          WebkitBackdropFilter: "blur(16px)",
                          border: "1px solid rgba(255, 255, 255, 0.5)",
                          boxShadow:
                            "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.5)";
                          e.currentTarget.style.background = "rgba(239, 246, 255, 0.4)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                          e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.outline = "none";
                          e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.6)";
                          e.currentTarget.style.boxShadow =
                            "0 0 0 3px rgba(59, 130, 246, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                          e.currentTarget.style.boxShadow =
                            "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)";
                        }}
                        onClick={async (e) => {
                          const input = e.target as HTMLInputElement;
                          input.select();
                          try {
                            await navigator.clipboard.writeText(code);
                            toast.success("Code copied");
                          } catch (err) {
                            console.error("Failed to copy:", err);
                          }
                        }}
                        title="Click to copy"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          className="fill-gray-400"
                        >
                          <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z" />
                          <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}
        </div>
      </DetailModal>
    </>
  );
};

export default ActiveSendCard;
