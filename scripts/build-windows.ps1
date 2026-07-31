$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host '[Labstar] Validando frontend...'
npm ci
npm run build

if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
  throw 'Rust/rustup não encontrado. Instale o Rust stable antes de gerar o desktop.'
}

Write-Host '[Labstar] Preparando target Windows x64...'
rustup toolchain install stable --profile minimal
rustup default stable
rustup target add x86_64-pc-windows-msvc

Write-Host '[Labstar] Gerando NSIS + MSI com Tauri 2...'
npx --yes @tauri-apps/cli@2 build --target x86_64-pc-windows-msvc --bundles nsis,msi

$Artifacts = Join-Path $Root 'artifacts/windows'
New-Item -ItemType Directory -Force -Path $Artifacts | Out-Null

$Nsis = Get-ChildItem -Path 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis' -Filter '*.exe' -File | Select-Object -First 1
$Msi = Get-ChildItem -Path 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi' -Filter '*.msi' -File | Select-Object -First 1

if (-not $Nsis) { throw 'Instalador NSIS não encontrado.' }
if (-not $Msi) { throw 'Instalador MSI não encontrado.' }

$ExeDest = Join-Path $Artifacts 'Labstar_11.0.0_x64-setup.exe'
$MsiDest = Join-Path $Artifacts 'Labstar_11.0.0_x64.msi'
Copy-Item $Nsis.FullName $ExeDest -Force
Copy-Item $Msi.FullName $MsiDest -Force

$ExeHash = (Get-FileHash $ExeDest -Algorithm SHA256).Hash.ToLowerInvariant()
$MsiHash = (Get-FileHash $MsiDest -Algorithm SHA256).Hash.ToLowerInvariant()
$GitSha = (git rev-parse HEAD).Trim()

@"
Labstar 11.0.0
source_sha=$GitSha
target=x86_64-pc-windows-msvc
exe_sha256=$ExeHash
msi_sha256=$MsiHash
generated_at=$((Get-Date).ToUniversalTime().ToString('o'))
"@ | Set-Content -Encoding utf8 (Join-Path $Artifacts 'build-info.txt')

Write-Host "[Labstar] EXE: $ExeDest"
Write-Host "[Labstar] MSI: $MsiDest"
Write-Host "[Labstar] EXE SHA256: $ExeHash"
Write-Host "[Labstar] MSI SHA256: $MsiHash"
