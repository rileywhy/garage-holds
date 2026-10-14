$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
& (Join-Path $repoPath '.venv/Scripts/python.exe') (Join-Path $repoPath 'api/custom_shape.py')
