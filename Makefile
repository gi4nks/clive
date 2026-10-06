.PHONY: all setup submodules wise-install wise-build frontend-install frontend-dev frontend-build frontend-check frontend-test dev build check fmt clippy clean

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

frontend-check:
	npm --prefix $(FRONTEND_DIR) run lint
	npm --prefix $(FRONTEND_DIR) run build

frontend-test:
	NODE_OPTIONS=--no-experimental-webstorage npm --prefix $(FRONTEND_DIR) test

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
