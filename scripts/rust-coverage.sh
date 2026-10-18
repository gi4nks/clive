#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Rust coverage currently requires macOS Xcode Command Line Tools (xcrun llvm-cov)." >&2
  exit 2
fi

PROFILE_DIR="$ROOT/target/coverage/rust"
mkdir -p "$PROFILE_DIR"
RUN_DIR="$(mktemp -d "$PROFILE_DIR/run.XXXXXX")"
TARGET_DIR="$PROFILE_DIR/build"
SYSROOT="$(rustc --print sysroot)"
HOST="$(rustc -vV | sed -n 's/^host: //p')"
LLVM_BIN="$SYSROOT/lib/rustlib/$HOST/bin"
LLVM_PROFDATA="$LLVM_BIN/llvm-profdata"
LLVM_COV="$LLVM_BIN/llvm-cov"
if [[ ! -x "$LLVM_PROFDATA" || ! -x "$LLVM_COV" ]]; then
  echo "Matching LLVM tools are missing. Install them with: rustup component add llvm-tools-preview" >&2
  exit 2
fi

echo "Running instrumented Rust tests; artifacts: $RUN_DIR"
(
  cd "$ROOT"
  CARGO_TARGET_DIR="$TARGET_DIR" \
  RUSTFLAGS="-C instrument-coverage" \
  LLVM_PROFILE_FILE="$RUN_DIR/clive-%p-%m.profraw" \
    cargo test --quiet --manifest-path Cargo.toml
)

profiles=("$RUN_DIR"/*.profraw)
if [[ ! -e "${profiles[0]}" ]]; then
  echo "No LLVM profile data was produced." >&2
  exit 1
fi

"$LLVM_PROFDATA" merge -sparse "${profiles[@]}" -o "$RUN_DIR/coverage.profdata"

test_binary=""
for candidate in "$TARGET_DIR"/debug/deps/clive-*; do
  if [[ -f "$candidate" && -x "$candidate" ]]; then
    test_binary="$candidate"
    break
  fi
done
if [[ -z "$test_binary" ]]; then
  echo "Could not find the instrumented Clive test binary in $TARGET_DIR." >&2
  exit 1
fi

report=$("$LLVM_COV" report "$test_binary" \
  -instr-profile="$RUN_DIR/coverage.profdata" \
  --ignore-filename-regex='/.cargo/registry/|/rustc/')
printf '%s\n' "$report"
line_coverage=$(printf '%s\n' "$report" | awk '$1 == "TOTAL" { value=$10; sub(/%$/, "", value); print value }')
if [[ -z "$line_coverage" ]]; then
  echo "Could not parse total Rust line coverage from llvm-cov." >&2
  exit 1
fi
if ! awk -v actual="$line_coverage" 'BEGIN { exit !(actual >= 85) }'; then
  echo "Rust line coverage ${line_coverage}% is below the 85% minimum." >&2
  exit 1
fi
echo "Rust line coverage gate passed: ${line_coverage}% (minimum 85%)."
"$LLVM_COV" show "$test_binary" \
  -instr-profile="$RUN_DIR/coverage.profdata" \
  --format=html \
  --output-dir="$RUN_DIR/html" \
  --ignore-filename-regex='/.cargo/registry/|/rustc/'

echo "Detailed Rust HTML report: $RUN_DIR/html/index.html"
