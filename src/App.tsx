import { invoke } from "@tauri-apps/api/core";
import { confirm, open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from "react";
import ReceiveFileCard from "./RecieveFileCardComponent";
import SettingsMenu from "./SettingsMenu";
import "./App.css";

function App() {
  const [selectedFiles, setSelectedFiles] = useState<string[] | null>(null);
  const [fileInputContextString, setFileInputContextString] = useState<string>("Click to Upload File(s)");
  const [receivedFiles, setReceivedFiles] = useState<Array<any>>([]);
  const [showAll, setShowAll] = useState(false);
  
  async function deny_file_receive(id: string) {
    try {
      const response = await invoke("receiving_file_deny", { id });
      console.log("File result:", response);
    } catch (error) {
      console.error("Error denying file:", error);
    }
  }

  async function accept_file_receive(id: string) {
    try {
      const response = await invoke("receiving_file_accept", { id });
      console.log("File result:", response);
      recieved_files_data();
    } catch (error) {
      console.error("Error accepting file:", error);
    }
  }

  // opens file dialog and modifies the selectedFiles state variable
  async function select_files() {
    const selected = await open({
      multiple: true,
      filters: [{ name: 'Image', extensions: ['png', 'jpeg'] }]
    });

    if (selected === null) {
      // user 
      setSelectedFiles(null);
      setFileInputContextString("Click to Upload File(s)");
      //console.log("No file selected");
    } else if (Array.isArray(selected)) {
      if (selected.length > 1) {
        setSelectedFiles(selected); // multiple (or single wrapped in array)
        let contextString = selected.length + " files selected";
        setFileInputContextString(contextString);
        //console.log("Multiple files selected:", selected);
      } else if (selected.length === 1) {
        setSelectedFiles([selected[0]].slice()); // single string → make it an array for consistency
        let filePath = selected[0];
        let fileName = filePath.split(/[/\\]/).pop() ?? "File Uploaded"; 
        setFileInputContextString(fileName);
        //console.log("One file selected:", selected[0]);
      }
    }
  }

  // sends the selected files to the backend for processing
  async function send_files() {
    if (selectedFiles === null) {
      return; // user cancelled the file selection
    } else if (selectedFiles.length > 1) {
      console.log("Implement multiple files selected from send:", selectedFiles);
    } else if (selectedFiles.length === 1) {
      const response = await invoke("send_file_call", { filePath: selectedFiles[0] });
      console.log("One file selected from send:", response);
    }
  }

  async function request_file() {
    const receive_code = (document.getElementById("request_file_input") as HTMLInputElement).value;
    console.log("Receive code:", receive_code, "attempting push to Tauri backend.");
    const response = await invoke("request_file_call", { receiveCode: receive_code });

    try {
      const data = JSON.parse(response as string);
      console.log("File request initiated successfully.");
      console.log("Request ID:", data.id, "File Name:", data.file_name, "File Size:", data.file_size);
      let message = `File offer for ${data.file_name} received.\nFile Size: ${data.file_size} bytes\n\nAccept and download?`;
      const accept = await confirm(message, {title: "File Receive Confirmation"});
      if (accept) {
        const result = await accept_file_receive(data.id);
        alert(result);
      } else {
        await deny_file_receive(data.id);
      }
    } catch (e) {
      console.error("Response from Tauri backend:", response);
    }
  }

  async function recieved_files_data() {
    try {
      const response = await invoke("received_files_data");
      setReceivedFiles(response as Array<any>);
    } catch (error) {
      console.error("Error getting received files json data:", error);
    }
  }

  useEffect(() => {
    recieved_files_data();
  }, []);

  return (
    <>
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
        <h2 className="text-lg font-bold select-none cursor-default">Sending</h2> {/* functional equivalent in CLI would be 'wormhole send path/to/file.deb' */}
        <form
          onSubmit={(e) => { e.preventDefault();}}
        >
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
        <h2 className="font-bold select-none cursor-default">Receiving</h2> {/* functional equivalent in CLI would be 'wormhole receive 5-funny-earth' */}
        <form onSubmit={(e) => { e.preventDefault(); request_file(); }} className="flex content-center gap-4">
          <input id="request_file_input" placeholder="ex. 5-funny-earth" className="border-2 rounded-lg p-1 select-none focus:outline-gray-400 border-gray-100 hover:border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-300 fill-gray-400 hover:fill-gray-500 active:fill-gray-700 transition-colors"/>
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
              <ReceiveFileCard key={idx} connection_type={file.connection_type} download_time={file.download_time} download_url={file.download_url} file_extension={file.file_extension} file_name={file.file_name} file_size={file.file_size} peer_address={file.peer_address}/>
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
    </>
  );
}

export default App;
