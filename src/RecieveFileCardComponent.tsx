import { useState } from "react";
import { createPortal } from "react-dom";

type Props = {
    connection_type: any;
    download_time: any;
    download_url: any;
    file_extension: any;
    file_name: any;
    file_size: any;
    peer_address: any;
};

function format_file_size(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const ReceiveFileCard = ({ connection_type, download_time, download_url, file_extension, file_name, file_size, peer_address }: Props) => {
    const [isOpen, setIsOpen] = useState(false);

    
    return (
        <>
            <div onClick={() => setIsOpen(true)} className="grid grid-cols-3 items-center select-none px-2 sm:px-4 py-2 sm:py-3 cursor-pointer text-gray-700 hover:bg-gray-50 hover:text-gray-900 active:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0">
                <div className="font-medium truncate text-xs sm:text-sm">{file_name}</div>
                <div className="text-[10px] sm:text-sm text-gray-500">.{file_extension}</div>
                <div className="text-[10px] sm:text-sm font-medium text-gray-600">{format_file_size(file_size)}</div>
            </div>
            {isOpen && createPortal(
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setIsOpen(false)}>
                    <div className="bg-white rounded-lg sm:rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 z-10">
                            <div className="flex justify-between items-center gap-2">
                                <div className="flex gap-1 sm:gap-2 items-center min-w-0 flex-1">
                                    <h3 className="text-base sm:text-lg font-semibold text-gray-800 whitespace-nowrap">Received File</h3>
                                    <span className="text-gray-600 font-medium truncate text-xs sm:text-sm">{file_name}.{file_extension}</span>
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
                        {/* Modal Body */}
                        <div className="px-3 sm:px-6 py-3 sm:py-4">
                            <div className="mb-4 sm:mb-6">
                                <p className="text-xs sm:text-sm font-semibold text-gray-700 bg-gray-100 rounded-md mb-2 sm:mb-3 px-2 sm:px-3 py-1.5 sm:py-2">File Information</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
                                    <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                        <p className="text-xs sm:text-sm font-medium text-gray-600">Filename:</p>
                                        <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate ml-2">{file_name || 'No provided filename.'}</p>
                                    </div>
                                    <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                        <p className="text-xs sm:text-sm font-medium text-gray-600">Extension:</p>
                                        <p className="text-xs sm:text-sm font-semibold text-gray-900">.{file_extension}</p>
                                    </div>
                                    <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                        <p className="text-xs sm:text-sm font-medium text-gray-600">Size:</p>
                                        <p className="text-xs sm:text-sm font-semibold text-gray-900">{format_file_size(file_size)}</p>
                                    </div>
                                    <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                        <p className="text-xs sm:text-sm font-medium text-gray-600">Downloaded Time:</p>
                                        <p className="text-xs sm:text-sm font-semibold text-gray-900">{new Date(download_time).toLocaleString()}</p>
                                    </div>
                                </div>
                                <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-gray-50 rounded-lg">
                                    <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-2">Downloaded To:</p>
                                    <textarea 
                                        readOnly 
                                        rows={2} 
                                        value={download_url} 
                                        className="w-full resize-none text-xs sm:text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div className="border-t border-gray-200 pt-4 sm:pt-6">
                                <p className="text-xs sm:text-sm font-semibold text-gray-700 bg-gray-100 rounded-md mb-2 sm:mb-3 px-2 sm:px-3 py-1.5 sm:py-2">Connection Information</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
                                    <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                        <p className="text-xs sm:text-sm font-medium text-gray-600">IP Address:</p>
                                        <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate ml-2">{peer_address}</p>
                                    </div>
                                    <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                                        <p className="text-xs sm:text-sm font-medium text-gray-600">Connection Type:</p>
                                        <p className="text-xs sm:text-sm font-semibold text-gray-900">{connection_type}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ReceiveFileCard;
