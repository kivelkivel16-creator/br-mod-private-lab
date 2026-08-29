param(
    [string]$AndroidSdk = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $env:ANDROID_SDK_ROOT }),
    [string]$BuildToolsVersion = "37.0.0",
    [string]$InputApk,
    [string]$Keystore = (Join-Path $env:USERPROFILE ".android\debug.keystore"),
    [string]$SevenZip = "C:\Program Files\7-Zip\7z.exe"
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if ([string]::IsNullOrWhiteSpace($AndroidSdk)) {
    throw "Set ANDROID_HOME or ANDROID_SDK_ROOT, or pass -AndroidSdk."
}
if ([string]::IsNullOrWhiteSpace($InputApk)) {
    $InputApk = Join-Path $RepoRoot "inputs\br-mod-base.apk"
}

$BuildTools = Join-Path $AndroidSdk "build-tools\$BuildToolsVersion"
$AndroidJar = Join-Path $AndroidSdk "platforms\android-36\android.jar"
$BuildRoot = Join-Path $RepoRoot ".build\v6.8"
$DistRoot = Join-Path $RepoRoot "dist"
$Source = Join-Path $RepoRoot "development\v4\src\br\mod\BrMenu.java"
$Unsigned = Join-Path $BuildRoot "br-mod-v6.8-unsigned.apk"
$Aligned = Join-Path $BuildRoot "br-mod-v6.8-aligned.apk"
$Signed = Join-Path $DistRoot "br-mod-v6.8.apk"

foreach ($required in @($InputApk, $AndroidJar, $Source, $Keystore, $SevenZip)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing required file: $required" }
}

if (Test-Path -LiteralPath $BuildRoot) {
    $ResolvedBuild = [System.IO.Path]::GetFullPath($BuildRoot)
    $AllowedRoot = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot ".build"))
    if (-not $ResolvedBuild.StartsWith($AllowedRoot + [System.IO.Path]::DirectorySeparatorChar)) {
        throw "Refusing to remove build directory outside .build: $ResolvedBuild"
    }
    Remove-Item -LiteralPath $ResolvedBuild -Recurse -Force
}

New-Item -ItemType Directory -Path (Join-Path $BuildRoot "classes") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $BuildRoot "dex") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $BuildRoot "rename") -Force | Out-Null
New-Item -ItemType Directory -Path $DistRoot -Force | Out-Null

& javac -encoding UTF-8 -source 8 -target 8 -classpath $AndroidJar `
    -d (Join-Path $BuildRoot "classes") $Source
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

& jar --create --file (Join-Path $BuildRoot "menu-classes.jar") `
    -C (Join-Path $BuildRoot "classes") .
if ($LASTEXITCODE -ne 0) { throw "jar failed" }

& (Join-Path $BuildTools "d8.bat") --min-api 26 --lib $AndroidJar `
    --output (Join-Path $BuildRoot "dex") (Join-Path $BuildRoot "menu-classes.jar")
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Copy-Item -LiteralPath (Join-Path $BuildRoot "dex\classes.dex") `
    -Destination (Join-Path $BuildRoot "rename\classes8.dex")
Copy-Item -LiteralPath $InputApk -Destination $Unsigned

& $SevenZip d -tzip $Unsigned classes8.dex | Out-Null
if ($LASTEXITCODE -ne 0) { throw "7z delete failed" }
Push-Location (Join-Path $BuildRoot "rename")
try {
    & $SevenZip a -tzip $Unsigned classes8.dex -mx=0 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "7z add failed" }
} finally {
    Pop-Location
}

& (Join-Path $BuildTools "zipalign.exe") -f -p 4 $Unsigned $Aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

& (Join-Path $BuildTools "apksigner.bat") sign `
    --ks $Keystore --ks-key-alias androiddebugkey `
    --ks-pass pass:android --key-pass pass:android `
    --out $Signed $Aligned
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

& (Join-Path $BuildTools "apksigner.bat") verify --verbose --print-certs $Signed
if ($LASTEXITCODE -ne 0) { throw "APK verification failed" }
Get-FileHash -Algorithm SHA256 $Signed
