import { useState } from "react";
import { FileIcon } from "./FileIcon";
import { DetailModal } from "./DetailModal";

type Props = {
  id: string;
  file_name: string;
  file_size?: number;
  onAccept: (id: string) => void;
  onDeny: (id: string) => void;
};

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return "Unknown size";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const PendingFileOfferCard = ({ id, file_name, file_size, onAccept, onDeny }: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="grid grid-cols-[1fr_auto] items-center gap-2 px-2 py-1.5 border-b border-gray-200 last:border-b-0 cursor-pointer transition-all rounded-xl bg-[rgba(254,252,232,0.4)] hover:bg-[rgba(254,252,232,0.6)]"
        style={{
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgb(229, 231, 235)",
        }}
      >
        <div className="flex items-center gap-1.5 text-gray-700 min-w-0">
          <FileIcon fileName={file_name} className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[11px] xl:text-xs truncate font-medium">{file_name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAccept(id);
            }}
            className="p-1 bg-green-600 hover:bg-green-700 text-white text-[10px] rounded transition-colors cursor-pointer"
            title="Accept"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
              className="w-3 h-3"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeny(id);
            }}
            className="p-1 bg-red-600 hover:bg-red-700 text-white text-[10px] rounded transition-colors cursor-pointer"
            title="Deny"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
              className="w-3 h-3"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <DetailModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        iconSlot={
          <div className="flex-shrink-0 p-2 bg-yellow-50 rounded-xl">
            <FileIcon fileName={file_name} className="w-5 h-5 text-yellow-600" />
          </div>
        }
        title={file_name}
        subtitle="File offer"
        footer={
          <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
            <button
              onClick={() => {
                onAccept(id);
                setIsOpen(false);
              }}
              className="modal-btn-success flex-1 px-4 py-2.5 text-green-600 text-sm font-semibold rounded-2xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Accept
            </button>
            <button
              onClick={() => {
                onDeny(id);
                setIsOpen(false);
              }}
              className="modal-btn-danger flex-1 px-4 py-2.5 text-red-600 text-sm font-semibold rounded-2xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Deny
            </button>
          </div>
        }
      >
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Size</p>
              <p className="text-sm font-semibold text-gray-900">{formatBytes(file_size)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Filename</p>
              <p className="text-sm font-semibold text-gray-900 truncate" title={file_name}>
                {file_name || "Unknown"}
              </p>
            </div>
          </div>
        </div>
      </DetailModal>
    </>
  );
};

export default PendingFileOfferCard;
