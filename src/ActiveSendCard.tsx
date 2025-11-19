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
                className={`grid grid-cols-4 items-center gap-2 px-2 py-2 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors ${hasError ? "bg-red-50" : ""}`}
            >
                <div className={`text-sm truncate ${hasError ? "text-red-700" : "text-gray-700"}`}>
                    {file_name}
                </div>
                <div className="flex-1">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                            className={`${progressBarColor} h-2 rounded-full transition-all duration-300`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                        ></div>
                    </div>
                    {hasError && (
                        <div className="text-xs text-red-600 mt-1 truncate" title={error}>
                            {error}
                        </div>
                    )}
                </div>
                <div className={`text-sm text-center ${hasError ? "text-red-600" : "text-gray-600"}`}>
                    {percentage}%
                </div>
                <div className={`text-sm text-right flex items-center justify-end gap-2 ${hasError ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                    {status}
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
                <div className="fixed inset-0 bg-gray-500/50 flex items-center justify-center z-50" onClick={() => setIsOpen(false)}>
                    <div className="bg-gray-100 rounded-lg shadow-lg w-1/2 py-1 px-2 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="items-center">
                            <div className="justify-between items-center flex">
                                <span className="flex gap-2 items-center">
                                    <p>Sending File: </p>
                                    <p>{file_name}</p>
                                </span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" onClick={() => setIsOpen(false)} className="cursor-pointer p-0.5 fill-black hover:fill-gray-500 active:fill-red-500 transition-colors">
                                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                                </svg>
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-sm xl:text-base text-gray-700 bg-gray-200 rounded-md mb-1 pl-1">File Information:</p>
                            <div className="grid grid-rows-2 xl:grid-cols-2 gap-x-5 gap-y-1">
                                <div className="flex justify-between mx-2">
                                    <p className="text-sm xl:text-base text-gray-500">Filename:</p>
                                    <p className="text-sm xl:text-base text-gray-900">{file_name || 'No provided filename.'}</p>
                                </div>
                                <div className="flex justify-between mx-2">
                                    <p className="text-sm xl:text-base text-gray-600">Size:</p>
                                    <p className="text-sm xl:text-base text-gray-900">{formatBytes(total)}</p>
                                </div>
                                <div className="flex justify-between mx-2">
                                    <p className="text-sm xl:text-base text-gray-500">Progress:</p>
                                    <p className="text-sm xl:text-base text-gray-900">{percentage}% ({formatBytes(sent)} / {formatBytes(total)})</p>
                                </div>
                                <div className="flex justify-between mx-2">
                                    <p className="text-sm xl:text-base text-gray-500">Status:</p>
                                    <p className="text-sm xl:text-base text-gray-900">{status}</p>
                                </div>
                            </div>
                            {error && (
                                <div className="mt-2 mx-2">
                                    <p className="text-sm xl:text-base text-red-600 bg-red-50 rounded-md p-2">Error: {error}</p>
                                </div>
                            )}
                        </div>
                        {code && (
                            <div className="mt-4">
                                <p className="text-sm xl:text-base text-gray-700 bg-gray-200 rounded-md mb-1 pl-1">Connection Code:</p>
                                <div className="mx-2">
                                    <input 
                                        type="text" 
                                        readOnly 
                                        value={code} 
                                        className="w-full text-sm xl:text-base text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 cursor-pointer hover:bg-gray-50 active:bg-blue-50 transition-colors"
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
                            <div className="mt-4 mx-2">
                                <button
                                    onClick={handleCancel}
                                    className="w-full bg-red-500 text-white px-4 py-2 rounded text-sm hover:bg-red-600 active:bg-red-700 transition-colors"
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

