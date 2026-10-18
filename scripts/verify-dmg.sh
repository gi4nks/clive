#!/usr/bin/env bash
set -euo pipefail

bundle_dir="target/release/bundle/dmg"
shopt -s nullglob
artifacts=("$bundle_dir"/Clive_*_aarch64.dmg)

if (( ${#artifacts[@]} != 1 )); then
  printf 'Expected exactly one Apple Silicon DMG in %s; found %d\n' "$bundle_dir" "${#artifacts[@]}" >&2
  exit 1
fi

dmg="${artifacts[0]}"
printf 'Verifying %s\n' "$dmg"
hdiutil verify "$dmg"

app="target/release/bundle/macos/Clive.app"
if [[ ! -d "$app" ]]; then
  printf 'Expected app bundle at %s\n' "$app" >&2
  exit 1
fi

executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
if [[ ! -x "$app/Contents/MacOS/$executable" ]]; then
  printf 'Bundle executable is missing or not executable: %s\n' "$executable" >&2
  exit 1
fi

codesign --verify --deep --strict "$app"
printf 'DMG and app bundle verified: %s\n' "$dmg"
