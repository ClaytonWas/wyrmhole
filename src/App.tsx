import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";


function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  async function receive() {
    const receive_code = (document.getElementById("receive_input") as HTMLInputElement).value;
    console.log("Receive code:", receive_code, "attempting push to Tauri backend.");
    const response = await invoke("receiving_file", { receiveCode: receive_code });
    
    try {
      const data = JSON.parse(response as string);
      console.log("Transit offer received from Wormhole.");
      console.log("Transit offer information:", data.transit_info);
      console.log("File data:", data.file_offer);

      const accept = window.confirm(`File offer received:\n${JSON.stringify(data.file_offer, null, 2)}\n\nAccept and download?`);
        if (accept) {
          // Call backend to proceed with the file transfer like await invoke("accept_file_offer"....
          console.log("User accepted the file offer.");
        } else {
          console.log("User rejected the file offer.");
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
    <main className="container">
      <div className="card_container">
        <div className="card">
          <h3>Send</h3>        
          <p>functional equivalent in CLI would be 'wormhole send path/to/file.deb'</p>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input type="file" id="send_input" />
            <button type="submit">Send</button>
          </form>
        </div>
        <div className="card">
          <h3>Receive</h3>
          <p>functional equivalent in CLI would be 'wormhole receive 5-funny-earth'</p>
          <form onSubmit={(e) => { e.preventDefault(); receive(); }}>
            <input id="receive_input" />
            <button type="submit">Request</button>
          </form>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); greet(); }}>
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>

      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
