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
    (document.getElementById("receive_input") as HTMLInputElement).value = "";
  }

  async function send() {
    (document.getElementById("send_input") as HTMLInputElement).value = "";
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
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              receive();
            }}
        >
            <input id="receive_input" />
            <button type="submit">Request</button>
          </form>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
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
