.PHONY: all setup submodules wise-install wise-build frontend-install frontend-dev frontend-build frontend-check frontend-test frontend-coverage rust-coverage coverage tauri-contract-check quality verify-dmg release-bootstrap release-check release dev build check fmt clippy clean

WISE_DIR = vendor/wise
FRONTEND_DIR = frontend

all: build

## Install/build local Wise and Clive's frontend dependencies
setup: wise-install wise-build frontend-install

submodules:
	git submodule update --init --recursive

wise-install: submodules
	npm --prefix $(WISE_DIR) ci

wise-build:
	npm --prefix $(WISE_DIR) run build

frontend-install:
	npm --prefix $(FRONTEND_DIR) ci

frontend-dev: wise-build
	npm --prefix $(FRONTEND_DIR) run dev

frontend-build: wise-build
	npm --prefix $(FRONTEND_DIR) run build

tauri-contract-check:
	npm --prefix $(FRONTEND_DIR) run check:tauri-contract

frontend-check:
	npm --prefix $(FRONTEND_DIR) run lint
	npm --prefix $(FRONTEND_DIR) run build

frontend-test:
	NODE_OPTIONS=--no-experimental-webstorage npm --prefix $(FRONTEND_DIR) test

frontend-coverage:
	NODE_OPTIONS=--no-experimental-webstorage npm --prefix $(FRONTEND_DIR) run test:coverage

rust-coverage:
	bash scripts/rust-coverage.sh

coverage: frontend-coverage rust-coverage

## Run the deterministic PR quality gate (dependencies must already be installed)
quality: tauri-contract-check
	cargo fmt --all -- --check
	cargo clippy --all-targets -- -D warnings
	$(MAKE) rust-coverage
	$(MAKE) frontend-check
	$(MAKE) frontend-coverage

## Verify the generated Apple Silicon DMG (macOS only)
verify-dmg:
	bash scripts/verify-dmg.sh

release-bootstrap:
	node scripts/release.mjs --bootstrap

release-check:
	node scripts/release.mjs --dry-run

release:
	node scripts/release.mjs --apply

dev: wise-build
	cargo tauri dev

build: wise-build
	cargo tauri build

check:
	cargo check

fmt:
	cargo fmt

clippy:
	cargo clippy --all-targets

clean:
	cargo clean
	rm -rf $(FRONTEND_DIR)/dist/
