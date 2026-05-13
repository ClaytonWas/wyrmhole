import { useState } from "react";
import { FileIcon } from "./FileIcon";
import { DetailModal } from "./DetailModal";

type Props = {
  file_name: string;
  file_size: number;
  file_extension: string;
  file_paths: string[];
  send_time: string;
  connection_code: string;
  onResend?: (paths: string[]) => void;
};

function format_file_size(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const SentFileCard = ({
  file_name,
  file_size,
  file_extension,
  file_paths,
  send_time,
  connection_code,
  onResend,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  const displayName = file_name.endsWith(`.${file_extension}`)
    ? file_name.slice(0, -(file_extension.length + 1))
    : file_name;

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="grid grid-cols-[2fr_1fr_1fr] items-center select-none px-2 sm:px-4 py-2 sm:py-3 cursor-pointer text-gray-700 transition-all duration-200 border-b border-gray-200 last:border-b-0 group m-0 bg-transparent hover:bg-[rgba(239,246,255,0.4)] hover:backdrop-blur-sm"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 font-medium truncate text-[10px] sm:text-xs xl:text-sm">
          <FileIcon
            fileName={`${displayName}.${file_extension}`}
            className="w-4 h-4 flex-shrink-0"
          />
          <span>{displayName}</span>
        </div>
        <div className="text-[9px] sm:text-[10px] xl:text-xs text-gray-500">.{file_extension}</div>
        <div className="text-[9px] sm:text-[10px] xl:text-xs font-medium text-gray-600">
          {format_file_size(file_size)}
        </div>
      </div>
      <DetailModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        iconSlot={
          <div className="flex-shrink-0 p-2 bg-blue-50 rounded-xl">
            <FileIcon
              fileName={`${file_name}.${file_extension}`}
              className="w-5 h-5 text-blue-600"
            />
          </div>
        }
        title={`${displayName}.${file_extension}`}
        subtitle="Sent file"
      >
        <div className="px-6 py-5 space-y-4">
                {/* File Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Size</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {format_file_size(file_size)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Extension</p>
                    <p className="text-sm font-semibold text-gray-900">.{file_extension}</p>
                  </div>
                </div>

                {/* Files Sent List */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2.5 uppercase tracking-wide">
                    {file_paths.length === 1 ? "File Sent" : `Files Sent (${file_paths.length})`}
                  </p>
                  {file_paths.length > 0 ? (
                    <div
                      className="space-y-1.5 max-h-48 overflow-y-auto"
                      style={{ scrollbarWidth: "thin" }}
                    >
                      {file_paths.map((path, idx) => {
                        // Extract just the filename from the path
                        const fileName = path.split(/[/\\]/).pop() || path;
                        return (
                          <div
                            key={idx}
                            className="px-3 py-2 text-sm font-mono text-gray-900 rounded-xl"
                            style={{
                              background: "rgba(255, 255, 255, 0.7)",
                              backdropFilter: "blur(16px)",
                              WebkitBackdropFilter: "blur(16px)",
                              border: "1px solid rgb(229, 231, 235)",
                              boxShadow:
                                "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                            }}
                          >
                            {fileName}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No file names available</p>
                  )}
                </div>

                {/* Connection Info */}
                <div className="pt-2 border-t border-gray-200 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Connection
                    </p>
                    {onResend && file_paths.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onResend(file_paths);
                          setIsOpen(false);
                        }}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded-xl transition-colors cursor-pointer"
                        style={{
                          background: "rgba(239, 246, 255, 0.7)",
                          border: "1px solid rgba(191, 219, 254, 0.9)",
                        }}
                      >
                        Re-send
                      </button>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Connection Code</p>
                    <input
                      type="text"
                      readOnly
                      value={connection_code}
                      className="w-full text-sm font-mono text-gray-900 rounded-xl px-4 py-3 cursor-pointer transition-all"
                      style={{
                        background: "rgba(255, 255, 255, 0.7)",
                        backdropFilter: "blur(16px)",
                        WebkitBackdropFilter: "blur(16px)",
                        border: "1px solid rgb(229, 231, 235)",
                        boxShadow:
                          "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.5)";
                        e.currentTarget.style.background = "rgba(239, 246, 255, 0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgb(229, 231, 235)";
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.outline = "none";
                        e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.6)";
                        e.currentTarget.style.boxShadow =
                          "0 0 0 3px rgba(59, 130, 246, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "rgb(229, 231, 235)";
                        e.currentTarget.style.boxShadow =
                          "0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)";
                      }}
                      onClick={async (e) => {
                        const input = e.target as HTMLInputElement;
                        input.select();
                        try {
                          await navigator.clipboard.writeText(connection_code);
                          // You can add a toast here if needed
                        } catch (err) {
                          console.error("Failed to copy:", err);
                        }
                      }}
                      title="Click to copy"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Connection Code</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(send_time).toLocaleString()}
                    </p>
                  </div>
                </div>
        </div>
      </DetailModal>
    </>
  );
};

export default SentFileCard;
