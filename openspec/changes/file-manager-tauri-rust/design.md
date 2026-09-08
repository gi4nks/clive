## Context

Current state: starting from scratch for a macOS file manager using Tauri + Rust. Key constraints: local-first, no cloud dependencies, full filesystem access for personal use, efficient operations, and reliable core functionality.

## Goals / Non-Goals

**Goals:**
- Build a performant file manager replacing Finder for personal use
- Implement core operations: copy, move, rename, delete (to Cestino), create folders
- Provide live filesystem watching without manual refresh
- Include type-ahead/jump-to-file and internal clipboard for multi-file operations
- Ensure batch operations are async with progress feedback
- Maintain full understanding of system internals (no magical black-boxes)

**Non-Goals:**
- Quick Look integration (post-MVP)
- Full system drag & drop from Finder (internal drag & drop only for MVP)
- Cross-platform support (macOS-focused)
- App Store distribution or strict App Sandbox compliance
- Network sync or cloud backup functionality
- Advanced metadata editing or preview generation

## Decisions

### 1. Tauri + Rust Stack
- **Rationale**: Performance benefits of Rust for I/O operations, small binary size, cross-platform potential if needed later, memory safety for crash-prone file operations
- **Alternative considered**: Swift/AppKit - more native API access but locked to macOS, larger binaries, harder for someone primarily experienced with Rust/JS
- **Decision**: Tauri + Rust provides the right balance of performance, size, and control

### 2. Sandbox Configuration
- **Rationale**: Personal use case means we can relax sandbox restrictions if needed, but still want proper entitlements for security
- **Decision**: Start with `tauri.sandbox.enabled = true` but configure necessary entitlements. If access issues arise, can disable sandbox with proper justification for personal tool
- **Key entitlements**: `com.apple.security.automation`, `com.apple.security.filesystem` for home directory access

### 3. Queue-Based Concurrency for Batch Operations
- **Rationale**: Prevent resource exhaustion, provide predictable progress feedback, avoid race conditions on shared paths
- **Decision**: Implement `mpsc` channel-based queue in Rust. User-initiated operations go into queue, executed sequentially or with limited concurrency (max 4 parallel). Progress reported via Tauri channel to frontend.
- **Alternative**: Fire-and-forget parallel operations - rejected due to potential conflicts and lack of progress control

### 4. FSEvents Watcher with Debouncing
- **Rationale**: Live filesystem monitoring without manual refresh, but need to avoid event flooding during rapid operations
- **Decision**: Use `notify` crate with FSEvents backend. Implement debouncing with `minimum_duration` of 200ms between identical events on same path. Fallback to polling interval if watcher loses events.
- **Alternative**: Continuous polling - rejected due to higher CPU usage and less responsive

### 5. Internal Clipboard vs System Clipboard
- **Rationale**: Need clipboard for multi-file operations within app, while possibly also syncing with system clipboard
- **Decision**: Implement internal Rust clipboard state for multi-file selection tracking. System clipboard access available but secondary. When user performs copy, write to both internal state and system clipboard.
- **Alternative**: Only system clipboard - rejected because multi-file selection tracking would be lost between app launches

### 6. Trash Crate Over Direct Delete
- **Rationale**: User expectation that delete sends to Cestino, not permanent removal. Also need to handle metadata preservation.
- **Decision**: Use `trash` crate which correctly handles macOS Cestino, preserves extended attributes, and works with both absolute and relative paths.
- **Alternative**: `fs::remove_file` - rejected because it permanently deletes without recovery option

## Risks / Trade-offs

- **Sandbox limitations**: If sandbox is enabled, some filesystem paths may be restricted. Solution: configure entitlements properly or document that sandbox can be disabled for personal use
- **FSEvents reliability under load**: Very large directories (10k+ files) may cause event loss. Solution: polling fallback with configurable interval
- **Drag & drop complexity**: Full system drag & drop (Finder → app → other apps) requires Objective-C/NSDraggingDestination implementation. Solution: internal drag & drop only for MVP, system-level add later if needed
- **Progress tracking overhead**: Async operations with progress updates add complexity. Solution: lightweight progress struct sent at intervals, not per-byte

## Design Decisions Summary

| Decision | Option Considered | Chosen | Rationale |
|----------|------------------|--------|-----------|
| Stack | Swift/AppKit, Electron, Tauri+Rust | Tauri+Rust | Best balance of performance, size, control |
| Sandbox | Full sandbox, no sandbox, configured sandbox | Configured sandbox | Personal use, can relax if needed |
| Concurrency | Parallel async, sequential, queue-based | Queue-based (mpsc) | Predictable, controllable, progress-able |
| Watcher | FSEvents, polling, hybrid | FSEvents + debounce + polling fallback | Live monitoring, low CPU, reliable fallback |
| Clipboard | System only, internal only, both | Both (internal primary, system secondary) | Multi-file tracking + system sync |
| Delete | Permanent delete, trash crate, custom implementation | `trash` crate | Cestino compliance, metadata preservation |
## Outcome (spec review — 2026-09-06)

Reconciled against the actual code. The MVP shipped **less** than the decisions table above implies:

- **Watcher**: NOT implemented. There is no `notify`/FSEvents watcher and no Rust-side debounce. The frontend polls the active directory every 2 seconds. (Decision row: `FSEvents + debounce + polling fallback` → reality: `polling only`.)
- **Concurrency**: NO queue. Commands are synchronous `std::fs` and handle one operation each; there is no `mpsc` queue, no `MAX_CONCURRENT`, and no progress reporting. `tokio` is declared but effectively unused by the command layer.
- **Clipboard**: internal-only (`Mutex<HashSet<PathBuf>>`). No system-clipboard synchronization was implemented.
- **Delete**: delivered as specified — via the `trash` crate to the macOS Cestino.
- **Quick Look**: originally listed as a non-goal; later delivered in the `2026-09-06-mouse-gesture-support` change (`quick_look`).

The capability specs under `specs/` now describe this reality. Deferred items are tracked as unchecked tasks in `tasks.md`.
