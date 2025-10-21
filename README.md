# A Magic Wormhole Wrapper
A lightweight GUI for [magic-wormhole.rs](https://github.com/magic-wormhole/magic-wormhole.rs/).

Built with Tauri + React + Typescript

## Current Build
**0.1.0**

![Image](https://github.com/user-attachments/assets/82acb92d-b679-47d5-b116-e5f4c47e6645)

<br/>
<br/>

**0.1.1 Roadmap:**
- [ ] Switch all console logging systems over to react-hot-toast.
- [ ] Get the toast for sending files to close the backend mailbox connection when the x button is clicked.
- [ ] Display codes for file send operations through react-hot-toast.
- [ ] Continuing work on sending files methods. Get single file sends working on the backend in the files_json.rs file. Then multiple. Then dynamically populating sends?
- [ ] Reactor the code so functions are called in there own module and just have secure passthroughs that are called in the lib.rs.
- [ ] Add checks and bindings for transfers that are cancelled or fail and add them to the received_files.json with what data can be taken depending on the stage of transfer. 
- [ ] Create a separate type of received card component that has grid entries for its progress bar and download status. Should get deleted when the download completes, as they will be written into the .json and loaded dynamically that way.

<br/>

## Sources:
[Magic-Wormhole documentation](https://magic-wormhole.readthedocs.io/en/latest/)
[crates.io](https://crates.io/crates/magic-wormhole)
