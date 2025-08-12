import { invoke } from "@tauri-apps/api/core";
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
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="none" stroke="#a59f9fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="m2.75 12.25h10.5m-10.5-4h10.5m-10.5-4h10.5"/></svg>
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
        <form onSubmit={(e) => { e.preventDefault(); request_file(); }}>
          <input id="request_file_input" placeholder="ex. 5-funny-earth"/>
          <button type="submit">Request</button>
        </form>
        <div className="m-2">
          <h3 className="text-sm mb-1">History</h3>
          <ul className="file_display_ul list-none flex flex-row">
            <li>book.epub</li>
            <li>Half Alive - RUNAWAY.m4a</li>
          </ul>
        </div>
      </div>
    </>
  );
}

export default App;
