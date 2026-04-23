param(
  [string]$SourceIcon = "$PSScriptRoot\..\..\public\iconHD.png",
  [string[]]$OutputDirs = @("$PSScriptRoot\..\public\assets", "$PSScriptRoot\..\public\word\assets")
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$resolvedSource = Resolve-Path -LiteralPath $SourceIcon
$resolvedOutputs = $OutputDirs | ForEach-Object {
  $resolved = [System.IO.Path]::GetFullPath($_)
  New-Item -ItemType Directory -Force -Path $resolved | Out-Null
  $resolved
}

$source = [System.Drawing.Image]::FromFile($resolvedSource)
try {
  foreach ($size in @(16, 32, 64, 80)) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($source, 0, 0, $size, $size)
        foreach ($resolvedOutput in $resolvedOutputs) {
          $bitmap.Save((Join-Path $resolvedOutput "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        }
      } finally {
        $graphics.Dispose()
      }
    } finally {
      $bitmap.Dispose()
    }
  }
} finally {
  $source.Dispose()
}

Write-Host "Synced Refx icons into:"
$resolvedOutputs | ForEach-Object { Write-Host "- $_" }
