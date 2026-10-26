# Public password policy corpus

This is public policy/test data, not application credentials or user passwords.

- Upstream: https://github.com/danielmiessler/SecLists
- Commit: `145f1f45ba7bc5fd6b3966d3a79bf95654deb20e`
- Path: `Passwords/Common-Credentials/10k-most-common.txt`
- Retrieved: 2026-10-26
- Bytes: 73026
- Nonempty entries: 10001 (despite the upstream filename)
- SHA-256: `68782d6a4a19a4768d5f15dd66bd534e7a33055cc755411e33f16d18c50fdcce`
- License: upstream MIT notice retained in `LICENSE`

The bytes are unchanged from the pinned upstream file. Git text conversion is
disabled for this file so Windows/Linux checkout preserves its checksum. The
runtime verifies checksum and entry count; a missing/corrupt asset fails startup
with a safe diagnostic. Build copies the committed data; no runtime/install fetch
occurs. Screen whole NFC/lowercase values only. This small corpus contains only
one entry at the 15-code-point minimum, supplemented by contextual policy. It is
not a comprehensive breached-password database. Review corpus freshness and policy
coverage before public launch; updates require review of provenance and checksum.
