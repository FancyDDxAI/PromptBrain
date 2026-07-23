$ErrorActionPreference = "Stop"
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$project = Join-Path $workspace "tests\PromptBrain.ApiSmokeTest\PromptBrain.ApiSmokeTest.csproj"
dotnet run --project $project -c Release
if ($LASTEXITCODE -ne 0) {
    throw "PromptBrain state API smoke test failed."
}
