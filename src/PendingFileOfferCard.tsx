import { useState } from "react";
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
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setIsOpen(false)}>
                    <div className="bg-white rounded-lg sm:rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 z-10">
                            <div className="flex justify-between items-center gap-2">
                                <div className="flex gap-1 sm:gap-2 items-center min-w-0 flex-1">
                                    <FileIcon fileName={file_name} className="w-5 h-5 flex-shrink-0" />
                                    <h3 className="text-base sm:text-lg xl:text-xl font-semibold text-gray-800 whitespace-nowrap">File Offer</h3>
                                    <span className="text-gray-600 font-medium truncate text-xs sm:text-sm xl:text-base">{file_name}</span>
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
                            <p className="text-xs sm:text-sm xl:text-base font-semibold text-gray-700 bg-gray-100 rounded-md mb-2 sm:mb-3 px-2 sm:px-3 py-1.5 sm:py-2">File Information</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
                                <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                    <p className="text-xs sm:text-sm xl:text-base font-medium text-gray-600">Filename:</p>
                                    <p className="text-xs sm:text-sm xl:text-base font-semibold text-gray-900 truncate ml-2">{file_name || 'No provided filename.'}</p>
                                </div>
                                <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                    <p className="text-xs sm:text-sm xl:text-base font-medium text-gray-600">Size:</p>
                                    <p className="text-xs sm:text-sm xl:text-base font-semibold text-gray-900">{formatBytes(file_size)}</p>
                                </div>
                            </div>
                        </div>
                        <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex gap-2 sm:gap-3">
                            <button
                                onClick={() => {
                                    onAccept(id);
                                    setIsOpen(false);
                                }}
                                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm xl:text-base transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                Accept File
                            </button>
                            <button
                                onClick={() => {
                                    onDeny(id);
                                    setIsOpen(false);
                                }}
                                className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm xl:text-base transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Deny File
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

