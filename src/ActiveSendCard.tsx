import { useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";

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

const ActiveSendCard = ({ id, file_name, sent, total, percentage, error, code, status: statusProp, onDismiss }: Props) => {
    const [isOpen, setIsOpen] = useState(false);
    const hasError = !!error;
    
    // Determine status text based on statusProp
    let statusText = "Preparing..."; // Default to "Preparing..." instead of "Sending..."
    if (hasError) {
        statusText = "Failed";
    } else if (percentage >= 100) {
        statusText = "Completed";
    } else if (statusProp === "preparing") {
        statusText = "Preparing...";
    } else if (statusProp === "waiting") {
        statusText = "Waiting...";
    } else if (statusProp === "packaging") {
        statusText = "Packaging...";
    } else if (statusProp === "sending") {
        statusText = "Sending...";
    }
    
    const status = statusText;
    const progressBarColor = hasError ? "bg-red-600" : "bg-green-600";
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
                className={`grid grid-cols-4 items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${hasError ? "bg-red-50/50 hover:bg-red-50" : ""}`}
            >
                <div className={`text-xs sm:text-sm truncate ${hasError ? "text-red-700" : "text-gray-700"}`}>
                    {file_name}
                </div>
                <div className="flex-1 hidden sm:block">
                    <div className="w-full bg-gray-200 rounded-full h-2 sm:h-2.5 shadow-inner">
                        <div 
                            className={`${progressBarColor} h-2 sm:h-2.5 rounded-full transition-all duration-300 shadow-sm`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                        ></div>
                    </div>
                    {hasError && (
                        <div className="text-[10px] sm:text-xs text-red-600 mt-1 truncate" title={error}>
                            {error}
                        </div>
                    )}
                </div>
                <div className={`text-[10px] sm:text-sm text-center ${hasError ? "text-red-600" : "text-gray-600"}`}>
                    {percentage}%
                </div>
                <div className={`text-[10px] sm:text-sm text-right flex items-center justify-end gap-1 sm:gap-2 ${hasError ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                    <span className="hidden sm:inline">{status}</span>
                    <span className="sm:hidden truncate">{status.substring(0, 4)}</span>
                    {hasError && onDismiss && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismiss(id);
                            }}
                            className="text-red-600 hover:text-red-800 active:text-red-900 cursor-pointer"
                            title="Dismiss"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                            </svg>
                        </button>
                    )}
                </div>
            </div>
            {isOpen && createPortal(
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setIsOpen(false)}>
                    <div className="bg-white rounded-lg sm:rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 z-10">
                            <div className="flex justify-between items-center gap-2">
                                <div className="flex gap-1 sm:gap-2 items-center min-w-0 flex-1">
                                    <h3 className="text-base sm:text-lg font-semibold text-gray-800 whitespace-nowrap">Sending File</h3>
                                    <span className="text-gray-600 font-medium truncate text-xs sm:text-sm">{file_name}</span>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                                    title="Close"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" className="fill-gray-500 hover:fill-gray-700">
                                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="px-3 sm:px-6 py-3 sm:py-4">
                            <p className="text-xs sm:text-sm font-semibold text-gray-700 bg-gray-100 rounded-md mb-2 sm:mb-3 px-2 sm:px-3 py-1.5 sm:py-2">File Information</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
                                <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                    <p className="text-xs sm:text-sm font-medium text-gray-600">Filename:</p>
                                    <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate ml-2">{file_name || 'No provided filename.'}</p>
                                </div>
                                <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                    <p className="text-xs sm:text-sm font-medium text-gray-600">Size:</p>
                                    <p className="text-xs sm:text-sm font-semibold text-gray-900">{formatBytes(total)}</p>
                                </div>
                                <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                    <p className="text-xs sm:text-sm font-medium text-gray-600">Progress:</p>
                                    <p className="text-xs sm:text-sm font-semibold text-gray-900">{percentage}% ({formatBytes(sent)} / {formatBytes(total)})</p>
                                </div>
                                <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                    <p className="text-xs sm:text-sm font-medium text-gray-600">Status:</p>
                                    <p className="text-xs sm:text-sm font-semibold text-gray-900">{status}</p>
                                </div>
                            </div>
                            {error && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm text-red-800 font-medium">Error: {error}</p>
                                </div>
                            )}
                        </div>
                        {code && (
                            <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50">
                                <p className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">Connection Code</p>
                                <div>
                                    <input 
                                        type="text" 
                                        readOnly 
                                        value={code} 
                                        className="w-full text-xs sm:text-base font-mono text-gray-900 bg-white border-2 border-gray-300 rounded-lg px-2 sm:px-4 py-2 sm:py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                        onClick={async (e) => {
                                            const input = e.target as HTMLInputElement;
                                            input.select();
                                            try {
                                                await navigator.clipboard.writeText(code);
                                                toast.success("Code copied to clipboard");
                                            } catch (err) {
                                                console.error("Failed to copy:", err);
                                            }
                                        }}
                                        title="Click to copy"
                                    />
                                </div>
                            </div>
                        )}
                        {!isComplete && !hasError && (
                            <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-gray-200">
                                <button
                                    onClick={handleCancel}
                                    className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800 text-white font-semibold px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm transition-all duration-200 shadow-sm hover:shadow-md"
                                >
                                    Cancel Send
                                </button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ActiveSendCard;

