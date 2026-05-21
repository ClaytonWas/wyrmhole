# Security Policy

## Scope

Wyrmhole is a Tauri/React GUI wrapper around [magic-wormhole.rs](https://github.com/magic-wormhole/magic-wormhole.rs).
The cryptographic guarantees of file transfers using SPAKE2 key exchange,
end-to-end encryption, code-phrase authentication inherited from that
library. Vulnerabilities in the underlying protocol or `magic-wormhole.rs`
itself should be reported upstream.

This policy covers the Wyrmhole application code: the Tauri shell, IPC
boundary, frontend, transfer history storage, and relay configuration.

### In scope

- Memory safety issues in the Rust backend
- IPC commands that leak data or accept unsanitized input
- Path traversal or arbitrary file write on receive
- Tauri allowlist or CSP misconfigurations
- Insecure handling of relay URLs, transfer history, or user settings
- Privilege escalation via the installer or auto-updater

### Out of scope

- Issues in `magic-wormhole.rs` or the wormhole protocol (report upstream)
- Social-engineering attacks involving shared code phrases
- Vulnerabilities requiring local root or physical device access
- Denial of service against public relay servers

## Reporting

Report vulnerabilities privately via GitHub's
[security advisory form](https://github.com/ClaytonWas/wyrmhole/security/advisories/new).

Do **not** open public issues for security reports.

## Response

I aim to acknowledge reports within 72 hours and provide a remediation
timeline within 7 days. Critical issues will be patched as fast as
practical; lower-severity issues will be batched into the next release.

Reporters are credited in release notes unless they request otherwise.

## Supported versions

Only the latest release receives security updates. Wyrmhole is pre-1.0;
upgrade promptly.
