param(
    [string]$AndroidSdk = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $env:ANDROID_SDK_ROOT }),
    [string]$Apk,
    [switch]$SkipInstall,
    [switch]$Restart
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if ([string]::IsNullOrWhiteSpace($AndroidSdk)) {
    throw "Set ANDROID_HOME or ANDROID_SDK_ROOT, or pass -AndroidSdk."
}
if ([string]::IsNullOrWhiteSpace($Apk)) {
    $Apk = Join-Path $RepoRoot "dist\br-mod-v6.8.apk"
}

$Adb = Join-Path $AndroidSdk "platform-tools\adb.exe"
$Development = Join-Path $RepoRoot "development"
$RemoteRoot = "/sdcard/Android/data/com.br.top/files"
$Payloads = [ordered]@{
    (Join-Path $Development "payload-core-v4.js") = "$RemoteRoot/br_core_v4.js"
    (Join-Path $Development "payload-core-v5-extra.js") = "$RemoteRoot/br_core_v5_extra.js"
    (Join-Path $Development "payload-physics-v6.8.js") = "$RemoteRoot/br_physics_v68.js"
    (Join-Path $Development "payload-v6.8-loader.js") = "$RemoteRoot/payload.js"
}

if (-not (Test-Path -LiteralPath $Adb)) { throw "ADB not found: $Adb" }
foreach ($source in $Payloads.Keys) {
    if (-not (Test-Path -LiteralPath $source)) { throw "Missing payload: $source" }
}

$State = (& $Adb get-state 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $State -ne "device") {
    throw "ADB device is not ready: $State"
}

if (-not $SkipInstall) {
    if (-not (Test-Path -LiteralPath $Apk)) { throw "APK not found: $Apk" }
    & $Adb install -r $Apk
    if ($LASTEXITCODE -ne 0) { throw "APK install failed; payload was not changed" }
}

foreach ($entry in $Payloads.GetEnumerator()) {
    & $Adb push $entry.Key $entry.Value
    if ($LASTEXITCODE -ne 0) { throw "Payload push failed: $($entry.Key)" }
}

if ($Restart) {
    & $Adb shell am force-stop com.br.top
    Start-Sleep -Seconds 1
    & $Adb shell monkey -p com.br.top -c android.intent.category.LAUNCHER 1
}

Write-Host "BR MOD v6.8 payload deployed. Gameplay switches remain controlled by br_cfg.txt."
