import { useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Photo } from "../types";
import { folderBaseName, isRawPhoto } from "../types";
import "./DateUndatedPanel.css";

interface DateUndatedPanelProps {
  photos: Photo[];
  applying: boolean;
  onApply: (paths: string[], date: Date) => void;
}

function DateUndatedPanel({ photos, applying, onApply }: DateUndatedPanelProps) {
  const [dateValue, setDateValue] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const canApply = dateValue !== "" && selected.size > 0 && !applying;

  const handleApply = () => {
    if (!canApply) return;
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return;
    onApply(Array.from(selected), date);
    setSelected(new Set());
  };

  return (
    <div className="date-undated-wrapper">
      <div className="date-undated-bar">
        <input
          type="datetime-local"
          className="date-undated-input"
          value={dateValue}
          onChange={(e) => setDateValue(e.target.value)}
        />
        <button className="date-undated-apply" onClick={handleApply} disabled={!canApply}>
          {applying ? "Applying…" : `Apply${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </button>
        <span className="date-undated-hint">
          {photos.length === 0
            ? "No undated pictures"
            : `Select pictures below, then pick a date and apply (RAW not supported) · ${selectableCount} eligible`}
        </span>
      </div>

      <div className="date-undated-scroll">
        <div className="date-undated-grid">
          {photos.map((photo) => {
            const raw = isRawPhoto(photo.path);
            const isSelected = selected.has(photo.path);
            return (
              <button
                key={photo.path}
                className={`date-thumb${isSelected ? " selected" : ""}${raw ? " disabled" : ""}`}
                onClick={() => !raw && toggle(photo.path)}
                disabled={raw}
                title={raw ? "RAW files can't be dated in Atlas" : folderBaseName(photo.folder)}
              >
                <img
                  src={convertFileSrc(photo.path)}
                  alt={photo.filename}
                  loading="lazy"
                  draggable={false}
                />
                {isSelected && <span className="date-thumb-check">✓</span>}
                {raw && <span className="date-thumb-raw-badge">RAW</span>}
                <span className="date-thumb-folder">{folderBaseName(photo.folder)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DateUndatedPanel;
