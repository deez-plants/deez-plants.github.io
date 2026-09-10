# Regenerates every app icon in `public/` from the owner's one source render.
#
# The source is `Icons/App Icon 1 3D final png.png` — 1254x1254, fully opaque,
# square corners, artwork inset from the edges. Every rule below depends on
# those four facts, so if the source is ever replaced, check them again before
# trusting this script:
#
#   * opaque, so nothing has to be flattened onto a background colour;
#   * square-cornered, so iOS rounds it once rather than twice;
#   * inset, so iOS's rounding and Android's maskable crop take background
#     and not artwork.
#
# Run from the repo root:  powershell -File Icons/generate-icons.ps1
#
# Uses System.Drawing rather than a node image library on purpose: this runs
# once per icon change, and it is not worth a dependency in package.json.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $PSScriptRoot 'App Icon 1 3D final png.png'
$outDir = Join-Path $root 'public'

if (-not (Test-Path $source)) { throw "Source icon not found: $source" }

# 180: the iOS home-screen touch icon, the only size iOS actually reads here.
# 192 / 512: the web app manifest's two required sizes.
# 512 again as `maskable`: Android may crop up to 10% off each edge, which
#   this artwork's inset absorbs, so it is the same pixels under a different
#   `purpose` rather than a separately padded render.
# 32: the browser tab, for the laptop half of the app.
$sizes = @(
  @{ name = 'apple-touch-icon.png'; size = 180 },
  @{ name = 'icon-192.png';         size = 192 },
  @{ name = 'icon-512.png';         size = 512 },
  @{ name = 'icon-32.png';          size = 32  }
)

$src = [System.Drawing.Image]::FromFile($source)
try {
  foreach ($spec in $sizes) {
    $n = $spec.size
    $bmp = New-Object System.Drawing.Bitmap($n, $n)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.CompositingQuality = 'HighQuality'
      $g.InterpolationMode = 'HighQualityBicubic'
      $g.SmoothingMode = 'HighQuality'
      $g.PixelOffsetMode = 'HighQuality'
      $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $n, $n)))
    } finally {
      $g.Dispose()
    }
    $path = Join-Path $outDir $spec.name
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "wrote $($spec.name) ($n x $n)"
  }
} finally {
  $src.Dispose()
}
