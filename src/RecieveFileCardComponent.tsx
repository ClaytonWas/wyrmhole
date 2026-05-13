import { useState } from "react";
import { FileIcon } from "./FileIcon";
import { DetailModal } from "./DetailModal";

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

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="grid grid-cols-[2fr_1fr_1fr] items-center select-none px-2 sm:px-4 py-2 sm:py-3 cursor-pointer text-gray-700 transition-all duration-200 border-b border-white/20 last:border-b-0 group m-0 bg-transparent hover:bg-[rgba(239,246,255,0.4)] hover:backdrop-blur-sm"
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
      <DetailModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        iconSlot={
          <div className="flex-shrink-0 p-2 bg-purple-50 rounded-xl">
            <FileIcon
              fileName={`${file_name}.${file_extension}`}
              className="w-5 h-5 text-purple-600"
            />
          </div>
        }
        title={`${file_name}.${file_extension}`}
        subtitle="Received file"
      >
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
      </DetailModal>
    </>
  );
};

export default ReceiveFileCard;
