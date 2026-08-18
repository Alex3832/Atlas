use little_exif::exif_tag::ExifTag;
use little_exif::metadata::Metadata;
use little_exif::rational::uR64;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct PhotoMeta {
    pub path: String,
    pub filename: String,
    /// EXIF date string, e.g. "2021:06:14 15:42:00"
    pub date_taken: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

/// Camera RAW formats: not covered by `little_exif`'s format support (JPEG,
/// PNG, TIFF, HEIF, WebP), so these are still read via `kamadak-exif`.
const RAW_EXTENSIONS: &[&str] = &["raw", "cr2", "nef", "arw"];

/// Formats `little_exif` can read (and, later, write) natively.
const LITTLE_EXIF_EXTENSIONS: &[&str] =
    &["jpg", "jpeg", "png", "heic", "heif", "tiff", "tif", "webp"];

fn extension_of(path: &Path) -> Option<String> {
    path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase())
}

/// Supported image extensions
fn is_image(path: &Path) -> bool {
    match extension_of(path) {
        Some(ext) => {
            RAW_EXTENSIONS.contains(&ext.as_str()) || LITTLE_EXIF_EXTENSIONS.contains(&ext.as_str())
        }
        None => false,
    }
}

fn empty_meta(path: &Path) -> PhotoMeta {
    PhotoMeta {
        path: path.to_string_lossy().to_string(),
        filename: path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
        date_taken: None,
        width: None,
        height: None,
        camera_make: None,
        camera_model: None,
        latitude: None,
        longitude: None,
    }
}

/// Read EXIF from a RAW file (CR2/NEF/ARW/RAW) via `kamadak-exif`.
fn read_exif_raw(path: &Path) -> PhotoMeta {
    let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    let path_str = path.to_string_lossy().to_string();

    let mut date_taken = None;
    let mut width = None;
    let mut height = None;
    let mut camera_make = None;
    let mut camera_model = None;
    let mut latitude: Option<f64> = None;
    let mut longitude: Option<f64> = None;

    if let Ok(file) = std::fs::File::open(path) {
        let mut bufreader = std::io::BufReader::new(file);
        let exif_reader = exif::Reader::new();
        if let Ok(exif) = exif_reader.read_from_container(&mut bufreader) {
            if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
                date_taken = Some(field.display_value().to_string());
            }

            if let Some(field) = exif.get_field(exif::Tag::PixelXDimension, exif::In::PRIMARY) {
                if let exif::Value::Long(ref v) = field.value {
                    width = v.first().copied();
                }
            }
            if let Some(field) = exif.get_field(exif::Tag::PixelYDimension, exif::In::PRIMARY) {
                if let exif::Value::Long(ref v) = field.value {
                    height = v.first().copied();
                }
            }

            if let Some(field) = exif.get_field(exif::Tag::Make, exif::In::PRIMARY) {
                camera_make = Some(field.display_value().to_string().trim_matches('"').to_string());
            }
            if let Some(field) = exif.get_field(exif::Tag::Model, exif::In::PRIMARY) {
                camera_model = Some(field.display_value().to_string().trim_matches('"').to_string());
            }

            if let (Some(lat_field), Some(lat_ref_field), Some(lon_field), Some(lon_ref_field)) = (
                exif.get_field(exif::Tag::GPSLatitude, exif::In::PRIMARY),
                exif.get_field(exif::Tag::GPSLatitudeRef, exif::In::PRIMARY),
                exif.get_field(exif::Tag::GPSLongitude, exif::In::PRIMARY),
                exif.get_field(exif::Tag::GPSLongitudeRef, exif::In::PRIMARY),
            ) {
                if let (exif::Value::Rational(lat_v), exif::Value::Rational(lon_v)) =
                    (&lat_field.value, &lon_field.value)
                {
                    if lat_v.len() >= 3 && lon_v.len() >= 3 {
                        let mut lat_val =
                            lat_v[0].to_f64() + lat_v[1].to_f64() / 60.0 + lat_v[2].to_f64() / 3600.0;
                        let mut lon_val =
                            lon_v[0].to_f64() + lon_v[1].to_f64() / 60.0 + lon_v[2].to_f64() / 3600.0;

                        if lat_ref_field.display_value().to_string().contains('S') {
                            lat_val = -lat_val;
                        }
                        if lon_ref_field.display_value().to_string().contains('W') {
                            lon_val = -lon_val;
                        }

                        latitude = Some(lat_val);
                        longitude = Some(lon_val);
                    }
                }
            }
        }
    }

    PhotoMeta {
        path: path_str,
        filename,
        date_taken,
        width,
        height,
        camera_make,
        camera_model,
        latitude,
        longitude,
    }
}

/// Read EXIF from a JPEG/PNG/TIFF/HEIF/WebP file via `little_exif`.
fn read_exif_little(path: &Path) -> PhotoMeta {
    let mut meta = empty_meta(path);

    let Ok(metadata) = Metadata::new_from_path(path) else {
        return meta;
    };

    if let Some(ExifTag::DateTimeOriginal(s)) =
        metadata.get_tag(&ExifTag::DateTimeOriginal(String::new())).next()
    {
        meta.date_taken = Some(s.clone());
    }

    if let Some(ExifTag::ExifImageWidth(v)) =
        metadata.get_tag(&ExifTag::ExifImageWidth(vec![])).next()
    {
        meta.width = v.first().copied();
    }
    if let Some(ExifTag::ExifImageHeight(v)) =
        metadata.get_tag(&ExifTag::ExifImageHeight(vec![])).next()
    {
        meta.height = v.first().copied();
    }
    // Fall back to the TIFF-native ImageWidth/ImageHeight tags if the EXIF
    // sub-IFD ones aren't present.
    if meta.width.is_none() {
        if let Some(ExifTag::ImageWidth(v)) = metadata.get_tag(&ExifTag::ImageWidth(vec![])).next() {
            meta.width = v.first().copied();
        }
    }
    if meta.height.is_none() {
        if let Some(ExifTag::ImageHeight(v)) = metadata.get_tag(&ExifTag::ImageHeight(vec![])).next() {
            meta.height = v.first().copied();
        }
    }

    if let Some(ExifTag::Make(s)) = metadata.get_tag(&ExifTag::Make(String::new())).next() {
        meta.camera_make = Some(s.trim().to_string());
    }
    if let Some(ExifTag::Model(s)) = metadata.get_tag(&ExifTag::Model(String::new())).next() {
        meta.camera_model = Some(s.trim().to_string());
    }

    let lat = metadata.get_tag(&ExifTag::GPSLatitude(vec![])).next();
    let lat_ref = metadata.get_tag(&ExifTag::GPSLatitudeRef(String::new())).next();
    let lon = metadata.get_tag(&ExifTag::GPSLongitude(vec![])).next();
    let lon_ref = metadata.get_tag(&ExifTag::GPSLongitudeRef(String::new())).next();

    if let (
        Some(ExifTag::GPSLatitude(lat_v)),
        Some(ExifTag::GPSLatitudeRef(lat_r)),
        Some(ExifTag::GPSLongitude(lon_v)),
        Some(ExifTag::GPSLongitudeRef(lon_r)),
    ) = (lat, lat_ref, lon, lon_ref)
    {
        if lat_v.len() >= 3 && lon_v.len() >= 3 && lat_v[0].denominator != 0
            && lat_v[1].denominator != 0
            && lat_v[2].denominator != 0
            && lon_v[0].denominator != 0
            && lon_v[1].denominator != 0
            && lon_v[2].denominator != 0
        {
            let deg_min_sec = |v: &[little_exif::rational::uR64]| {
                v[0].nominator as f64 / v[0].denominator as f64
                    + v[1].nominator as f64 / v[1].denominator as f64 / 60.0
                    + v[2].nominator as f64 / v[2].denominator as f64 / 3600.0
            };

            let mut lat_val = deg_min_sec(lat_v);
            let mut lon_val = deg_min_sec(lon_v);

            if lat_r.contains('S') {
                lat_val = -lat_val;
            }
            if lon_r.contains('W') {
                lon_val = -lon_val;
            }

            meta.latitude = Some(lat_val);
            meta.longitude = Some(lon_val);
        }
    }

    meta
}

/// Read EXIF from a single file and return a PhotoMeta struct.
fn read_exif(path: &Path) -> PhotoMeta {
    match extension_of(path) {
        Some(ext) if RAW_EXTENSIONS.contains(&ext.as_str()) => read_exif_raw(path),
        Some(ext) if LITTLE_EXIF_EXTENSIONS.contains(&ext.as_str()) => read_exif_little(path),
        _ => empty_meta(path),
    }
}

/// Tauri command: scan a directory for images and return metadata for each.
/// Runs on a blocking-friendly thread so a large folder (or a slow EXIF
/// parse) never freezes the app's main UI thread.
#[tauri::command]
pub async fn scan_photos(dir: String) -> Vec<PhotoMeta> {
    tauri::async_runtime::spawn_blocking(move || {
        WalkDir::new(&dir)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file() && is_image(e.path()))
            .map(|e| read_exif(e.path()))
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// Tauri command: write `DateTimeOriginal` into a photo's EXIF data.
/// Only supported for the formats `little_exif` can write (JPEG, PNG, TIFF,
/// HEIF, WebP) — RAW files (CR2/NEF/ARW) are rejected rather than risking
/// corruption of an irreplaceable source file. Runs off the main thread for
/// the same reason as `scan_photos`.
#[tauri::command]
pub async fn set_photo_date(path: String, date: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path_ref = Path::new(&path);

        match extension_of(path_ref) {
            Some(ext) if LITTLE_EXIF_EXTENSIONS.contains(&ext.as_str()) => {
                let mut metadata =
                    Metadata::new_from_path(path_ref).map_err(|e| e.to_string())?;
                metadata.set_tag(ExifTag::DateTimeOriginal(date));
                metadata.write_to_file(path_ref).map_err(|e| e.to_string())
            }
            Some(ext) if RAW_EXTENSIONS.contains(&ext.as_str()) => {
                Err("RAW files can't be dated in Atlas".to_string())
            }
            _ => Err("Unsupported file type".to_string()),
        }
    })
    .await
    .unwrap_or_else(|e| Err(e.to_string()))
}

/// Convert decimal degrees into EXIF's degrees/minutes/seconds rational triple.
fn decimal_to_dms(decimal: f64) -> Vec<uR64> {
    let abs = decimal.abs();
    let degrees = abs.floor();
    let minutes_full = (abs - degrees) * 60.0;
    let minutes = minutes_full.floor();
    let seconds = (minutes_full - minutes) * 60.0;

    vec![
        uR64 { nominator: degrees as u32, denominator: 1 },
        uR64 { nominator: minutes as u32, denominator: 1 },
        uR64 { nominator: (seconds * 1000.0).round() as u32, denominator: 1000 },
    ]
}

/// Tauri command: write GPS coordinates into a photo's EXIF data.
/// Same format restriction as `set_photo_date` — RAW files are rejected.
#[tauri::command]
pub async fn set_photo_gps(path: String, lat: f64, lng: f64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path_ref = Path::new(&path);

        match extension_of(path_ref) {
            Some(ext) if LITTLE_EXIF_EXTENSIONS.contains(&ext.as_str()) => {
                let mut metadata =
                    Metadata::new_from_path(path_ref).map_err(|e| e.to_string())?;
                metadata.set_tag(ExifTag::GPSLatitudeRef(
                    if lat >= 0.0 { "N" } else { "S" }.to_string(),
                ));
                metadata.set_tag(ExifTag::GPSLatitude(decimal_to_dms(lat)));
                metadata.set_tag(ExifTag::GPSLongitudeRef(
                    if lng >= 0.0 { "E" } else { "W" }.to_string(),
                ));
                metadata.set_tag(ExifTag::GPSLongitude(decimal_to_dms(lng)));
                metadata.write_to_file(path_ref).map_err(|e| e.to_string())
            }
            Some(ext) if RAW_EXTENSIONS.contains(&ext.as_str()) => {
                Err("RAW files can't be geotagged in Atlas".to_string())
            }
            _ => Err("Unsupported file type".to_string()),
        }
    })
    .await
    .unwrap_or_else(|e| Err(e.to_string()))
}
