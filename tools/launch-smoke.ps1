$ErrorActionPreference = "Stop"

$port = 43121
$testData = Join-Path (Resolve-Path ".\output") ("launch-state-1.1.2-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $testData -Force | Out-Null
$env:PROMPTBRAIN_PORT = [string]$port
$env:PROMPTBRAIN_DATA_DIR = $testData
$exe = (Resolve-Path ".\output\publish-PromptBrain-1.1.2\PromptBrain.exe").Path
$process = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 80; $attempt += 1) {
        if ($process.HasExited) {
            throw "Packaged app exited during launch with code $($process.ExitCode)."
        }
        Start-Sleep -Milliseconds 250
        $process.Refresh()
        if ($process.MainWindowTitle -match "PromptBrain 1\.1\.2") {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        throw "Packaged app did not finish loading. Running=$(-not $process.HasExited), window=$($process.MainWindowTitle)"
    }

    [pscustomobject]@{
        Result = "PASS"
        ProcessId = $process.Id
        VersionFound = $true
        WindowTitle = $process.MainWindowTitle
        DataRoot = $testData
    } | ConvertTo-Json
}
finally {
    if (-not $process.HasExited) {
        $process.CloseMainWindow() | Out-Null
        if (-not $process.WaitForExit(5000)) {
            $process.Kill()
            $process.WaitForExit()
        }
    }
}
