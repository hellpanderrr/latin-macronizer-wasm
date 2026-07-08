param(
    [string]$FilePath,
    [int]$Bytes = 128
)

Write-Host "=== Hex dump of $FilePath (first $Bytes bytes) ==="
try {
    $bytes = Get-Content -Path $FilePath -Encoding Byte -TotalCount $Bytes -ErrorAction Stop
    for ($i = 0; $i -lt $bytes.Count; $i += 16) {
        $offset = $i.ToString("X4")
        $hexParts = @()
        $asciiParts = @()
        for ($j = 0; $j -lt 16; $j++) {
            $idx = $i + $j
            if ($idx -ge $bytes.Count) {
                $hexParts += "  "
                $asciiParts += "."
            } else {
                $b = $bytes[$idx]
                $hexParts += $b.ToString("X2")
                if ($b -ge 32 -and $b -lt 127) {
                    $asciiParts += [char]$b
                } else {
                    $asciiParts += "."
                }
            }
        }
        $hexLine = $hexParts -join " "
        $asciiLine = $asciiParts -join ""
        Write-Host "$offset: $hexLine  $asciiLine"
    }

    # Check size_t candidates
    if ($bytes.Count -ge 4) {
        $val32 = [BitConverter]::ToUInt32($bytes, 0)
        Write-Host "`nFirst 4 bytes as LE uint32: $val32"
    }
    if ($bytes.Count -ge 8) {
        $val64 = [BitConverter]::ToUInt64($bytes, 0)
        Write-Host "First 8 bytes as LE uint64: $val64"
    }
} catch {
    Write-Error "Failed to read $FilePath: $_"
}
