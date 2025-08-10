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

  async function receive() {
    const receive_code = (document.getElementById("receive_input") as HTMLInputElement).value;
    console.log("Receive code:", receive_code, "attempting push to Tauri backend.");
    const response = await invoke("receiving_file_request", { receiveCode: receive_code });

    try {
      const data = JSON.parse(response as string);
      console.log("Transit offer received from Wormhole.");
      console.log("File offer ID:", data.id);
      console.log("Transit offer information:", data.transit_info);
      console.log("File data:", data.file_offer);

      const accept = window.confirm(`File offer received:\n${JSON.stringify(data.file_offer, null, 2)}\n\nAccept and download?`);
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
        <div className="navbar">
          <h1>🌀 wyrmhole</h1>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="none" stroke="#a59f9fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="m2.75 12.25h10.5m-10.5-4h10.5m-10.5-4h10.5"/></svg>
        </div>
      </nav>

      <div>
        <h2>Sending</h2> {/* functional equivalent in CLI would be 'wormhole send path/to/file.deb' */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          <div id="send_form_input_div">
            <input type="file" id="send_input" />
            <button type="submit">Send</button>
          </div>
        </form>
        <div>
          <h3>Sent History</h3>
          <ul>
            <li>IMG_1992.png</li>
          </ul>
        </div>
      </div>

      <div>
        <h2>Receiving</h2> {/* functional equivalent in CLI would be 'wormhole receive 5-funny-earth' */}
        <form onSubmit={(e) => { e.preventDefault(); receive(); }}>
          <input id="receive_input" placeholder="ex. 5-funny-earth"/>
          <button type="submit">Request</button>
        </form>
        <div>
          <h3>Received History</h3>
          <ul>
            <li>book.epub</li>
            <li>Half Alive - RUNAWAY.m4a</li>
          </ul>
        </div>
      </div>
    </>
  );
}

export default App;
