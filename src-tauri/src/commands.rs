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

/// Supported image extensions
fn is_image(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "heic" | "heif" | "tiff" | "tif" | "webp" | "raw" | "cr2" | "nef" | "arw")
    )
}

/// Read EXIF from a single file and return a PhotoMeta struct
fn read_exif(path: &Path) -> PhotoMeta {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

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
            // Date/time
            if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
                date_taken = Some(field.display_value().to_string());
            }

            // Dimensions
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

            // Camera
            if let Some(field) = exif.get_field(exif::Tag::Make, exif::In::PRIMARY) {
                camera_make = Some(field.display_value().to_string().trim_matches('"').to_string());
            }
            if let Some(field) = exif.get_field(exif::Tag::Model, exif::In::PRIMARY) {
                camera_model = Some(field.display_value().to_string().trim_matches('"').to_string());
            }

            // GPS
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
                        let lat_deg = lat_v[0].to_f64();
                        let lat_min = lat_v[1].to_f64();
                        let lat_sec = lat_v[2].to_f64();
                        let mut lat_val = lat_deg + lat_min / 60.0 + lat_sec / 3600.0;

                        let lon_deg = lon_v[0].to_f64();
                        let lon_min = lon_v[1].to_f64();
                        let lon_sec = lon_v[2].to_f64();
                        let mut lon_val = lon_deg + lon_min / 60.0 + lon_sec / 3600.0;

                        let lat_ref = lat_ref_field.display_value().to_string();
                        let lon_ref = lon_ref_field.display_value().to_string();

                        if lat_ref.contains('S') { lat_val = -lat_val; }
                        if lon_ref.contains('W') { lon_val = -lon_val; }

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

/// Tauri command: scan a directory for images and return metadata for each
#[tauri::command]
pub fn scan_photos(dir: String) -> Vec<PhotoMeta> {
    WalkDir::new(&dir)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && is_image(e.path()))
        .map(|e| read_exif(e.path()))
        .collect()
}
