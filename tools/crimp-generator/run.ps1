param(
    [ValidateRange(1024, 65535)][int]$Port = 8765,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$toolDirectory = $PSScriptRoot
$environmentPython = Join-Path $toolDirectory '.venv/Scripts/python.exe'
$requirements = Join-Path $toolDirectory 'requirements.txt'

if (-not (Test-Path -LiteralPath $environmentPython)) {
    $candidatePython = @()
    $bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    foreach ($name in @('python', 'python3')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { $candidatePython += $command.Source }
    }
    if (Test-Path -LiteralPath $bundledPython) { $candidatePython += $bundledPython }
    $basePython = $null
    foreach ($candidate in $candidatePython) {
        # Windows Store aliases display an installation prompt, not a Python runtime.
        if ($candidate -like '*\WindowsApps\*') { continue }
        & $candidate -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>$null
        if ($LASTEXITCODE -eq 0) { $basePython = $candidate; break }
    }
    if (-not $basePython) { throw 'Install Python 3.12 or newer and add it to PATH, then run this launcher again.' }
    $venvDirectory = Join-Path $toolDirectory '.venv'
    if ($basePython -eq $bundledPython) {
        # The bundled runtime already has pip; its embedded Python cannot run ensurepip.
        & $basePython -m venv --without-pip --system-site-packages $venvDirectory
    } else {
        & $basePython -m venv $venvDirectory
    }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
}

# Re-running pip is quick when the pinned dependencies are already installed.
& $environmentPython -m pip install --disable-pip-version-check -r $requirements
if ($LASTEXITCODE -ne 0) { throw 'Could not install the geometry dependencies.' }
$serverArguments = @((Join-Path $toolDirectory 'server.py'), '--port', $Port)
if ($NoBrowser) { $serverArguments += '--no-browser' }
& $environmentPython @serverArguments
if ($LASTEXITCODE -ne 0) { throw 'Crimp Lab could not start. See the message above.' }
