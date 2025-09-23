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
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);

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
        return;
      }

      const files = Array.isArray(selected) ? selected : [selected];
      // Filter out non-strings for safety
      const stringFiles = files.filter(f => typeof f === "string") as string[];
      setSelectedFiles(stringFiles);

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
      ), { duration: Infinity, icon: '📥' });
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

  function remove_file_at_index(idx: number) {
    setSelectedFiles(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : null;
    });
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
        <h2 className="select-none cursor-default">Sending</h2>
        {!selectedFiles && (
          <label htmlFor="File" className="block rounded cursor-pointer bg-white border border-gray-300 text-gray-900 shadow-sm sm:p-6" onClick={select_files}>
          <div className="flex items-center justify-center gap-4">
            <span className="font-medium"> Upload your file(s) </span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m0-3-3-3m0 0-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75"/>
            </svg>
          </div>
        </label>
        )}

        {selectedFiles && selectedFiles.length > 0 && (
          <div className="relative rounded bg-white border border-gray-300">
            <ul className="flex flex-row p-2 gap-2 text-sm text-gray-700 my-2 overflow-x-auto">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" onClick={() => setSelectedFiles(null)} className="absolute right-0.5 top-0.5 cursor-pointer p-0.5 fill-black hover:fill-red-500 active:fill-red-700 transition-colors">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
              </svg>
              {selectedFiles.map((file, idx) => {
                const name = typeof file === "string" ? file.split(/[/\\]/).pop() : "Unknown";
                return (
                  <li key={idx} className="relative flex items-center gap-2 bg-gray-100 rounded px-2 py-1 min-w-60 max-w-60">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-4 text-gray-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                    </svg>
                    <p className="max-w-xs truncate">
                      {name}
                    </p>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" onClick={() => remove_file_at_index(idx)} className="absolute right-0 top-0 cursor-pointer fill-black hover:fill-red-500 active:fill-red-700 transition-colors" style={{ width: '25px', height: '25px', padding: 2 }}>
                      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                    </svg>
                  </li>
                );
              })}
            </ul>
            <button onClick={send_files} type="submit" className="w-full font-bold rounded-b flex items-center justify-center p-2 border-t cursor-pointer border-gray-200 hover:border-gray-300 active:border-gray-400 hover:bg-gray-100 active:bg-blue-200 transition-colors">
              Send
            </button>
          </div>
        )}

        <div className="my-2">
          <h3 className="text-sm mb-1">Sent File History</h3>
          <ul className="file_display_ul list-none flex flex-row">
            <li>not-implemented!</li>
          </ul>
        </div>
      </div>

      <div className="m-4 mt-10">
        <h2 className="select-none cursor-default">Receiving</h2>
        <form onSubmit={(e) => { e.preventDefault(); request_file(); }} className="flex w-full bg-white border border-gray-300 justify-between rounded">
          <input value={receiveCode} onChange={(e) => setReceiveCode(e.target.value)} placeholder="ex. 5-funny-earth" className="p-2 w-full select-none focus:outline-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"/>
          <button type="submit" className="font-bold flex items-center justify-center px-2 w-30 border-l cursor-pointer border-gray-200 hover:border-gray-300 hover:bg-gray-100 active:bg-blue-200 fill-gray-400 hover:fill-gray-500 active:fill-gray-700 transition-colors">
            Receive
          </button>
        </form>

        <div className="py-2">
          <p className="text-sm text-gray-700 cursor-default select-none">Received File History</p>
          
          <div className="border border-gray-300 rounded drop-shadow-sm my-2 mt-1 bg-white">
            <div className="h-30 overflow-y-auto">
              <div className="grid grid-cols-3 select-none border-b border-gray-300 bg-white sticky top-0 z-10 px-1">
                <div className="text-sm text-gray-400">Filename</div>
                <div className="text-sm text-gray-400">Extension</div>
                <div className="text-sm text-gray-400">Size</div>
              </div>
              
              <div className="divide-y divide-gray-200">
                {(receivedFiles.slice().reverse()).map((file, idx) => (
                  <ReceiveFileCard key={idx} {...file} />
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
