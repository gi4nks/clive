# Tasks: Mouse/Trackpad Gestures, Keyboard Navigation, Theming & Context Menus

## 1. Styling toolchain

- [x] 1.1 Move frontend to Tailwind CSS v4 + daisyUI 5 with `@tailwindcss/postcss`
- [x] 1.2 Replace `@import "tailwindcss"` (v3 postcss-import) with `@tailwind base/components/utilities`, then with v4 `@import "tailwindcss"; @plugin "daisyui"`
- [x] 1.3 Remove `tailwind.config.js` and `autoprefixer`
- [x] 1.4 Adopt daisyUI semantic tokens for shell colors (base-100/200/300, base-content, text-error)

## 2. App shell & gestures

- [x] 2.1 Constrain the layout chain with `min-h-0` so flex children scroll instead of growing the page
- [x] 2.2 Make `html/body/#root` non-scrolling; only internal panels scroll
- [x] 2.3 Add `overscroll-behavior` containment to scroll areas (prevents wheel/trackpad chaining)
- [x] 2.4 Keep header, sidebar, and status bar fixed while the file list scrolls
- [x] 2.5 Restore text selection in inputs while keeping chrome `select-none`

## 3. Keyboard navigation

- [x] 3.1 Fix stale-closure bugs in copy/cut/new-folder/clipboard handlers (dependency arrays)
- [x] 3.2 Arrow Up/Down move single selection with scroll-into-view
- [x] 3.3 Home/End jump to first/last item
- [x] 3.4 Space triggers Quick Look on a single selected file
- [x] 3.5 Cmd/Ctrl+A select all
- [x] 3.6 Retain command shortcuts (⌘C/X/V/N/R, ⌘↑, ⌘D, ⌘←/→, ⌘L / f) with text-input guard
- [x] 3.7 Escape closes modals/menus and clears selection

## 4. Context menus

- [x] 4.1 Build a reusable `ContextMenu` positioned at the cursor with viewport clamping
- [x] 4.2 Close on outside-click, Escape, blur, and scroll/wheel
- [x] 4.3 Wire right-click on list and grid items
- [x] 4.4 Generic actions: Open/Anteprima, Finder, Copy path, Copy/Cut, Paste, Rename (single), Move to Trash
- [x] 4.5 Type-specific actions: folder "New folder here", archive "Estrai", media/doc "Anteprima"
- [x] 4.6 Selection-scoped targeting (act on whole selection when the clicked item is in it)
- [x] 4.7 Right-click on sidebar places and recents; recents add "Remove from recents"

## 5. Theming & feedback

- [x] 5.1 Enable a daisyUI theme registry (light, dark, dracula, business, night, cupcake)
- [x] 5.2 Default to light with automatic system dark mode
- [x] 5.3 Add a persisted ThemeSwitch dropdown (`fm.theme`)
- [x] 5.4 Add a transient auto-dismiss operation toast (success/error/info)
- [x] 5.5 Keep the background 2s refresh silent (no toast)

## 6. Backend

- [x] 6.1 Add `open_path` (open with default app) and `quick_look` (`qlmanage -p`) commands
- [x] 6.2 Register both in `main.rs`
- [x] 6.3 Add frontend bindings in `api.ts`
- [x] 6.4 `npm run build`, `npm run lint`, `cargo check`, `cargo clippy` clean
