# Atlas — Developer Spec for Claude Code

## What is Atlas?

Atlas is a cross-platform desktop app (macOS + Windows) that lets users point at a folder
of photos — typically a USB drive — and explore them visually. The first release focuses
exclusively on a **horizontal timeline view**. A globe view and album view are planned for
later phases but should be stubbed out in the UI now.

## Tech Stack

| Layer | Technology |
|---|---|
| UI language | TypeScript + React |
| Desktop shell | Tauri 2 |
| Native backend | Rust |
| Build / bundler | Vite |
| Photo metadata (JS) | exifr (npm) |
| Photo metadata (Rust) | kamadak-exif |
| File scanning | walkdir (Rust) |

## Project Structure

```
atlas/
├── CLAUDE.md                  ← this file
├── package.json
├── index.html
├── vite.config.ts
├── tsconfig.json
├── src/                       ← React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   ├── components/            ← create as needed
│   └── assets/
└── src-tauri/                 ← Tauri / Rust backend
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── icons/                 ← app icons (generate placeholders if missing)
    └── src/
        ├── main.rs
        └── lib.rs
```

## Running Locally

```bash
# Install JS dependencies
npm install

# Start development (opens a live-reloading app window)
npm run dev

# Build distributable .dmg / .exe
npm run build
```

Tauri requires Rust toolchain (`cargo`) and on macOS Xcode Command Line Tools.
Run `rustup target add aarch64-apple-darwin x86_64-apple-darwin` for universal macOS builds.

---

## Phase 1 Feature Spec: Timeline View

This is the only view to implement right now. Everything below must work before shipping.

### 1. Open a Folder

- A toolbar button labelled **"Open Folder"** opens a native folder-picker dialog
  (use `@tauri-apps/plugin-dialog` → `open({ directory: true })`)
- After selection, call the Rust command `scan_photos(dir)` which returns an array of
  `PhotoMeta` objects (see Rust backend section below)
- Show a loading spinner while scanning; large folders (10,000+ photos) should not freeze the UI
- If the folder contains zero images, show a friendly empty state

### 2. PhotoMeta shape (returned from Rust)

```typescript
interface PhotoMeta {
  path: string;          // absolute path on disk
  filename: string;      // e.g. "IMG_4821.jpg"
  date_taken: string | null;   // "2021:06:14 15:42:00" (EXIF format) or null
  width: number | null;
  height: number | null;
  camera_make: string | null;
  camera_model: string | null;
  latitude: number | null;
  longitude: number | null;
}
```

Parse `date_taken` on the JS side into a `Date` object for sorting and display.
Photos with null `date_taken` should sort to the end (undated group).

### 3. Timeline Layout

The timeline is a **horizontal scrolling strip** that fills the full height of the window
below the toolbar. Think film-strip / iMovie-style.

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOOLBAR  [Atlas]  [Timeline ▼]  [Open Folder]                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  2019                2020                  2021                     │
│   │                   │                    │                        │
│  [img][img][img]  [img][img]  [img][img][img][img][img]             │
│                                                                     │
│◄────────────────── scroll horizontally ────────────────────────────►│
└─────────────────────────────────────────────────────────────────────┘
```

**Year markers** appear above the photo strip wherever the year changes (sticky or
inline label is fine — choose whichever renders more cleanly).

**Photo thumbnails:**
- Display as fixed-height cards (e.g. 160 px tall) with width proportional to aspect ratio
- Load thumbnails lazily — use `convertFileSrc` from `@tauri-apps/api/core` to convert
  the local file path to a URL the webview can load. Do not load full-res images into the
  timeline.
- Show the photo's date (day + month) beneath each thumbnail on hover or always — your call
- Gap between thumbnails: 4–6 px

**Scrolling:**
- Horizontal mouse-wheel scroll (or trackpad two-finger swipe) should work naturally
- Add a thin scroll bar at the bottom
- Optionally: clicking a year label jumps to that year

**Undated photos:**
- Photos with no date go in an "Undated" section at the far right of the timeline

### 4. Lightbox / Full-Screen Viewer

Clicking a thumbnail opens a **lightbox overlay**:
- Full-resolution image centred on a dark semi-transparent backdrop
- Left / right arrow keys (and on-screen buttons) to navigate to prev/next photo
- ESC or clicking outside closes it
- Show metadata panel on the right (or bottom): filename, date, camera make/model,
  dimensions. If GPS coordinates exist, show lat/long (globe integration comes later)

### 5. View Switcher Dropdown

The toolbar centre has a `<select>` dropdown with three options:
- **Timeline** (active, enabled)
- **Globe** (disabled, labelled "coming soon")
- **Album** (disabled, labelled "coming soon")

Selecting a disabled option should do nothing (the `disabled` attribute handles this).

---

## Rust Backend (`src-tauri/src/lib.rs`)

The `scan_photos` command is already stubbed in `lib.rs`. Complete it to:

1. Walk the given directory recursively (using `walkdir`)
2. Filter for image files by extension: jpg, jpeg, png, heic, heif, tiff, tif, webp,
   raw, cr2, nef, arw
3. For each image, open it and attempt to parse EXIF with `kamadak-exif`
4. Extract and return: `DateTimeOriginal`, `PixelXDimension`/`PixelYDimension`,
   `Make`, `Model`, `GPSLatitude`/`GPSLongitude`
5. Never panic — wrap everything in `Result`/`Option` and return `None` for missing fields
6. Return a `Vec<PhotoMeta>` serialised to JSON by Tauri

The Rust side does **not** generate thumbnails — let the browser load scaled-down versions
via CSS (`object-fit: cover` on a fixed-size container) using the native file path.

---

## Design Guidelines

- Dark theme throughout (`#0d0d0d` background, `#1a1a1a` toolbar)
- Font: system default (`-apple-system, BlinkMacSystemFont, "Segoe UI", ...`)
- Accent colour: a cool blue (`#4a9eff`) for interactive elements
- Thumbnails: thin border radius (4–6 px), subtle hover shadow
- Keep the UI minimal — this is a viewer, not an editor
- No external UI component libraries unless strictly necessary — write CSS directly

---

## What NOT to build yet

- Globe view (just stub the option as disabled in the dropdown)
- Album view (same)
- Manual geotagging / metadata editing
- Sidecar file writing
- Windows-specific installers (build for macOS first, Windows later)
- Any kind of photo syncing or cloud integration

---

## Known Gaps to Fill

- [ ] App icons — generate placeholder icons for `src-tauri/icons/` (32x32, 128x128,
      128x128@2x, icon.icns, icon.ico). Use a simple dark background with a white "A"
      or a simple mountain/atlas motif.
- [ ] The `exifr` npm package is listed in package.json but is not used in the current
      frontend stub — EXIF reading is done in Rust via `scan_photos`. Remove `exifr` from
      package.json unless you find a specific use for it on the JS side.
- [ ] `tsconfig.node.json` is not present but may be needed for Vite — add if build errors arise.

---

## Session Notes

- Project folder: the directory containing this CLAUDE.md file
- Phase 1 is complete when: open a folder → photos appear on a horizontal timeline
  sorted by date → clicking a photo opens the lightbox with metadata
- Use `npm run dev` to test in dev mode during development
