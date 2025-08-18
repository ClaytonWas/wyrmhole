import { invoke } from "@tauri-apps/api/core";
import { open } from '@tauri-apps/plugin-dialog';
import ReceiveFileCard from "./RecieveFileCardComponent";
import SettingsMenu from "./SettingsMenu";
import "./App.css";

function App() {
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
    } catch (error) {
      console.error("Error accepting file:", error);
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
      const accept = window.confirm(`File offer for ${JSON.stringify(data.file_name, null, 2)} received. \nFile Size: ${data.file_size} bytes \n\nAccept and download?`);
        if (accept) {
          accept_file_receive(data.id);
        } else {
          deny_file_receive(data.id);
        } 
    } catch (e) {
      console.error("Response from Tauri backend:", response);
    }
  }

  async function select_download_directory() {
    try {
      const selected = await open({
        directory: true,  // only folders
        multiple: false
      });

      if (typeof selected === "string") {
        await invoke("set_download_directory", { newPath: selected });
        console.log("Download directory set to:", selected);
      } else {
        console.log("No directory selected. Download directory unchanged.");
      }
    } catch (error) {
      console.error("Error setting download directory:", error);
    }
  }

  async function send() {
    (document.getElementById("send_input") as HTMLInputElement).value = "";
    // Invoke Tauri command here to send the file and receive the code.
  }


  return (
    <>
      <nav>
        <div className="p-4 flex justify-between items-center shadow-md">
          <h1 className="font-bold flex items-center gap-2">
            <span className="spin-on-hover cursor-pointer">🌀</span> 
            wyrmhole
          </h1>
          <SettingsMenu />
        </div>
      </nav>
      
      <div className="m-4">
        <h2 className="text-lg font-bold">Sending</h2> {/* functional equivalent in CLI would be 'wormhole send path/to/file.deb' */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          <div id="send_form_input_div">
            <input type="file" id="send_input" />
            <button type="submit">Send</button>
          </div>
        </form>
        <div className="m-2">
          <h3 className="text-sm mb-1">History</h3>
          <ul className="file_display_ul list-none flex flex-row">
            <li>IMG_1992.png</li>
          </ul>
        </div>
      </div>

      <div className="m-4">
        <h2 className="font-bold">Receiving</h2> {/* functional equivalent in CLI would be 'wormhole receive 5-funny-earth' */}
        <form onSubmit={(e) => { e.preventDefault(); request_file(); }} className="flex content-center gap-4">
          <input id="request_file_input" placeholder="ex. 5-funny-earth" className="border-2 rounded-lg p-1 focus:outline-gray-400 border-gray-100 hover:border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-300 fill-gray-400 hover:fill-gray-500 active:fill-gray-700 transition-colors"/>
          <button type="submit" className="font-bold rounded-lg flex items-center p-0.5 drop-shadow-md border-2 border-gray-100 hover:border-gray-200 active:border-gray-400 bg-gray-50 hover:bg-gray-100 active:bg-gray-300 fill-gray-400 hover:fill-gray-500 active:fill-gray-700 transition-colors">
            <svg className="p-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M13 8V2H7v6H2l8 8 8-8h-5zM0 18h20v2H0v-2z"/></svg>
            <span>Receive</span>
          </button>
        </form>
        <div className="py-2">
          <h3 className="text-sm text-gray-600 mb-1">History</h3>
          <ul className="list-none flex flex-row py-0.5">
            <ReceiveFileCard file_name="readme" file_extension=".md" file_size={345} />
            <ReceiveFileCard file_name="IMG_1992" file_extension=".jpg" file_size={67890} />
          </ul>
        </div>
      </div>
    </>
  );
}

export default App;