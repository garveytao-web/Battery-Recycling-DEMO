$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
if (-not (Test-Path '.env')) { throw 'Configure .env before starting the service.' }
# Configure this script as a Windows scheduled task at startup with a dedicated
# service account. Do not run the development environment through public nginx.
while ($true) {
    & node --env-file=.env server/index.cjs
    Write-Warning "API process exited with code $LASTEXITCODE. Restarting in 5 seconds."
    Start-Sleep -Seconds 5
}
