import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Photo } from "../types";
import { folderBaseName } from "../types";
import DateRangeSlider from "./DateRangeSlider";
import "./Timeline.css";

const DAY_MS = 24 * 60 * 60 * 1000;

interface TimelineGroup {
  key: string;
  label: string;
  photos: { photo: Photo; index: number }[];
}

function groupByYear(entries: { photo: Photo; index: number }[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  let current: TimelineGroup | null = null;

  for (const entry of entries) {
    const key = entry.photo.date ? String(entry.photo.date.getFullYear()) : "undated";
    if (!current || current.key !== key) {
      current = { key, label: key === "undated" ? "Undated" : key, photos: [] };
      groups.push(current);
    }
    current.photos.push(entry);
  }

  return groups;
}

interface TimelineProps {
  photos: Photo[];
  onSelect: (index: number) => void;
}

function Timeline({ photos, onSelect }: TimelineProps) {
  const datedPhotos = useMemo(() => photos.filter((p) => p.date), [photos]);

  // Distinct calendar days that have at least one photo, so the slider only
  // spans days with content instead of wasting space on empty date ranges.
  const days = useMemo(() => {
    const set = new Set<number>();
    for (const photo of datedPhotos) {
      const d = photo.date!;
      set.add(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [datedPhotos]);

  const [range, setRange] = useState<[number, number]>([0, Math.max(days.length - 1, 0)]);

  useEffect(() => {
    setRange([0, Math.max(days.length - 1, 0)]);
  }, [days]);

  const groups = useMemo(() => {
    const [startIdx, endIdx] = range;
    const startTs = days.length ? days[startIdx] : 0;
    const endTs = days.length ? days[endIdx] + DAY_MS - 1 : 0;
    const entries = photos
      .map((photo, index) => ({ photo, index }))
      .filter(
        ({ photo }) =>
          !photo.date || (photo.date.getTime() >= startTs && photo.date.getTime() <= endTs),
      );
    return groupByYear(entries);
  }, [photos, range, days]);

  return (
    <div className="timeline-wrapper">
      {days.length > 0 && (
        <DateRangeSlider
          days={days}
          startIndex={range[0]}
          endIndex={range[1]}
          onChange={(startIndex, endIndex) => setRange([startIndex, endIndex])}
        />
      )}
      <div className="timeline-scroll">
        {groups.map((group) => (
          <div className="timeline-group" key={group.key}>
            <div className="group-label">{group.label}</div>
            <div className="group-grid">
              {group.photos.map(({ photo, index }) => (
                <button key={photo.path} className="thumb" onClick={() => onSelect(index)}>
                  <img
                    src={convertFileSrc(photo.path)}
                    alt={photo.filename}
                    loading="lazy"
                    draggable={false}
                  />
                  <span className="thumb-date">
                    {photo.date
                      ? photo.date.toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })
                      : ""}
                    <span className="thumb-folder">{folderBaseName(photo.folder)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Timeline;
