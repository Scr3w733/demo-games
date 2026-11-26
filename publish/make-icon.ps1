Add-Type -AssemblyName System.Drawing

$W = 960
$H = 540
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor

function C($r, $g0, $b, $a = 255) { return [System.Drawing.Color]::FromArgb($a, $r, $g0, $b) }
function Brush($c) { return New-Object System.Drawing.SolidBrush($c) }
function Rect($x, $y, $w, $h, $c) { $g.FillRectangle((Brush $c), [int]$x, [int]$y, [int]$w, [int]$h) }
function Ell($x, $y, $w, $h, $c) { $g.FillEllipse((Brush $c), [int]$x, [int]$y, [int]$w, [int]$h) }
function Poly($pts, $c) { $g.FillPolygon((Brush $c), $pts) }

# Background: cold crypt darkness
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0,0)),
  (New-Object System.Drawing.Point(0,$H)),
  (C 5 8 14), (C 18 25 38))
$g.FillRectangle($grad, 0, 0, $W, $H)

# Warm torch glow, layered radial alpha
for ($r = 360; $r -ge 30; $r -= 30) {
  $a = [int](7 + (360 - $r) / 360 * 26)
  Ell (670 - $r) (170 - $r) ($r*2) ($r*2) (C 255 150 50 $a)
}

# Crypt arches in the background
$archColors = @(@(28,38,52), @(22,31,44), @(28,38,52))
$xs = @(90, 390, 690)
for ($i = 0; $i -lt 3; $i++) {
  $x = $xs[$i]
  $col = C $archColors[$i][0] $archColors[$i][1] $archColors[$i][2]
  $g.FillPie((Brush $col), $x, 90, 180, 180, 180, 180)
  Rect $x 180 180 250 $col
  Rect ($x-16) 170 24 270 (C 12 18 28)
  Rect ($x+172) 170 24 270 (C 12 18 28)
  Rect ($x+8) 196 164 8 (C 42 54 70)
}

# Stone floor
Rect 0 430 $W 110 (C 11 15 23)
for ($y = 440; $y -lt $H; $y += 26) {
  Rect 0 $y $W 3 (C 24 31 43)
  for ($x = (($y / 26) % 2) * 60; $x -lt $W; $x += 120) { Rect $x $y 3 26 (C 24 31 43) }
}

# Huge skull emblem behind the hero
Ell 330 70 300 250 (C 199 190 166)
Ell 360 100 240 190 (C 222 213 186)
Ell 392 160 66 66 (C 12 17 25)
Ell 502 160 66 66 (C 12 17 25)
Ell 408 173 34 34 (C 110 255 220)
Ell 518 173 34 34 (C 110 255 220)
Poly @((New-Object System.Drawing.Point(480,225)),(New-Object System.Drawing.Point(455,285)),(New-Object System.Drawing.Point(505,285))) (C 16 20 28)
Rect 392 280 176 62 (C 205 196 164)
for ($x = 402; $x -lt 558; $x += 26) { Rect $x 282 5 58 (C 35 35 40) }

# Hooded survivor silhouette
$cloak = @(
  (New-Object System.Drawing.Point(410,540)),
  (New-Object System.Drawing.Point(420,330)),
  (New-Object System.Drawing.Point(452,286)),
  (New-Object System.Drawing.Point(510,278)),
  (New-Object System.Drawing.Point(560,320)),
  (New-Object System.Drawing.Point(600,540)))
Poly $cloak (C 7 11 18)
Ell 444 250 108 118 (C 9 13 21)
Poly @((New-Object System.Drawing.Point(460,310)),(New-Object System.Drawing.Point(468,268)),(New-Object System.Drawing.Point(530,262)),(New-Object System.Drawing.Point(544,312))) (C 4 7 12)
Ell 478 292 20 12 (C 130 255 226)
Ell 516 290 20 12 (C 130 255 226)

# Torch, flame and sparks
Rect 636 190 10 180 (C 96 66 42)
Rect 634 190 14 14 (C 196 138 74)
Poly @((New-Object System.Drawing.Point(641,60)),(New-Object System.Drawing.Point(600,190)),(New-Object System.Drawing.Point(641,160)),(New-Object System.Drawing.Point(682,190))) (C 255 122 34)
Poly @((New-Object System.Drawing.Point(641,92)),(New-Object System.Drawing.Point(617,182)),(New-Object System.Drawing.Point(641,162)),(New-Object System.Drawing.Point(665,182))) (C 255 206 92)
Ell 630 132 22 34 (C 255 240 170)
Ell 606 106 9 9 (C 255 190 70 190)
Ell 692 130 7 7 (C 255 190 70 190)
Ell 588 76 5 5 (C 255 220 120 190)

# Light rays
$ray = @((New-Object System.Drawing.Point(641,150)),(New-Object System.Drawing.Point(120,430)),(New-Object System.Drawing.Point(260,430)))
Poly $ray (C 255 176 70 26)
$ray2 = @((New-Object System.Drawing.Point(641,150)),(New-Object System.Drawing.Point(780,430)),(New-Object System.Drawing.Point(940,430)))
Poly $ray2 (C 255 176 70 20)

# Frame and title
$g.DrawRectangle((New-Object System.Drawing.Pen((C 196 158 70), 8)), 12, 12, ($W-24), ($H-24))
$g.DrawRectangle((New-Object System.Drawing.Pen((C 90 68 34), 3)), 24, 24, ($W-48), ($H-48))

$titleFont = New-Object System.Drawing.Font('Georgia', 56, [System.Drawing.FontStyle]::Bold)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('NECROPOLIS', $titleFont, (Brush (C 232 211 152)), (New-Object System.Drawing.RectangleF(0, 452, $W, 62)), $sf)
$subFont = New-Object System.Drawing.Font('Georgia', 22, [System.Drawing.FontStyle]::Bold)
$g.DrawString('LAST LIGHT', $subFont, (Brush (C 168 132 66)), (New-Object System.Drawing.RectangleF(0, 506, $W, 30)), $sf)

# Downscale 2x with nearest-neighbour for crisp pixel-art edges
$small = New-Object System.Drawing.Bitmap(480, 270)
$g2 = [System.Drawing.Graphics]::FromImage($small)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g2.DrawImage($bmp, 0, 0, 480, 270)

$out = Join-Path $PSScriptRoot 'game-icon.png'
$small.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

# Full-resolution variant for platforms that require a larger thumbnail.
$large = Join-Path $PSScriptRoot 'game-icon-large.png'
$bmp.Save($large, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $g2.Dispose(); $bmp.Dispose(); $small.Dispose()
Write-Output $out
Write-Output $large
