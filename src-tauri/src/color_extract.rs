use image::{DynamicImage, GenericImageView, Rgba};

/// Extract dominant colors from an image URL or local path.
/// Returns up to `count` colors as hex strings.
/// Only allows known image hosts (YouTube, Google, Apple Music) to prevent SSRF.
#[tauri::command]
pub async fn extract_colors(image_url: String, count: usize) -> Result<Vec<String>, String> {
    // Whitelist de URLs permitidas (solo fuentes de thumbnails conocidas)
    let allowed_prefixes = [
        "https://i.ytimg.com/",
        "https://lh3.googleusercontent.com/",
        "https://yt3.googleusercontent.com/",
        "https://is1-ssl.mzstatic.com/",
        "https://is2-ssl.mzstatic.com/",
        "https://is3-ssl.mzstatic.com/",
        "https://is4-ssl.mzstatic.com/",
        "https://is5-ssl.mzstatic.com/",
    ];

    let is_allowed = |url: &str| -> bool {
        if url.starts_with("http://") || url.starts_with("https://") {
            allowed_prefixes.iter().any(|&prefix| url.starts_with(prefix))
        } else {
            // Only allow local files from covers directory
            let allowed_dirs = ["downloads\\covers", "downloads/covers", "downloads"];
            allowed_dirs.iter().any(|dir| url.contains(dir))
        }
    };

    if !is_allowed(&image_url) {
        return Err(format!("URL no permitida: solo thumbnails de YouTube/Google/Apple Music"));
    }

    // Download or load image bytes
    let bytes = if image_url.starts_with("http") {
        reqwest::get(&image_url)
            .await
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?
            .to_vec()
    } else {
        std::fs::read(&image_url).map_err(|e| e.to_string())?
    };

    // Decode image
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;

    // Resize to tiny 32x32 — blur won't show loss of detail, massively faster
    let small = img.resize_exact(32, 32, image::imageops::FilterType::Nearest);

    // Simple k-means style: collect pixels, quantize, pick top N
    let colors = dominant_colors(&small, count.min(5));

    Ok(colors)
}

/// Sample all pixels, quantize to buckets, return top N as hex
fn dominant_colors(img: &DynamicImage, n: usize) -> Vec<String> {
    // Bucket size: quantize each channel to 32-step buckets (256/8)
    const BUCKET: u8 = 32;
    let mut counts: std::collections::HashMap<(u8, u8, u8), u32> = std::collections::HashMap::new();

    for (_x, _y, Rgba([r, g, b, a])) in img.pixels() {
        if a < 128 {
            continue;
        } // skip transparent
          // Skip near-black and near-white (boring colors)
        let brightness = (r as u32 + g as u32 + b as u32) / 3;
        if brightness < 20 || brightness > 235 {
            continue;
        }
        let key = (
            r / BUCKET * BUCKET,
            g / BUCKET * BUCKET,
            b / BUCKET * BUCKET,
        );
        *counts.entry(key).or_insert(0) += 1;
    }

    // Sort by frequency
    let mut sorted: Vec<_> = counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));

    // Pick top N, ensuring they're visually distinct (min distance)
    let mut result: Vec<(u8, u8, u8)> = Vec::new();
    for ((r, g, b), _) in sorted {
        let is_distinct = result.iter().all(|(er, eg, eb)| {
            let dr = (*er as i32 - r as i32).abs();
            let dg = (*eg as i32 - g as i32).abs();
            let db = (*eb as i32 - b as i32).abs();
            dr + dg + db > 80
        });
        if is_distinct {
            result.push((r, g, b));
        }
        if result.len() >= n {
            break;
        }
    }

    // If not enough distinct colors, fill with defaults
    while result.len() < n.min(2) {
        result.push((30, 30, 40));
    }

    result
        .iter()
        .map(|(r, g, b)| format!("#{:02x}{:02x}{:02x}", r, g, b))
        .collect()
}
