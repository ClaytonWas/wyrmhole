import { useState } from "react";

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
            <div onClick={() => setIsOpen(true)} className="grid grid-cols-3 items-center select-none rounded px-2 cursor-pointer text-gray-600 hover:bg-gray-100 hover:text-gray-950 active:bg-blue-200 transition-colors">
                <div className="">{file_name}</div>
                <div className="text-sm">.{file_extension}</div>
                <div className="text-sm">{format_file_size(file_size)}</div>
            </div>
            {isOpen && (
                <div className="fixed inset-0 bg-gray-500/10 flex items-center justify-center z-50">
                    <div className="bg-gray-100 rounded-lg shadow-lg w-1/2 py-1 px-2 overflow-x-auto">
                        {/* Modal Header */}
                        <div className="items-center">
                            <div className="justify-between items-center flex">
                                <span className="flex gap-2 items-center">
                                    <p>Recevied File: </p>
                                    <p>{file_name}.{file_extension}</p>
                                </span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" onClick={() => setIsOpen(false)} className="cursor-pointer p-0.5 fill-black hover:fill-gray-500 active:fill-red-500 transition-colors">
                                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                                </svg>
                            </div>
                        </div>
                        {/* Modal Body */}
                        <div>

                            <div>
                                <p className="text-sm xl:text-base text-gray-700 bg-gray-200 rounded-md mb-1 pl-1">File Information:</p>
                                <div className="grid grid-rows-2 xl:grid-cols-2 gap-x-5 gap-y-1">
                                    <div className="flex justify-between mx-2">
                                        <p className="text-sm xl:text-base text-gray-500">Filename:</p>
                                        <p className="text-sm xl:text-base text-gray-900">{file_name || 'No provided filename.'}</p>
                                    </div>
                                    <div className="flex justify-between mx-2">
                                        <p className="text-sm xl:text-base text-gray-500">Extension:</p>
                                        <p className="text-sm xl:text-base text-gray-900">.{file_extension}</p>
                                    </div>
                                    <div className="flex justify-between mx-2">
                                        <p className="text-sm xl:text-base text-gray-600">Size:</p>
                                        <p className="text-sm xl:text-base text-gray-900">{format_file_size(file_size)}</p>
                                    </div>
                                    <div className="flex justify-between mx-2">
                                        <p className="text-sm xl:text-base text-gray-500">Downloaded Time:</p>
                                        <p className="text-sm xl:text-base text-gray-900">{new Date(download_time).toLocaleString()}</p>
                                    </div>
                                </div>
                                <div className="flex justify-between mx-2 mt-1">
                                    <p className="text-sm xl:text-base text-gray-500">Downloaded To:</p>
                                    <textarea readOnly rows={1} value={download_url} className="resize-none xl:w-1/2 text-sm xl:text-base text-gray-900"/>
                                </div>
                            </div>
                            <div className="mt-4">
                                <p className="text-sm xl:text-base text-gray-700 bg-gray-200 rounded-md mb-1 pl-1">Connection Information:</p>
                                <div className="grid grid-rows-2 xl:grid-cols-2 gap-x-5 gap-y-1">
                                    <div className="flex justify-between mx-2">
                                        <p className="text-sm xl:text-base text-gray-500">IP Address:</p>
                                        <p className="text-sm xl:text-base text-gray-900 lg:overflow-x-hidden">{peer_address}</p>
                                    </div>
                                    <div className="flex justify-between mx-2">
                                        <p className="text-sm xl:text-base text-gray-500">Connection Type:</p>
                                        <p className="text-sm xl:text-base text-gray-900">{connection_type}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default ReceiveFileCard;
