$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$src = Split-Path -Parent $here
$chat = Split-Path -Parent (Split-Path -Parent $src)
$bundle = Join-Path $chat 'hunter-system.html'
$out = Join-Path $src 'app'

if (-not (Test-Path -LiteralPath $bundle)) { throw "bundle not found: $bundle" }

New-Item -ItemType Directory -Force -Path $out | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $out 'icons') | Out-Null

$html = [System.IO.File]::ReadAllText($bundle, [System.Text.Encoding]::UTF8)

$head = '<link rel="manifest" href="manifest.json">' + "`r`n" +
        '<meta name="theme-color" content="#04060d">' + "`r`n" +
        '<meta name="apple-mobile-web-app-capable" content="yes">'
$html = $html.Replace('</head>', $head + "`r`n</head>")

$sw = '<script>if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(function(){});}</script>'
$html = $html.Replace('</body>', $sw + "`r`n</body>")

[System.IO.File]::WriteAllText((Join-Path $out 'index.html'), $html, (New-Object System.Text.UTF8Encoding($false)))

Copy-Item -LiteralPath (Join-Path $here 'manifest.json') -Destination $out -Force
Copy-Item -LiteralPath (Join-Path $here 'sw.js') -Destination $out -Force

Add-Type -AssemblyName System.Drawing

function New-Icon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 4, 6, 13))

  $cyan = [System.Drawing.Color]::FromArgb(255, 92, 225, 255)
  $ember = [System.Drawing.Color]::FromArgb(255, 255, 154, 60)
  $cx = [float]($size / 2.0)

  $pen = New-Object System.Drawing.Pen($cyan, [float]($size * 0.05))
  $m = [float]($size * 0.15)
  $g.DrawEllipse($pen, $m, $m, [float]($size - 2 * $m), [float]($size - 2 * $m))

  $r = [float]($size * 0.24)
  $pts = New-Object 'System.Drawing.PointF[]' 4
  $pts[0] = New-Object System.Drawing.PointF($cx, [float]($cx - $r))
  $pts[1] = New-Object System.Drawing.PointF([float]($cx + $r), $cx)
  $pts[2] = New-Object System.Drawing.PointF($cx, [float]($cx + $r))
  $pts[3] = New-Object System.Drawing.PointF([float]($cx - $r), $cx)
  $brush = New-Object System.Drawing.SolidBrush($cyan)
  $g.FillPolygon($brush, $pts)

  $dot = New-Object System.Drawing.SolidBrush($ember)
  $g.FillEllipse($dot, [float]($cx - $size * 0.045), [float]($size * 0.80), [float]($size * 0.09), [float]($size * 0.09))

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 192 (Join-Path $out 'icons\icon-192.png')
New-Icon 512 (Join-Path $out 'icons\icon-512.png')

Get-ChildItem -LiteralPath $out -Recurse -File | ForEach-Object { $_.FullName.Substring($out.Length + 1) + '  ' + $_.Length }
