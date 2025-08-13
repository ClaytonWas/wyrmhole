type ReceiveFileCardProps = {
    file_name: string;
    file_extension: string;
    file_size: number;
};

const ReceiveFileCard = ({ file_name, file_extension, file_size }: ReceiveFileCardProps) => {
    return (
        <li className="flex gap-10 mr-2 p-2 rounded-lg relative cursor-pointer border-2 border-gray-100 bg-gray-50 hover:bg-gray-200 hover:border-gray-200 active:bg-blue-200 active:border-blue-300 transition-colors drop-shadow-md">
            <img src="https://encrypted-tbn2.gstatic.com/licensed-image?q=tbn:ANd9GcQJRbZHXi0rllmLWSuEVhfFzUT_CBCTAPX2C2VYDyIlUZiE8jv92w6ghGPV00-OZU7YNxDr06qPQzJ6b5YjSNLC6-6KZ2x9J0EWu4TiNMKAg-OaCx8" alt={file_name} className="w-12 h-12 select-none object-cover" />
            <div>
                <p className="text-sm select-none">{file_name}</p>
                <div className="flex items-center justify-between select-none gap-2">
                    <p className="text-xs text-gray-500">Type:</p>
                    <p className="text-xs">{file_extension}</p>
                </div>
                <div className="flex items-center justify-between select-none gap-2">
                    <p className="text-xs text-gray-500">Size:</p>
                    <p className="text-xs">{file_size} bytes</p>
                </div>
            </div>
        </li>
    )
}

export default ReceiveFileCard;