import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileIcon } from "./FileIcon";

type Props = {
  connection_type: string;
  download_time: string;
  download_url: string;
  file_extension: string;
  file_name: string;
  file_size: number;
  peer_address: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const ReceiveFileCard = ({
  connection_type,
  download_time,
  download_url,
  file_extension,
  file_name,
  file_size,
  peer_address,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="grid grid-cols-[2fr_1fr_1fr] items-center select-none px-2 sm:px-4 py-2 sm:py-3 cursor-pointer text-gray-700 transition-all duration-200 border-b border-white/20 last:border-b-0 group m-0"
        style={{ background: "transparent" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(239, 246, 255, 0.4)";
          e.currentTarget.style.backdropFilter = "blur(8px)";
          e.currentTarget.style.setProperty("-webkit-backdrop-filter", "blur(8px)");
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.backdropFilter = "none";
          e.currentTarget.style.setProperty("-webkit-backdrop-filter", "none");
        }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 font-medium truncate text-[10px] sm:text-xs xl:text-sm">
          <FileIcon fileName={`${file_name}.${file_extension}`} className="w-4 h-4 flex-shrink-0" />
          <span>{file_name}</span>
        </div>
        <div className="text-[9px] sm:text-[10px] xl:text-xs text-gray-500">.{file_extension}</div>
        <div className="text-[9px] sm:text-[10px] xl:text-xs font-medium text-gray-600">
          {formatFileSize(file_size)}
        </div>
      </div>
      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="rounded-3xl w-full max-w-md overflow-hidden"
              style={{
                background: "rgba(255, 255, 255, 0.85)",
                backdropFilter: "blur(40px)",
                WebkitBackdropFilter: "blur(40px)",
                border: "1px solid rgba(255, 255, 255, 0.5)",
                boxShadow:
                  "0 8px 32px 0 rgba(31, 38, 135, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex-shrink-0 p-2 bg-purple-50 rounded-xl">
                      <FileIcon
                        fileName={`${file_name}.${file_extension}`}
                        className="w-5 h-5 text-purple-600"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {file_name}.{file_extension}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">Received file</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                    title="Close (Esc)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 16 16"
                      className="fill-gray-500 hover:fill-gray-700"
                    >
                      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-5 space-y-4">
                {/* File Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Size</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatFileSize(file_size)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Extension</p>
                    <p className="text-sm font-semibold text-gray-900">.{file_extension}</p>
                  </div>
                </div>

                {/* Download Path - Refined */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2.5 uppercase tracking-wide">
                    Downloaded To
                  </p>
                  <div
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: "rgba(255, 255, 255, 0.7)",
                      backdropFilter: "blur(16px)",
                      WebkitBackdropFilter: "blur(16px)",
                      border: "1px solid rgba(255, 255, 255, 0.5)",
                      boxShadow:
                        "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                    }}
                  >
                    <p className="text-sm font-mono text-gray-900 break-words whitespace-pre-wrap">
                      {download_url}
                    </p>
                  </div>
                </div>

                {/* Connection Info */}
                <div className="pt-2 border-t border-white/20">
                  <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
                    Connection
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">IP Address</p>
                      <p className="text-sm font-semibold text-gray-900 truncate">{peer_address}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Type</p>
                      <p className="text-sm font-semibold text-gray-900">{connection_type}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">Downloaded</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(download_time).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default ReceiveFileCard;
