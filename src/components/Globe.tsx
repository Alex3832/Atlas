import { useEffect, useMemo, useRef, useState } from "react";
import GlobeGL, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Photo } from "../types";
import countriesGeoJson from "../assets/globe/countries.json";
import "./Globe.css";

const POINT_ALTITUDE = 0.01;
const DOT_PIXEL_SIZE = 0.02;
const MIN_ALTITUDE = 0.35;
const MAX_ALTITUDE = 4;
const ZOOM_FACTOR = 0.75;

const OCEAN_COLOR = "#aad3f2";
const LAND_COLOR = "#d7e3c1";
const BORDER_COLOR = "#8fae7a";

interface CountryFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

const countryFeatures = (countriesGeoJson as unknown as { features: CountryFeature[] })
  .features;

const oceanMaterial = new THREE.MeshBasicMaterial({ color: OCEAN_COLOR });
const landCapMaterial = new THREE.MeshBasicMaterial({ color: LAND_COLOR });
const landSideMaterial = new THREE.MeshBasicMaterial({ color: LAND_COLOR });

interface GlobePoint {
  photo: Photo;
  index: number;
  lat: number;
  lng: number;
}

interface GlobeViewProps {
  photos: Photo[];
  onSelect: (index: number) => void;
}

// Shared across all dots: a small circular canvas texture used as the
// sprite's map, and a material with sizeAttenuation disabled so sprites
// render at a constant pixel size regardless of camera distance/zoom.
function makeDotMaterial(): THREE.SpriteMaterial {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = "#4a9eff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.stroke();

  return new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    sizeAttenuation: false,
    transparent: true,
    depthTest: true,
  });
}

const dotMaterial = makeDotMaterial();

function GlobeView({ photos, onSelect }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<GlobePoint | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    globeRef.current.pointOfView({ altitude: 2.2 }, 0);
  }, []);

  // Keep the preview pinned to the dot's projected screen position, even as
  // the globe rotates while a point is hovered.
  useEffect(() => {
    if (!hovered) {
      setPreviewPos(null);
      return;
    }

    let frame: number;
    const update = () => {
      if (globeRef.current) {
        const coords = globeRef.current.getScreenCoords(
          hovered.lat,
          hovered.lng,
          POINT_ALTITUDE,
        );
        setPreviewPos({ x: coords.x, y: coords.y });
      }
      frame = requestAnimationFrame(update);
    };
    update();

    return () => cancelAnimationFrame(frame);
  }, [hovered]);

  const handleZoom = (factor: number) => {
    if (!globeRef.current) return;
    const pov = globeRef.current.pointOfView();
    const altitude = Math.min(
      MAX_ALTITUDE,
      Math.max(MIN_ALTITUDE, pov.altitude * factor),
    );
    globeRef.current.pointOfView({ ...pov, altitude }, 300);
  };

  const points = useMemo<GlobePoint[]>(
    () =>
      photos
        .map((photo, index) => ({ photo, index }))
        .filter(({ photo }) => photo.latitude != null && photo.longitude != null)
        .map(({ photo, index }) => ({
          photo,
          index,
          lat: photo.latitude!,
          lng: photo.longitude!,
        })),
    [photos],
  );

  return (
    <div className="globe-wrapper" ref={containerRef}>
      {points.length === 0 ? (
        <div className="placeholder">
          <p>None of your photos have GPS location data yet</p>
        </div>
      ) : (
        size.width > 0 && (
          <>
            <GlobeGL
              ref={globeRef}
              width={size.width}
              height={size.height}
              globeMaterial={oceanMaterial}
              backgroundColor="rgba(0,0,0,0)"
              showAtmosphere
              atmosphereColor="#4a9eff"
              atmosphereAltitude={0.18}
              polygonsData={countryFeatures}
              polygonGeoJsonGeometry={(d) => (d as CountryFeature).geometry as never}
              polygonCapMaterial={landCapMaterial}
              polygonSideMaterial={landSideMaterial}
              polygonStrokeColor={() => BORDER_COLOR}
              polygonAltitude={0.005}
              pointsData={[]}
              htmlElementsData={[]}
              objectsData={points}
              objectLat="lat"
              objectLng="lng"
              objectAltitude={POINT_ALTITUDE}
              objectThreeObject={() => {
                const sprite = new THREE.Sprite(dotMaterial);
                sprite.scale.set(DOT_PIXEL_SIZE, DOT_PIXEL_SIZE, 1);
                return sprite;
              }}
              onObjectHover={(o) => {
                const point = (o as GlobePoint | null) ?? null;
                setHovered(point);
                if (point !== null && globeRef.current) {
                  globeRef.current.controls().autoRotate = false;
                }
              }}
              onObjectClick={(o) => {
                if (globeRef.current) globeRef.current.controls().autoRotate = false;
                onSelect((o as GlobePoint).index);
              }}
            />
            {hovered && previewPos && (
              <div
                className="globe-point-preview"
                style={{ left: previewPos.x, top: previewPos.y }}
              >
                <img
                  src={convertFileSrc(hovered.photo.path)}
                  alt={hovered.photo.filename}
                  draggable={false}
                />
                <span>{hovered.photo.filename}</span>
              </div>
            )}
            <div className="globe-zoom-controls">
              <button
                className="globe-zoom-btn"
                onClick={() => handleZoom(ZOOM_FACTOR)}
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
              <button
                className="globe-zoom-btn"
                onClick={() => handleZoom(1 / ZOOM_FACTOR)}
                aria-label="Zoom out"
                title="Zoom out"
              >
                −
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}

export default GlobeView;
