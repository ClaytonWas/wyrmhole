import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { LoadingDots } from "./LoadingDots";

type Props = {
    code: string;
    onCancel: (code: string) => void;
};

const ConnectingCard = ({ code, onCancel }: Props) => {
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
                className="grid grid-cols-[1fr_auto] items-center gap-2 px-2 py-1.5 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-blue-50/50 transition-colors bg-blue-50/30 rounded"
            >
                <div className="flex items-center gap-1.5 text-gray-700 min-w-0">
                    <div className="animate-spin flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3.5 h-3.5 text-blue-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                    </div>
                    <span className="text-[11px] xl:text-xs truncate font-medium">Connecting: <span className="font-semibold">{code}</span></span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onCancel(code);
                        }}
                        className="p-1 bg-red-600 hover:bg-red-700 text-white text-[10px] rounded transition-colors cursor-pointer"
                        title="Cancel"
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
                                    <div className="flex-shrink-0 p-2 bg-blue-50 rounded-xl">
                                        <div className="animate-spin">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 text-blue-600">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                            </svg>
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-base font-semibold text-gray-900 truncate">Connecting to Sender</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Connection code: {code}</p>
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
                            {/* Status */}
                            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                <div className="animate-spin flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 text-blue-600">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-blue-900">
                                        Waiting for file offer
                                        <LoadingDots />
                                    </p>
                                    <p className="text-xs text-blue-600 mt-1">Please wait while we establish a connection with the sender.</p>
                                </div>
                            </div>

                            {/* Connection Code - Refined */}
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-2.5 uppercase tracking-wide">Connection Code</p>
                                <div className="relative group">
                                    <input 
                                        type="text" 
                                        readOnly 
                                        value={code} 
                                        className="w-full text-sm font-mono text-gray-900 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl px-4 py-3 pr-10 cursor-pointer hover:border-blue-300 hover:from-blue-50 hover:to-blue-100/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
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
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" className="fill-gray-400">
                                            <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                                            <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cancel Button - Refined */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                            <button
                                onClick={() => {
                                    onCancel(code);
                                    setIsOpen(false);
                                }}
                                className="w-full px-4 py-2.5 bg-white border-2 border-red-200 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-50 hover:border-red-300 active:bg-red-100 transition-all duration-200 shadow-sm hover:shadow flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Cancel Connection
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ConnectingCard;

