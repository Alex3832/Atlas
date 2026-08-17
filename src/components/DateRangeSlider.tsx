import { useCallback, useMemo, useRef, useState } from "react";
import "./DateRangeSlider.css";

interface DateRangeSliderProps {
  /** Sorted ascending, unique day-start timestamps (ms) for days that have photos. */
  days: number[];
  startIndex: number;
  endIndex: number;
  onChange: (startIndex: number, endIndex: number) => void;
}

function DateRangeSlider({ days, startIndex, endIndex, onChange }: DateRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const lastIndex = Math.max(days.length - 1, 1);
  const indexToPct = (i: number) => (i / lastIndex) * 100;

  const startPct = indexToPct(startIndex);
  const endPct = indexToPct(endIndex);

  const posToIndex = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(pct * lastIndex);
    },
    [lastIndex],
  );

  const handlePointerDown = (thumb: "start" | "end") => (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragging(thumb);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const index = posToIndex(e.clientX);
    if (dragging === "start") {
      onChange(Math.min(index, endIndex), endIndex);
    } else {
      onChange(startIndex, Math.max(index, startIndex));
    }
  };

  const handlePointerUp = () => setDragging(null);

  // One tick per calendar year present, placed at the index of that year's first day-with-photos.
  const ticks = useMemo(() => {
    const result: { index: number; year: number }[] = [];
    let lastYear: number | null = null;
    days.forEach((ts, i) => {
      const year = new Date(ts).getFullYear();
      if (year !== lastYear) {
        result.push({ index: i, year });
        lastYear = year;
      }
    });
    return result;
  }, [days]);

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="date-range-slider">
      <div className="range-labels">
        <span>{days[startIndex] != null ? formatDate(days[startIndex]) : ""}</span>
        <span>{days[endIndex] != null ? formatDate(days[endIndex]) : ""}</span>
      </div>
      <div
        className="slider-track"
        ref={trackRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="slider-rail" />
        {ticks.map((tick) => (
          <div
            key={tick.year}
            className="slider-tick"
            style={{ left: `${indexToPct(tick.index)}%` }}
          >
            <span className="tick-label">{tick.year}</span>
          </div>
        ))}
        <div
          className="slider-range-fill"
          style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 0)}%` }}
        />
        <div
          className="slider-thumb"
          style={{ left: `${startPct}%` }}
          onPointerDown={handlePointerDown("start")}
        />
        <div
          className="slider-thumb"
          style={{ left: `${endPct}%` }}
          onPointerDown={handlePointerDown("end")}
        />
      </div>
    </div>
  );
}

export default DateRangeSlider;
