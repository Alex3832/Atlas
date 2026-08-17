export interface PhotoMeta {
  path: string;
  filename: string;
  date_taken: string | null;
  width: number | null;
  height: number | null;
  camera_make: string | null;
  camera_model: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Photo extends PhotoMeta {
  date: Date | null;
  /** Absolute path of the folder this photo was scanned from. */
  folder: string;
}

/** Parse an EXIF-format date string ("2021:06:14 15:42:00") into a Date, or null. */
export function parseExifDate(raw: string | null): Date | null {
  if (!raw) return null;
  const isoLike = raw.replace(
    /^(\d{4}):(\d{2}):(\d{2})/,
    "$1-$2-$3",
  );
  const date = new Date(isoLike);
  return isNaN(date.getTime()) ? null : date;
}

/** Last path segment of a folder path, for compact display. */
export function folderBaseName(path: string): string {
  if (!path) return "";
  const trimmed = path.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}
