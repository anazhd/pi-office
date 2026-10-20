# Dependency maintenance

Last checked: 2026-10-20. Use `npm ci` for reproducible installs and
`npx expo install --check` / `npx expo-doctor` to verify SDK compatibility.

## Updates in this hardening pass

- Expo 58.0.16, Expo Font 58.0.9, Expo Router 58.0.24.
- React/React DOM stay at 19.3.0: this is Expo SDK 58's supported matrix.
  A newer patch exists, but is not yet the SDK-recommended version.
- Tailwind stays on 3.4: NativeWind 4 depends on this integration. Do not
  force Tailwind 4 or downgrade Expo merely to satisfy audit output.
- Node type declarations track the supported Node 24 baseline.
- Targeted overrides: PostCSS selector parser 7.1.6 fixes quadratic parsing;
  xcode's UUID dependency 11.1.1 fixes buffer bounds checking while retaining
  CommonJS and the v4 API that xcode uses. Regression tests exercise these paths.
  Revisit/remove overrides when upstream dependencies adopt the fixes.

## Remaining upstream advisories

The latest recheck reports 22 high-severity affected packages (the count can change as registry advisories are
updated). These are transitive propagation from **two underlying advisories**, not 22 distinct exploits:

| Dependency | Advisory | Installed/latest version | Exposure |
| --- | --- | --- | --- |
| braces | GHSA-vfj7-8cjw-p6xm | 3.0.3 | Build tooling: deeply nested attacker-controlled glob patterns can exhaust the stack. |
| node-forge | GHSA-86w9-cpqp-85rv | 1.4.0 | Expo CLI certificate/signature tooling; malformed RSA signatures can be accepted. |

At the time checked, neither package has a patched published version. The
production office HTTP server imports only Node built-ins and local server/shared
modules; it does not load Expo CLI, Tailwind, braces, or node-forge. Do not expose
development servers or build untrusted projects/patterns/certificates. This narrows
exposure; it does **not** mean the advisories are fixed or may be ignored forever.

## Parent-package update investigation (2026-10-20)

Checked published stable/preview versions and resolved an alternative dependency tree in a temporary directory,
without changing the application lockfile, installed packages or running service:

- Expo 58.0.16 and its CLI 58.1.13 are already the latest stable versions. Both the CLI and
  `@expo/code-signing-certificates@0.0.7` still require `node-forge@^1.4.0`.
- NativeWind 4.2.7 and Tailwind 3.4.19 are the current stable NativeWind 4/Tailwind 3 combination.
  `react-native-css-interop@0.2.7` requires Tailwind `~3`; Tailwind 4 is not a supported drop-in replacement.
- A separate lockfile-only resolution with NativeWind 5.0.0-rc.0, `react-native-css@3.1.0-rc.0` and Tailwind 4.3.3
  succeeded, but **both vulnerable packages remained**. That candidate has 21 affected packages, still from
  the same two underlying advisories. This was dependency resolution, not a runtime compatibility test.
- In that candidate, `braces` remains through Expo → `@expo/metro@58.0.0` → `metro-file-map@0.87.1` →
  `micromatch@4.0.8` → `braces@3.0.3`. Migrating styling alone therefore does not eliminate it.
- Chokidar 6 removes its own old brace dependency, but forcing it over Tailwind 3's Chokidar 3 range is not a
  supported fix and would leave the independent Metro/micromatch path anyway.

**Conclusion:** no currently published, stable, Expo-compatible parent-package update removes these two
advisories. An RC styling migration adds change risk without resolving them; no such migration was applied.

Re-run `npm audit` and check the linked GitHub advisories before a release.
Do not use `npm audit fix --force`: its proposed Expo/React Native downgrades and
Tailwind major upgrade are incompatible with this app. Audit findings should be
tracked visibly rather than suppressed or hidden by a severity threshold.
