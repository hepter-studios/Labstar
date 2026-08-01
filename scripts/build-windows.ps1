$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$SupabaseUrl = 'https://pgzwyngxsxnheulvusdq.supabase.co'
$ApiUrl = 'https://labstar-api-mackson.fly.dev'
$WebPreview = 'https://feat-tauri-auth-rust-integra.labstar.pages.dev/'

function Resolve-LabstarPublicKey {
  $current = [string]$env:VITE_SUPABASE_PUBLISHABLE_KEY
  if ($current.StartsWith('sb_publishable_') -or $current.Length -gt 40) {
    return $current
  }

  Write-Host '[Labstar] Obtendo configuração pública do Web oficial...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $page = (Invoke-WebRequest -UseBasicParsing -Uri $WebPreview -TimeoutSec 30).Content
  $scriptMatches = [regex]::Matches($page, 'src=["'']([^"'']+\.js[^"'']*)["'']')

  foreach ($scriptMatch in $scriptMatches) {
    $assetUrl = [Uri]::new([Uri]$WebPreview, $scriptMatch.Groups[1].Value).AbsoluteUri
    try {
      $javascript = (Invoke-WebRequest -UseBasicParsing -Uri $assetUrl -TimeoutSec 45).Content
      $publishable = [regex]::Match($javascript, 'sb_publishable_[A-Za-z0-9_-]{20,}')
      if ($publishable.Success) { return $publishable.Value }

      $legacyAnon = [regex]::Match($javascript, 'eyJ[A-Za-z0-9_-]{80,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}')
      if ($legacyAnon.Success) { return $legacyAnon.Value }
    } catch {
      Write-Host "[Labstar] Não foi possível ler $assetUrl; tentando o próximo bundle."
    }
  }

  throw 'Não foi possível localizar a chave pública do Supabase no Web oficial. O build foi interrompido para não gerar outro desktop sem login.'
}

$PublicKey = Resolve-LabstarPublicKey
$env:VITE_SUPABASE_URL = $SupabaseUrl
$env:VITE_SUPABASE_PUBLISHABLE_KEY = $PublicKey
$env:VITE_SUPABASE_ANON_KEY = $PublicKey
$env:VITE_LABSTAR_API_URL = $ApiUrl

Write-Host '[Labstar] Configuração pública carregada.'
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

$ExeDest = Join-Path $Artifacts 'Labstar_11.0.1_x64-setup.exe'
$MsiDest = Join-Path $Artifacts 'Labstar_11.0.1_x64.msi'
Copy-Item $Nsis.FullName $ExeDest -Force
Copy-Item $Msi.FullName $MsiDest -Force

$ExeHash = (Get-FileHash $ExeDest -Algorithm SHA256).Hash.ToLowerInvariant()
$MsiHash = (Get-FileHash $MsiDest -Algorithm SHA256).Hash.ToLowerInvariant()
$GitSha = (git rev-parse HEAD).Trim()

@"
Labstar 11.0.1
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
Start-Process explorer.exe $Artifacts
