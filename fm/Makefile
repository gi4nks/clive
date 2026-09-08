.PHONY: all build check fmt clippy clean frontend-build frontend-dev frontend-check tauri-dev tauri-build dev

# Rust targets
CARGO = cargo

# Frontend targets
FRONTEND_DIR = src/frontend/vite-project

all: build ## Build the entire project (Tauri + frontend)

##=== Rust ===##

build: ## Build the Tauri binary in debug mode
	$(CARGO) build

release: ## Build the Tauri binary in release mode
	$(CARGO) build --release

check: ## Check Rust code for errors
	$(CARGO) check

fmt: ## Format Rust code
	$(CARGO) fmt

clippy: ## Run clippy linter
	$(CARGO) clippy --all-targets

##=== Frontend ===##

frontend-build: ## Build the React + Tailwind frontend
	cd $(FRONTEND_DIR) && npm run build

frontend-dev: ## Start Vite dev server
	@echo "Run separately: cd $(FRONTEND_DIR) && npm run dev"

frontend-check: ## Check TypeScript + Tailwind
	cd $(FRONTEND_DIR) && npm run lint

frontend-lint: ## Run eslint on frontend
	cd $(FRONTEND_DIR) && npm run lint

##=== Tauri ===##

tauri-dev: ## Start Tauri in development mode (vite + tauri)
	cargo tauri dev

tauri-build: ## Build Tauri release binary
	cargo tauri build

## Combined targets ===##

dev: tauri-dev frontend-dev ## Run: Tauri dev + Vite dev server

build: tauri-build frontend-build ## Full build: Tauri binary + frontend assets

clean: ## Clean build artifacts
	rm -rf target/ && rm -rf $(FRONTEND_DIR)/dist/
