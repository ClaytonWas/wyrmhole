# Wyrmhole Security Policy

Thank you for helping to keep Wyrmhole secure!  
We take user privacy and the integrity of file transfers seriously — and we welcome community involvement in improving security.


## Security Model Summary

Wyrmhole uses the **magic-wormhole.rs** protocol to establish secure, zero-trust file transfer channels.  
This means **even the relay cannot read or modify your data**.

| Protection | Status |
|----------|:--:|
| End-to-end encryption | ✔ |
| Mutual authentication (no MITM) | ✔ |
| Zero-knowledge relay | ✔ |
| Tamper detection | ✔ |
| No persistent identity | ✔ |

Wyrmhole transfers are encrypted **before** any data reaches a server.


## Cryptography Details

| Component | Algorithm | Purpose |
|----------|-----------|---------|
| PAKE handshake | **SPAKE2** | Both peers prove they know the code **without revealing it**, eliminating MITM & offline brute force |
| Encryption | **AES-256-GCM** | Confidentiality + integrity via authenticated encryption |
| Key Derivation | HKDF-SHA256 | Derive strong keys from the handshake result |
| Hashing | SHA-256 | Cryptographic identifiers and validation |

Relay servers can see:
- File size + timing metadata
- Connection attempts

Relay servers **cannot** see:
- File contents
- Keys or wormhole code
- Sender/receiver identity

## Reporting a Vulnerability

If you find a security issue, please report it privately:

 **Email:** security@wyrmhole.app

Please include:
- Description of the issue
- Reproduction steps / logs if available
- Impact (what could an attacker do?)

We support legitimate researchers following these principles:
- No harm to users or data
- No service degradation or denial
- Avoid accessing data you don’t own
- Use private reporting channels

If you have ideas to improve Wyrmhole’s security design or architecture we would love to hear from you. Thank you for helping safeguard our users! 🧙‍♂️✨
