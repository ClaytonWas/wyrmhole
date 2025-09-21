import { invoke } from "@tauri-apps/api/core";
import { confirm, open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import ReceiveFileCard from "./RecieveFileCardComponent";
import SettingsMenu from "./SettingsMenu";
import "./App.css";

interface ReceivedFile {
  connection_type: string;
  download_time: string;
  download_url: string;
  file_extension: string;
  file_name: string;
  file_size: number;
  peer_address: string;
}

function App() {
  const [receiveCode, setReceiveCode] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[] | null>(null);
  const [fileInputContextString, setFileInputContextString] = useState("Click to Upload File(s)");
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [showAll, setShowAll] = useState(false);

  async function deny_file_receive(id: string) {
    try {
      await invoke("receiving_file_deny", { id });
      console.log("Denied file:", id);
    } catch (error) {
      console.error("Error denying file:", error);
    }
  }

  async function accept_file_receive(id: string) {
    try {
      await invoke("receiving_file_accept", { id });
      console.log("Accepted file:", id);
      recieved_files_data();
    } catch (error) {
      console.error("Error accepting file:", error);
    }
  }

  async function select_files() {
    try {
      const selected = await open({ multiple: true });
      if (!selected) {
        setSelectedFiles(null);
        setFileInputContextString("Click to Upload File(s)");
        return;
      }

      const files = Array.isArray(selected) ? selected : [selected];
      // Filter out non-strings for safety
      const stringFiles = files.filter(f => typeof f === "string") as string[];
      setSelectedFiles(stringFiles);

      if (stringFiles.length === 1) {
        const fileName = stringFiles[0].split(/[/\\]/).pop() ?? "File Uploaded";
        setFileInputContextString(fileName);
      } else {
        setFileInputContextString(`${stringFiles.length} files selected`);
      }
    } catch (err) {
      console.error("Error selecting files:", err);
    }
  }

  async function send_files() {
    if (!selectedFiles || selectedFiles.length === 0) return;

    if (selectedFiles.length === 1) {
      try {
        const response = await invoke("send_file_call", { filePath: selectedFiles[0] });
        console.log("Sent file:", response);
        toast.success(`Sent ${selectedFiles[0].split(/[/\\]/).pop()}`);
      } catch (err) {
        console.error("Error sending file:", err);
        toast.error("Failed to send file");
      }
    } else {
      console.log("Multiple file send not implemented yet", selectedFiles);
      toast("Multiple file send not implemented yet");
    }
  }

  async function request_file() {
    try {
      const response = await invoke("request_file_call", { receiveCode });
      const data = JSON.parse(response as string);

      if (!data || !data.id || !data.file_name) {
        toast.error("Invalid file offer from backend.");
        return;
      }

      toast((t) => (
        <div className="flex flex-col gap-1">
          <span className="font-bold">File offer received</span>
          <span>{data.file_name} ({data.file_size ?? "unknown"} bytes)</span>
          <div className="flex gap-2 pt-1">
            <button
              onClick={async () => {
                await accept_file_receive(data.id);
                toast.success(`Accepted ${data.file_name}`);
                toast.dismiss(t.id);
              }}
              className="bg-green-500 text-white rounded px-2 py-1 text-sm"
            >
              Accept
            </button>
            <button
              onClick={async () => {
                await deny_file_receive(data.id);
                toast.error(`Denied ${data.file_name}`);
                toast.dismiss(t.id);
              }}
              className="bg-red-500 text-white rounded px-2 py-1 text-sm"
            >
              Deny
            </button>
          </div>
        </div>
      ));
    } catch (e) {
      toast.error("Failed to parse backend response.");
      console.error("Request file error:", e);
    }
  }

  async function recieved_files_data() {
    try {
      const response = await invoke("received_files_data");
      if (Array.isArray(response)) setReceivedFiles(response as ReceivedFile[]);
      else setReceivedFiles([]);
    } catch (error) {
      console.error("Error getting received files data:", error);
    }
  }

  useEffect(() => {
    recieved_files_data();
  }, []);

  return (
    <div className="app-container">
      <Toaster position="bottom-right" reverseOrder={false} />

      <nav>
        <div className="p-4 flex justify-between items-center shadow-md">
          <h1 className="font-bold flex items-center select-none gap-2">
            <span className="spin-on-hover cursor-pointer">🌀</span> 
            wyrmhole
          </h1>
          <SettingsMenu />
        </div>
      </nav>

      <div className="m-4 select-none">
        <h2 className="text-lg font-bold select-none cursor-default">Sending</h2>
        <label htmlFor="File" className="block rounded border border-gray-300 p-4 text-gray-900 shadow-sm sm:p-6">
          <div className="flex items-center justify-center gap-4" onClick={select_files}>
            <span className="font-medium"> Upload your file(s) </span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m0-3-3-3m0 0-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75"/>
            </svg>
          </div>
        </label>

        {selectedFiles && selectedFiles.length > 0 && (
          <ul className="space-y-1 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            {selectedFiles.map((file, idx) => {
              const name = typeof file === "string" ? file.split(/[/\\]/).pop() : "Unknown";
              return (
                <li key={idx} className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-4 text-gray-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                  </svg>
                  {name}
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={(e) => { e.preventDefault(); }}>
          <div id="send_form_input_div">
            <button onClick={select_files} className="font-bold rounded-lg flex items-center p-0.5 drop-shadow-md border-2 border-gray-100 hover:border-gray-200 active:border-gray-400 bg-gray-50 hover:bg-gray-100 active:bg-gray-300 fill-gray-400 hover:fill-gray-500 active:fill-gray-700 transition-colors">{fileInputContextString}</button>
            <button onClick={send_files} type="submit" className="font-bold rounded-lg flex items-center p-0.5 drop-shadow-md border-2 border-gray-100 hover:border-gray-200 active:border-gray-400 bg-gray-50 hover:bg-gray-100 active:bg-gray-300 fill-gray-400 hover:fill-gray-500 active:fill-gray-700 transition-colors">
              <span className="cursor-default">Send</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path className="fill-black" d="M3 20v-6l8-2l-8-2V4l19 8z"/></svg>
            </button>
          </div>
        </form>

        <div className="m-2">
          <h3 className="text-sm mb-1">Sent File History</h3>
          <ul className="file_display_ul list-none flex flex-row">
            <li>IMG_1992.png</li>
          </ul>
        </div>
      </div>

      <div className="m-4">
        <h2 className="font-bold select-none cursor-default">Receiving</h2>
        <form onSubmit={(e) => { e.preventDefault(); request_file(); }} className="flex content-center gap-4">
          <input value={receiveCode} onChange={(e) => setReceiveCode(e.target.value)} placeholder="ex. 5-funny-earth" className="border-2 rounded-lg p-1 select-none focus:outline-gray-400 border-gray-100 hover:border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-300 fill-gray-400 hover:fill-gray-500 active:fill-gray-700 transition-colors"/>
          <button type="submit" className="font-bold rounded-lg flex items-center p-0.5 drop-shadow-md border-2 border-gray-100 hover:border-gray-200 active:border-gray-400 bg-gray-50 hover:bg-gray-100 active:bg-gray-300 fill-gray-400 hover:fill-gray-500 active:fill-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="m12 16l-5-5l1.4-1.45l2.6 2.6V4h2v8.15l2.6-2.6L17 11zm-6 4q-.825 0-1.412-.587T4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413T18 20z"/></svg>            
            <span className="cursor-default select-none">Receive</span>
          </button>
        </form>

        <div className="py-2">
          <p className="text-sm text-gray-700 cursor-default select-none">Received File History</p>
          <div className="grid grid-cols-3 select-none px-2 rounded bg-gray-50 hover:bg-gray-200 transition-colors">
            <div className="text-sm text-gray-400">Filename</div>
            <div className="text-sm text-gray-400">Extension</div>
            <div className="text-sm text-gray-400">Size</div>
          </div>
          <div>
            {(showAll ? receivedFiles.slice().reverse() : receivedFiles.slice(-5).reverse()).map((file, idx) => (
              <ReceiveFileCard key={idx} {...file}/>
            ))}
            {receivedFiles.length > 5 && (
              <div className="flex justify-center">
                <button
                  className="rounded transition-colors cursor-pointer text-sm text-gray-400 hover:text-gray-950 hover:bg-gray-200 w-full"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? "Show Less" : "Show More"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
