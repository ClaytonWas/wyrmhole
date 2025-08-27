type Props = {
    file_name: string;
    file_extension: string;
    file_size: number;
};

function format_file_size(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const ReceiveFileCard = ({ file_name, file_extension, file_size }: Props) => {
    return (
        <div className="grid grid-cols-3 select-none rounded px-2 cursor-pointer bg-gray-50 text-gray-600 hover:bg-gray-200 hover:text-gray-950 active:bg-blue-200 transition-colors">
            <div className="">{file_name}</div>
            <div className="text-sm">.{file_extension}</div>
            <div className="text-sm">{format_file_size(file_size)}</div>
        </div>
    )
}

export default ReceiveFileCard;