param($filePath)
Add-Type -AssemblyName 'System.IO.Compression.FileSystem'
$zip = [System.IO.Compression.ZipFile]::OpenRead($filePath)
$entry = $zip.Entries | Where-Object { $_.Name -eq 'document.xml' }
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$xml = $reader.ReadToEnd()
$reader.Close()
$zip.Dispose()
$text = [regex]::Replace($xml, '<[^>]+>', ' ')
$text = $text -replace '\s+', ' '
Write-Output $text.Trim()
