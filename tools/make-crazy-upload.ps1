# Builds crazy-upload/ (what gets uploaded to CrazyGames, 20MB limit) from
# crazy-build/: a copy with JS minified (terser) and CSS minified (clean-css).
# crazy-build/ stays readable — it holds build-only source (crazygames-link.js,
# CrazyGames variants of sb.js, loading-boot.js, ...), so always edit THERE and
# re-run this. Media in crazy-build/ is already recompressed (JPG q75, MP3 112k).
# Usage (from the repo root):  powershell -File tools\make-crazy-upload.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$src  = Join-Path $root 'crazy-build'
$dst  = Join-Path $root 'crazy-upload'

if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item $src $dst -Recurse

$failed = @()
Get-ChildItem (Join-Path $dst 'js') -Recurse -Filter *.js |
  Where-Object { $_.Name -ne 'globequiz-countries-data.js' } |   # pure data, already compact
  ForEach-Object {
    $tmp = "$($_.FullName).min"
    & npx --yes terser@5 $_.FullName --compress --mangle --comments false -o $tmp
    if ($LASTEXITCODE -eq 0 -and (Get-Item $tmp).Length -gt 0) { Move-Item $tmp $_.FullName -Force }
    else { $failed += $_.Name; Remove-Item $tmp -ErrorAction SilentlyContinue }
  }

$css = Join-Path $dst 'css\style.css'
& npx --yes clean-css-cli@5 -O1 -o $css (Join-Path $src 'css\style.css')

$bytes = (Get-ChildItem $dst -Recurse -File | Measure-Object Length -Sum).Sum
if ($failed) { Write-Warning "Left unminified: $($failed -join ', ')" }
'{0:N0} bytes = {1:N2} MB (limit 20 MB)' -f $bytes, ($bytes / 1MB)
