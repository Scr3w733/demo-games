# Build a platform-independent HTML5 ZIP: forward-slash entry names, index.html at root.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$src = (Resolve-Path (Join-Path $PSScriptRoot '..\dist')).Path
$out = Join-Path $PSScriptRoot 'grimhollow-html5.zip'
$tmp = Join-Path $PSScriptRoot 'grimhollow-html5-tmp.zip'

if (Test-Path $tmp) { Remove-Item $tmp -Force }

$zip = [System.IO.Compression.ZipFile]::Open($tmp, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    $name = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
    $entry = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
    $destination = $entry.Open()
    $source = [System.IO.File]::OpenRead($_.FullName)
    try { $source.CopyTo($destination) }
    finally { $source.Dispose(); $destination.Dispose() }
  }
}
finally { $zip.Dispose() }

Move-Item $tmp $out -Force

$check = [System.IO.Compression.ZipFile]::OpenRead($out)
try {
  $names = $check.Entries | ForEach-Object { $_.FullName }
  if ($names | Where-Object { $_ -like '*\*' }) { throw 'ZIP contains backslash paths!' }
  if ($names -notcontains 'index.html') { throw 'ZIP is missing root index.html!' }
  Write-Output "OK: $($names.Count) entries, $((Get-Item $out).Length) bytes"
  $names | Select-Object -First 10
}
finally { $check.Dispose() }
