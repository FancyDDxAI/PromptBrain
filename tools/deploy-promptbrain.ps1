[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PublishPath,

    [string]$InstallPath = "E:\PromptBrain"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$publish = (Get-Item -LiteralPath $PublishPath).FullName
$install = (Get-Item -LiteralPath $InstallPath).FullName
$sourceExe = Join-Path $publish "PromptBrain.exe"
$targetExe = Join-Path $install "PromptBrain.exe"
$statePath = Join-Path $install "data\promptbrain-state.json"
$protectedNames = @("data", "models", "runtime", "runtimes")
$allowedFiles = @(
    "PromptBrain.exe",
    "PromptBrain.pdb",
    "Microsoft.Web.WebView2.Core.xml",
    "Microsoft.Web.WebView2.WinForms.xml"
)

if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) {
    throw "The publish directory does not contain PromptBrain.exe: $publish"
}

if (Get-Process -Name "PromptBrain" -ErrorAction SilentlyContinue) {
    throw "PromptBrain is running. Close it before deployment so state can flush safely."
}

$unexpectedDirectories = Get-ChildItem -LiteralPath $publish -Directory -Force |
    Where-Object { $_.Name -in $protectedNames }
if ($unexpectedDirectories) {
    throw "Publish output contains a protected directory and will not be deployed: $($unexpectedDirectories.Name -join ', ')"
}

$protectedBefore = @{}
foreach ($name in $protectedNames) {
    $path = Join-Path $install $name
    $protectedBefore[$name] = Test-Path -LiteralPath $path -PathType Container
}

$stateHashBefore = if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    (Get-FileHash -Algorithm SHA256 -LiteralPath $statePath).Hash
} else {
    ""
}

$backupDirectory = Join-Path $install "backups"
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupExe = Join-Path $backupDirectory "PromptBrain-$stamp.exe"
if (Test-Path -LiteralPath $targetExe -PathType Leaf) {
    Copy-Item -LiteralPath $targetExe -Destination $backupExe
}

$copied = @()
foreach ($name in $allowedFiles) {
    $source = Join-Path $publish $name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        continue
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $install $name) -Force
    $copied += $name
}

$sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceExe).Hash
$targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetExe).Hash
if ($sourceHash -ne $targetHash) {
    throw "Installed executable hash does not match the verified publish artifact."
}

foreach ($name in $protectedNames) {
    $path = Join-Path $install $name
    if ($protectedBefore[$name] -and -not (Test-Path -LiteralPath $path -PathType Container)) {
        throw "Protected installation directory disappeared during deployment: $path"
    }
}

$stateHashAfter = if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    (Get-FileHash -Algorithm SHA256 -LiteralPath $statePath).Hash
} else {
    ""
}
if ($stateHashBefore -ne $stateHashAfter) {
    throw "The user state file changed during deployment."
}

[pscustomobject]@{
    Result = "PASS"
    InstallPath = $install
    BackupExe = if (Test-Path -LiteralPath $backupExe) { $backupExe } else { "" }
    CopiedFiles = $copied
    InstalledExeSha256 = $targetHash
    StateSha256 = $stateHashAfter
    ProtectedDirectories = $protectedNames | Where-Object { Test-Path -LiteralPath (Join-Path $install $_) -PathType Container }
} | ConvertTo-Json -Depth 4
