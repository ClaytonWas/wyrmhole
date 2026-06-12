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
  transferred: number;
  total: number;
  percentage: number;
  error?: string;
  onDismiss?: (id: string) => void;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const ActiveDownloadCard = ({
  id,
  file_name,
  transferred,
  total,
  percentage,
  error,
  onDismiss,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasError = !!error;
  const status = hasError ? (
    "Failed"
  ) : percentage >= 100 ? (
    "Completed"
  ) : (
    <>
      Downloading
      <LoadingDots />
    </>
  );
  const progressBarColor = hasError ? "bg-red-600" : "bg-green-600";
  const isComplete = percentage >= 100;

  async function handleCancel() {
    try {
      await invoke("cancel_download", { downloadId: id });
      // Dismiss immediately when cancelled
      if (onDismiss) {
        onDismiss(id);
      }
      setIsOpen(false);
    } catch (err) {
      console.error("Error cancelling download:", err);
      toast.error("Failed to cancel download");
    }
  }

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className={`grid grid-cols-[minmax(0,1fr)_minmax(60px,1fr)_auto_auto] items-center gap-1 sm:gap-2 md:gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b border-gray-200 cursor-pointer transition-all m-0 ${
          hasError ? "bg-red-50" : "bg-transparent hover:bg-gray-50"
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
          <div className="flex-shrink-0 p-2 bg-green-50 rounded-xl">
            <FileIcon fileName={file_name} className="w-5 h-5 text-green-600" />
          </div>
        }
        title={file_name}
        subtitle="Downloading file"
        footer={
          !isComplete && !hasError ? (
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={handleCancel}
                className="modal-btn-danger w-full px-4 py-2.5 text-red-600 text-sm font-semibold rounded-2xl transition-all duration-200"
              >
                Cancel Download
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="px-6 py-5 space-y-4">
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
              {formatBytes(transferred)} / {formatBytes(total)}
            </p>
          </div>

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

          {error && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>
      </DetailModal>
    </>
  );
};

export default ActiveDownloadCard;
