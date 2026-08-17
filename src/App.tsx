import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import Timeline from "./components/Timeline";
import Lightbox from "./components/Lightbox";
import type { Photo, PhotoMeta } from "./types";
import { folderBaseName, parseExifDate } from "./types";
import "./App.css";

type View = "timeline" | "globe" | "album";
type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "atlas-theme";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function sortPhotos(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => {
    if (a.date && b.date) return a.date.getTime() - b.date.getTime();
    if (a.date) return -1;
    if (b.date) return 1;
    return a.filename.localeCompare(b.filename);
  });
}

function App() {
  const [currentView, setCurrentView] = useState<View>("timeline");
  const [folders, setFolders] = useState<string[]>([]);
  const [photosByFolder, setPhotosByFolder] = useState<Record<string, Photo[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const photos = useMemo(
    () => sortPhotos(Object.values(photosByFolder).flat()),
    [photosByFolder],
  );

  useEffect(() => {
    if (lightboxIndex !== null && lightboxIndex >= photos.length) {
      setLightboxIndex(null);
    }
  }, [photos.length, lightboxIndex]);

  const scanFolder = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke<PhotoMeta[]>("scan_photos", { dir });
      const withDates: Photo[] = raw.map((p) => ({
        ...p,
        date: parseExifDate(p.date_taken),
        folder: dir,
      }));
      setPhotosByFolder((prev) => ({ ...prev, [dir]: withDates }));
      setFolders((prev) => (prev.includes(dir) ? prev : [...prev, dir]));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddFolder = useCallback(async () => {
    setDropdownOpen(false);
    const selected = await open({ directory: true });
    if (!selected || Array.isArray(selected)) return;
    await scanFolder(selected);
  }, [scanFolder]);

  const handleRemoveFolder = useCallback((dir: string) => {
    setFolders((prev) => prev.filter((f) => f !== dir));
    setPhotosByFolder((prev) => {
      const next = { ...prev };
      delete next[dir];
      return next;
    });
  }, []);

  const handleFolderButtonClick = useCallback(() => {
    if (folders.length === 0) {
      handleAddFolder();
    } else {
      setDropdownOpen((o) => !o);
    }
  }, [folders.length, handleAddFolder]);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <span className="app-title">Atlas</span>
        </div>
        <div className="toolbar-center">
          <select
            className="view-switcher"
            value={currentView}
            onChange={(e) => setCurrentView(e.target.value as View)}
          >
            <option value="timeline">Timeline</option>
            <option value="globe" disabled>Globe (coming soon)</option>
            <option value="album" disabled>Album (coming soon)</option>
          </select>
        </div>
        <div className="toolbar-right">
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <div className="folder-menu" ref={menuRef}>
            <button
              className="open-btn"
              onClick={handleFolderButtonClick}
              disabled={loading}
            >
              Add Folder{folders.length > 0 ? ` (${folders.length})` : ""}
            </button>
            {dropdownOpen && (
              <div className="folder-dropdown">
                <button className="folder-dropdown-item folder-add" onClick={handleAddFolder}>
                  + Add Folder
                </button>
                <div className="folder-dropdown-divider" />
                {folders.map((dir) => (
                  <div className="folder-dropdown-item" key={dir}>
                    <span className="folder-name" title={dir}>
                      {folderBaseName(dir)}
                    </span>
                    <button
                      className="folder-remove"
                      onClick={() => handleRemoveFolder(dir)}
                      aria-label={`Remove ${folderBaseName(dir)}`}
                      title={`Remove ${folderBaseName(dir)}`}
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        {currentView === "timeline" && (
          <>
            {error && <div className="error-banner">{error}</div>}

            {folders.length === 0 && loading && (
              <div className="placeholder">
                <div className="spinner" />
                <p>Scanning photos…</p>
              </div>
            )}

            {folders.length === 0 && !loading && !error && (
              <div className="placeholder">
                <p>Timeline view — add a folder to get started</p>
              </div>
            )}

            {folders.length > 0 && photos.length === 0 && !loading && (
              <div className="placeholder">
                <p>No photos found in the selected folder(s)</p>
              </div>
            )}

            {photos.length > 0 && <Timeline photos={photos} onSelect={setLightboxIndex} />}
          </>
        )}
      </main>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

export default App;
