$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$localCode = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $projectRoot 'src\App.js')).Hash

function Test-DermatologyServer([int]$port) {
    try {
        $base = "http://127.0.0.1:$port"
        $response = Invoke-WebRequest -Uri "$base/src/App.js" -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -ne 200) { return $false }
        $stream = New-Object System.IO.MemoryStream
        try { $response.RawContentStream.CopyTo($stream); $remoteBytes = $stream.ToArray() }
        finally { $stream.Dispose() }
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { $remoteHash = [BitConverter]::ToString($sha.ComputeHash($remoteBytes)).Replace('-', '') }
        finally { $sha.Dispose() }
        if ($remoteHash -ne $localCode) { return $false }
        $config = Invoke-WebRequest -Uri "$base/api/supabase-config" -TimeoutSec 2 -UseBasicParsing
        return $config.StatusCode -eq 200
    } catch { return $false }
}

$port = $null
foreach ($candidate in 8000..8010) {
    if (Test-DermatologyServer $candidate) {
        $port = $candidate
        break
    }
}

if ($null -eq $port) {
    foreach ($candidate in 8000..8010) {
        $listener = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue
        if (-not $listener) {
            $port = $candidate
            break
        }
    }
    if ($null -eq $port) { throw 'Nenhuma porta livre entre 8000 e 8010.' }
    $previousPort = $env:PORT
    try {
        $env:PORT = [string]$port
        Start-Process -FilePath 'python' -ArgumentList 'server.py' -WorkingDirectory $projectRoot -WindowStyle Hidden
    } finally {
        if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue }
        else { $env:PORT = $previousPort }
    }
    $ready = $false
    foreach ($attempt in 1..30) {
        Start-Sleep -Milliseconds 300
        if (Test-DermatologyServer $port) { $ready = $true; break }
    }
    if (-not $ready) { throw "O servidor de Dermatologia não iniciou na porta $port." }
}

Start-Process "http://127.0.0.1:$port/"
