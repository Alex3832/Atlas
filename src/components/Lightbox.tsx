import { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Photo } from "../types";
import "./Lightbox.css";

interface LightboxProps {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function Lightbox({ photos, index, onClose, onNavigate }: LightboxProps) {
  const photo = photos[index];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onNavigate(index + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, photos.length, onClose, onNavigate]);

  if (!photo) return null;

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button
          className="lightbox-nav lightbox-prev"
          disabled={index === 0}
          onClick={() => onNavigate(index - 1)}
          aria-label="Previous photo"
        >
          ‹
        </button>

        <div className="lightbox-image-area">
          <img src={convertFileSrc(photo.path)} alt={photo.filename} />
        </div>

        <button
          className="lightbox-nav lightbox-next"
          disabled={index === photos.length - 1}
          onClick={() => onNavigate(index + 1)}
          aria-label="Next photo"
        >
          ›
        </button>

        <button className="lightbox-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="lightbox-meta">
          <div className="meta-title">{photo.filename}</div>
          <dl>
            <dt>Date</dt>
            <dd>{photo.date ? photo.date.toLocaleString() : "Unknown"}</dd>

            {photo.camera_make || photo.camera_model ? (
              <>
                <dt>Camera</dt>
                <dd>
                  {[photo.camera_make, photo.camera_model].filter(Boolean).join(" ")}
                </dd>
              </>
            ) : null}

            {photo.width && photo.height ? (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {photo.width} × {photo.height}
                </dd>
              </>
            ) : null}

            {photo.latitude != null && photo.longitude != null ? (
              <>
                <dt>Location</dt>
                <dd>
                  {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}

export default Lightbox;
