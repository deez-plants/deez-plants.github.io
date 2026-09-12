# Shrinks a few real seed photos to a size that can be embedded in a mock-up
# page, preserving each one's true aspect ratio.
#
# Aspect ratio is the whole point. DESIGN_REFERENCE.md section 6 records a bug
# already made once — a plant photo in a fixed-height container mismatched to
# its real shape, leaving a pale band above it — and says to test any photo
# treatment against a real, non-square source rather than a placeholder. The
# collection is 24 square photos, one 4:3 and one 3:4, and the camera crops
# nothing, so new photos will be whatever the phone gives. All three shapes
# need to be in the mock-up.
#
# Run from the repo root:  powershell -File Icons/make-mock-photos.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'seed-photos'
$out = Join-Path $env:TEMP 'deez-mock-photos'
New-Item -ItemType Directory -Force -Path $out | Out-Null

# One of each shape the app actually holds.
$picks = @('001-MON', '008-ALO', '002-SNK', '009-SPD', '011-HOL', '014-PTH')
$maxEdge = 480

foreach ($id in $picks) {
  $path = Join-Path $src "$id.jpeg"
  if (-not (Test-Path $path)) { Write-Output "missing $id"; continue }

  $img = [System.Drawing.Image]::FromFile($path)
  try {
    $scale = [Math]::Min($maxEdge / $img.Width, $maxEdge / $img.Height)
    $w = [int]($img.Width * $scale)
    $h = [int]($img.Height * $scale)
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = 'HighQualityBicubic'
      $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)))
    } finally { $g.Dispose() }

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
      Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
      [System.Drawing.Imaging.Encoder]::Quality, 72)

    $dest = Join-Path $out "$id.jpg"
    $bmp.Save($dest, $codec, $params)
    $bmp.Dispose()
    Write-Output "$id -> $w x $h"
  } finally { $img.Dispose() }
}

Write-Output "written to $out"
