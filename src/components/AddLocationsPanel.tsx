import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Photo } from "../types";
import { folderBaseName, isRawPhoto } from "../types";
import "./AddLocationsPanel.css";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface PickedLocation {
  label: string;
  lat: number;
  lng: number;
}

interface AddLocationsPanelProps {
  photos: Photo[];
  applying: boolean;
  onApply: (paths: string[], lat: number, lng: number) => void;
}

function AddLocationsPanel({ photos, applying, onApply }: AddLocationsPanelProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectableCount = useMemo(
    () => photos.filter((p) => !isRawPhoto(p.path)).length,
    [photos],
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPicked(null);

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (value.trim().length < 3) {
      setSuggestions([]);
      setDropdownOpen(false);
      setSearching(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      setDropdownOpen(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=6`;
        const res = await fetch(url, { signal: controller.signal });
        const data: NominatimResult[] = await res.json();
        setSuggestions(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handlePickSuggestion = (s: NominatimResult) => {
    setPicked({ label: s.display_name, lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
    setQuery(s.display_name);
    setDropdownOpen(false);
    setSuggestions([]);
  };

  const canApply = picked !== null && selected.size > 0 && !applying;

  const handleApply = () => {
    if (!canApply || !picked) return;
    onApply(Array.from(selected), picked.lat, picked.lng);
    setSelected(new Set());
  };

  return (
    <div className="location-wrapper">
      <div className="location-bar">
        <div className="location-search" ref={searchBoxRef}>
          <input
            type="text"
            className="location-input"
            placeholder="Search for an address or place…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setDropdownOpen(true)}
          />
          {dropdownOpen && (
            <div className="location-suggestions">
              {searching && <div className="location-suggestion-empty">Searching…</div>}
              {!searching && suggestions.length === 0 && (
                <div className="location-suggestion-empty">No matches</div>
              )}
              {!searching &&
                suggestions.map((s, i) => (
                  <button
                    key={i}
                    className="location-suggestion"
                    onClick={() => handlePickSuggestion(s)}
                  >
                    {s.display_name}
                  </button>
                ))}
            </div>
          )}
        </div>
        <button className="location-apply" onClick={handleApply} disabled={!canApply}>
          {applying ? "Applying…" : `Apply${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </button>
        <span className="location-hint">
          {photos.length === 0
            ? "No pictures without a location"
            : `Select pictures below, then pick a place and apply (RAW not supported) · ${selectableCount} eligible`}
        </span>
      </div>

      <div className="location-scroll">
        <div className="location-grid">
          {photos.map((photo) => {
            const raw = isRawPhoto(photo.path);
            const isSelected = selected.has(photo.path);
            return (
              <button
                key={photo.path}
                className={`location-thumb${isSelected ? " selected" : ""}${raw ? " disabled" : ""}`}
                onClick={() => !raw && toggle(photo.path)}
                disabled={raw}
                title={raw ? "RAW files can't be geotagged in Atlas" : folderBaseName(photo.folder)}
              >
                <img
                  src={convertFileSrc(photo.path)}
                  alt={photo.filename}
                  loading="lazy"
                  draggable={false}
                />
                {isSelected && <span className="location-thumb-check">✓</span>}
                {raw && <span className="location-thumb-raw-badge">RAW</span>}
                <span className="location-thumb-folder">{folderBaseName(photo.folder)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AddLocationsPanel;
