# Dependency maintenance

Last checked: 2026-10-22. Use `npm ci` for reproducible installs and
`npx expo install --check` / `npx expo-doctor` to verify SDK compatibility.

## Current dependency decisions

- Expo 58.0.17, Expo Font 58.0.9, Expo Router 58.0.25.
- React/React DOM stay at 19.3.0, Expo SDK 58's recommended version.
- Tailwind CSS and its PostCSS plugin are pinned to 4.3.3, with the exact paired
  releases NativeWind 5.0.0-rc.0 and react-native-css 3.1.0-rc.0.
  NativeWind 5 is still prerelease. The owner approved the migration after
  desktop/mobile-browser testing and review on the live site.
- Theme tokens live in `global.css`. Keep Tailwind utilities unlayered: layered
  utilities can lose to React Native Web defaults despite a successful export.
  Babel no longer uses NativeWind's v4 preset/JSX import source.
- Node type declarations track the supported Node 24 baseline.
- Overrides: lightningcss 1.30.1 follows NativeWind RC's documented compiler
  requirement; xcode's UUID 11.1.1 retains its CommonJS v4 API and fixes buffer
  bounds checking. Revisit overrides when upstream dependencies adopt fixes.

## Verification scope

The migration passed a clean install, typechecking, server/scene/script tests,
production web export, and Chromium browser checks of responsive layouts,
custom fonts/colors, populated roster, character cards, seasons and Halloween.
The dependency regression test exercises Tailwind 4 custom tokens and opacity
compilation, rather than Tailwind 3's removed postcss-nested dependency.

iOS/Android JavaScript/Hermes exports also compiled, but native device runtime
has not been verified. The shipped product is web; verify device rendering before
a future mobile release. Upstream's documented RC test target is Expo 57, while
this application uses Expo 58. Browser tests do not establish universal platform
compatibility.

## Remaining upstream advisories

The recheck reports 21 high-severity affected packages (the count can change as
registry advisories update). These propagate from **two underlying advisories**,
not 21 distinct exploits:

| Dependency | Advisory | Installed version | Exposure |
| --- | --- | --- | --- |
| braces | GHSA-vfj7-8cjw-p6xm | 3.0.3 | Build tooling: deeply nested attacker-controlled glob patterns can exhaust the stack. |
| node-forge | GHSA-86w9-cpqp-85rv | 1.4.0 | Expo CLI certificate/signature tooling; malformed RSA signatures can be accepted. |

The Tailwind 4 migration does not resolve either advisory. Braces remains through
Metro/micromatch, and node-forge remains through Expo's tooling. The production
office HTTP server imports only Node built-ins and local server/shared modules;
it does not load Expo CLI, Tailwind, braces or node-forge. Do not expose development
servers or build untrusted projects/patterns/certificates. This narrows exposure;
it does not mean the advisories are fixed or may be ignored forever.

Re-run `npm audit` and check the linked GitHub advisories before a release.
Do not use `npm audit fix --force`: automatic Expo/React Native downgrades are
not a supported fix. Track findings visibly rather than suppressing them.
