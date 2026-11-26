$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot
$python = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Python environment missing. Create .venv and install tools/crimp-generator/requirements.txt first.' }
if (!(Test-Path -LiteralPath 'node_modules')) { throw 'Run npm ci first.' }
$generatorJson = & node --input-type=module -e 'import { GENERATOR_LABS } from ''./src/features/labs/labs.ts''; console.log(JSON.stringify(GENERATOR_LABS.map(({ generator: { tool, port } }) => ({ tool, port }))));'
if ($LASTEXITCODE -ne 0) { throw 'Could not load the lab generator list.' }
$generators = $generatorJson | ConvertFrom-Json
$services = @()
try {
    foreach ($generator in $generators) {
        $entry = Join-Path $repoRoot "tools\$($generator.tool)\serve_api.py"
        $services += Start-Process -FilePath $python -ArgumentList @('"' + $entry + '"') -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
    }
    Start-Sleep -Seconds 2
    foreach ($service in $services) {
        if ($service.HasExited) { throw "A generator failed to start. Check whether these ports are occupied: $($generators.port -join ', ')." }
    }
    & npm.cmd run dev
} finally {
    foreach ($service in $services) {
        if (!$service.HasExited) { Stop-Process -Id $service.Id -ErrorAction SilentlyContinue }
    }
}
