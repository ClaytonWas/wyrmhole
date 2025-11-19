# A Magic Wormhole Wrapper
A lightweight GUI for [magic-wormhole.rs](https://github.com/magic-wormhole/magic-wormhole.rs/).

Built with Tauri + React + Typescript

## Current Build
**0.1.3**

TODO:
- [ ] Change sending and receiving progress bars to be the correct colours
- [ ] Make send files space flex correctly 
- [ ] find a way to help with recieve files dead space (maybe move aroud elements some more)
- [ ] find a better way to get codes and download deny/accepts to users over react toast, thats more for errors
<br/>
<br/>

**0.2.0 Roadmap:**
- [ ] Switch all console logging systems over to react-hot-toast.
- [x] Get the toast for sending files to close the backend mailbox connection when the x button is clicked.
- [x] Display codes for file send operations through react-hot-toast.
- [x] Continuing work on sending files methods. Get single file sends working on the backend in the files_json.rs file. Then multiple. Then dynamically populating sends?
- [ ] Reactor the code so functions are called in there own module and just have secure passthroughs that are called in the lib.rs.
- [x] Add checks and bindings for transfers that are cancelled or fail and add them to the received_files.json with what data can be taken depending on the stage of transfer. 
- [x] Create a separate type of received card component that has grid entries for its progress bar and download status. Should get deleted when the download completes, as they will be written into the .json and loaded dynamically that way.

<br/>

## Sources:
[Magic-Wormhole documentation](https://magic-wormhole.readthedocs.io/en/latest/)
[crates.io](https://crates.io/crates/magic-wormhole)
