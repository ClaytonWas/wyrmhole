import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FileIcon } from "./FileIcon";

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

    // Handle Escape key to close modal
    useEffect(() => {
        if (!isOpen) return;
        
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);
    
    return (
        <>
            <div 
                onClick={() => setIsOpen(true)} 
                className="grid grid-cols-[1fr_auto] items-center gap-2 px-2 py-1.5 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-yellow-50/50 transition-colors bg-yellow-50/30 rounded"
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
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3 h-3">
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
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3 h-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
            {isOpen && createPortal(
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="flex-shrink-0 p-2 bg-yellow-50 rounded-xl">
                                        <FileIcon fileName={file_name} className="w-5 h-5 text-yellow-600" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-base font-semibold text-gray-900 truncate">{file_name}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">File offer</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                                    title="Close (Esc)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" className="fill-gray-500 hover:fill-gray-700">
                                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="px-6 py-5 space-y-4">
                            {/* File Info */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Size</p>
                                    <p className="text-sm font-semibold text-gray-900">{formatBytes(file_size)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Filename</p>
                                    <p className="text-sm font-semibold text-gray-900 truncate" title={file_name}>{file_name || 'Unknown'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Actions - Refined */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex gap-3">
                            <button
                                onClick={() => {
                                    onAccept(id);
                                    setIsOpen(false);
                                }}
                                className="flex-1 px-4 py-2.5 bg-white border-2 border-green-200 text-green-600 text-sm font-semibold rounded-xl hover:bg-green-50 hover:border-green-300 active:bg-green-100 transition-all duration-200 shadow-sm hover:shadow flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                Accept
                            </button>
                            <button
                                onClick={() => {
                                    onDeny(id);
                                    setIsOpen(false);
                                }}
                                className="flex-1 px-4 py-2.5 bg-white border-2 border-red-200 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-50 hover:border-red-300 active:bg-red-100 transition-all duration-200 shadow-sm hover:shadow flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Deny
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default PendingFileOfferCard;

