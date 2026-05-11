use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
#[cfg(target_os = "linux")]
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn pasted_image_name() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("pasted-image-{ts}.png")
}

#[derive(Serialize)]
pub struct ClipboardImage {
    file_name: String,
    mime: String,
    data_base64: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn read_clipboard_image() -> Result<Option<ClipboardImage>, String> {
    #[cfg(target_os = "linux")]
    if let Some(image) = read_linux_clipboard_png()? {
        return Ok(Some(image));
    }

    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("Failed to access clipboard: {e}"))?;
    let image = match clipboard.get_image() {
        Ok(image) => image,
        Err(arboard::Error::ContentNotAvailable) => return Ok(None),
        Err(e) => return Err(format!("Failed to read clipboard image: {e}")),
    };

    let png = encode_png(
        image.width as u32,
        image.height as u32,
        image.bytes.as_ref(),
    )?;
    Ok(Some(ClipboardImage {
        file_name: pasted_image_name(),
        mime: "image/png".to_string(),
        data_base64: general_purpose::STANDARD.encode(png),
    }))
}

#[cfg(target_os = "linux")]
fn read_linux_clipboard_png() -> Result<Option<ClipboardImage>, String> {
    for (bin, args) in [
        ("wl-paste", &["--type", "image/png", "--no-newline"][..]),
        (
            "xclip",
            &["-selection", "clipboard", "-t", "image/png", "-o"][..],
        ),
    ] {
        let output = match Command::new(bin).args(args).output() {
            Ok(output) => output,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(format!("Failed to run {bin}: {e}")),
        };
        if !output.status.success() || output.stdout.is_empty() {
            continue;
        }
        return Ok(Some(ClipboardImage {
            file_name: pasted_image_name(),
            mime: "image/png".to_string(),
            data_base64: general_purpose::STANDARD.encode(output.stdout),
        }));
    }
    Ok(None)
}

fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| format!("Failed to encode clipboard image: {e}"))?;
        writer
            .write_image_data(rgba)
            .map_err(|e| format!("Failed to encode clipboard image: {e}"))?;
    }
    Ok(out)
}
