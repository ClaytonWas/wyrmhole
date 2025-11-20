import { useState } from "react";
import { createPortal } from "react-dom";
import { LoadingDots } from "./LoadingDots";

type Props = {
    code: string;
    onCancel: (code: string) => void;
};

const ConnectingCard = ({ code, onCancel }: Props) => {
    const [isOpen, setIsOpen] = useState(false);
    
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
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setIsOpen(false)}>
                    <div className="bg-white rounded-lg sm:rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 z-10">
                            <div className="flex justify-between items-center gap-2">
                                <div className="flex gap-1 sm:gap-2 items-center min-w-0 flex-1">
                                    <div className="animate-spin flex-shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 text-blue-600">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                        </svg>
                                    </div>
                                    <h3 className="text-base sm:text-lg xl:text-xl font-semibold text-gray-800 whitespace-nowrap">Connecting to Sender</h3>
                                    <span className="text-gray-600 font-medium truncate text-xs sm:text-sm xl:text-base">{code}</span>
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
                            <p className="text-xs sm:text-sm xl:text-base font-semibold text-gray-700 bg-blue-50 rounded-md mb-2 sm:mb-3 px-2 sm:px-3 py-1.5 sm:py-2">Connection Status</p>
                            <div className="p-3 sm:p-4 bg-blue-50 rounded-lg">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="animate-spin">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 text-blue-600">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                        </svg>
                                    </div>
                                    <p className="text-sm sm:text-base xl:text-lg font-medium text-blue-900">
                                        Waiting for file offer
                                        <LoadingDots />
                                    </p>
                                </div>
                                <p className="text-xs sm:text-sm xl:text-base text-blue-700 mt-2">Connection code: <span className="font-semibold">{code}</span></p>
                                <p className="text-xs sm:text-sm xl:text-base text-blue-600 mt-1">Please wait while we establish a connection with the sender.</p>
                            </div>
                        </div>
                        <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex gap-2 sm:gap-3">
                            <button
                                onClick={() => {
                                    onCancel(code);
                                    setIsOpen(false);
                                }}
                                className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm xl:text-base transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
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

