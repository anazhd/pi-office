# Security verification — 2026-10-20

## Dedicated secret scanning completed

Tool: **Gitleaks 8.30.1**, downloaded from the official GitHub release and verified against its published SHA-256 checksum.
Default detection rules were used, with no project allowlist/baseline, no ignored findings, `gitleaks:allow` comments
disabled, decoding enabled to depth 5, archive traversal to depth 3, and reports fully redacted.

| Scope | Result |
| --- | --- |
| 124 current tracked/untracked source files (excluding ignored dependencies/build output) | 0 findings, exit 0 |
| Git history after fetching origin branches/tags; all refs, reflogs and full history (111 commits visited by the diff scanner) | 0 findings, exit 0 |
| All local Git object contents, including unreferenced objects: 352 blobs, 200 commits, 0 tags | 0 findings, exit 0 |

The object scan included complete blob contents and commit messages, not just changed lines. Private scan reports
and logs are retained outside the repository. No secret values were uploaded for online verification.

The history command was:

```sh
gitleaks git . --log-opts='--all --reflog --full-history' \
  --ignore-gitleaks-allow --redact=100 --max-archive-depth 3 --max-decode-depth 5
```

The working-tree snapshot and exported object contents were separately scanned with `gitleaks dir` using the
same default-rule, redaction, decoding and archive settings. The repository is not shallow.

**Interpretation:** no credentials were detected in the scanned source/history. This is a completed dedicated
scan, not a guarantee that every possible secret format can be detected. The owner's license attribution is intentional. Existing Git author name/email also remain present; these are
personal identifiers, not credentials. History was not rewritten.

## Deployment verification completed

- Installed the hardened systemd user service with an explicit public-host allowlist and trusted loopback
  Cloudflare proxy/client-IP header configuration.
- Preserved the existing Pi session directory and desk-state location.
- Saved a rollback service, previous committed server/shared sources, web output and desk-state backup outside
  the repository before restarting.
- Local and public health endpoints: HTTP 200; service active/running.
- Unknown Host: HTTP 421. Foreign API Origin through the public endpoint: HTTP 403.
- Public HTML includes CSP, `nosniff`, frame denial and no-referrer headers.
- Isolated browser smoke passed against both the local and public deployed endpoints, including all seasons and
  Halloween preview combinations; browser sessions closed afterwards.

## Remaining disclosed issues

- Two upstream advisories have no published patched versions; see [DEPENDENCIES.md](../DEPENDENCIES.md).
- The published office intentionally exposes activity metadata without authentication; see
  [SECURITY.md](../SECURITY.md). Host/CORS restrictions are not authentication.
- Native macOS/Windows service execution still requires real-machine validation. CI is configured for those OSes.
