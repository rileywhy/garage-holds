$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot
$python = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Python environment missing. Create .venv and install tools/crimp-generator/requirements.txt first.' }
if (!(Test-Path -LiteralPath 'node_modules')) { throw 'Run npm ci first.' }
$services = @()
try {
    foreach ($lab in @('crimp', 'sloper', 'jug')) {
        $entry = Join-Path $repoRoot "tools\$lab-generator\serve_api.py"
        $services += Start-Process -FilePath $python -ArgumentList @('"' + $entry + '"') -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
    }
    Start-Sleep -Seconds 2
    foreach ($service in $services) {
        if ($service.HasExited) { throw 'A generator failed to start. Check whether ports 8766, 8771, or 8781 are already occupied.' }
    }
    & npm.cmd run dev
} finally {
    foreach ($service in $services) {
        if (!$service.HasExited) { Stop-Process -Id $service.Id -ErrorAction SilentlyContinue }
    }
}
