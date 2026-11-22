<#
Ensaio REAL DC-Simu ↔ TIA Portal (manual; exige S7-PLCSIM Advanced e TIA Portal V21 com Openness).
1) cria e liga a instância PLCSIM Advanced (CPU 1511C) «DCSIMU_E2E»;
2) num TIA Portal sem interface e num projeto temporário, importa bridge\tia\e2e\Estampagem.scl,
   compila e carrega o programa pelo interface PLCSIM (Softbus);
3) coloca a CPU em RUN e corre scripts\tia-e2e-plcsim.ts (DC-Simu → ponte → adaptador → CPU);
4) remove a instância e o projeto temporário (use -Keep para os manter).
O utilizador tem de pertencer ao grupo «Siemens TIA Openness». Não toca em projetos abertos no TIA Portal.
Só no projeto temporário e na CPU simulada: utilizador anónimo com «Full access», dados confidenciais sem
proteção e certificado TLS da CPU virtual aceite (com impressão digital registada). Nunca num projeto real.
#>
param([string]$Instance = 'DCSIMU_E2E', [switch]$Keep)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$work = Join-Path $root 'runtime\tia-e2e'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$apiRoot = Join-Path ${env:CommonProgramFiles(x86)} 'Siemens\PLCSIMADV\API'
$sdk = Join-Path (Get-ChildItem $apiRoot -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).FullName 'Siemens.Simatic.Simulation.Runtime.Api.x64.dll'
$openness = 'C:\Program Files\Siemens\Automation\Portal V21\PublicAPI\V21\net48'
if (-not (Test-Path $sdk)) { throw 'S7-PLCSIM Advanced (API .NET) não encontrado.' }
if (-not (Test-Path $openness)) { throw 'TIA Portal V21 Openness não encontrado.' }

# Só recompila quando a fonte muda: cada compilação gera um executável diferente, e o TIA Portal volta a
# pedir a autorização «Openness access» para cada executável novo.
function Build-IfChanged([string]$src, [string]$exe, [string[]]$refs) {
    if ((Test-Path $exe) -and (Get-Item $exe).LastWriteTimeUtc -ge (Get-Item $src).LastWriteTimeUtc) { return }
    & $csc /nologo /target:exe /platform:x64 ($refs | ForEach-Object { "/reference:$_" }) "/out:$exe" $src
    if ($LASTEXITCODE -ne 0) { throw "Falha a compilar $src" }
}
Build-IfChanged (Join-Path $root 'bridge\tia\e2e\SimInstance.cs') "$work\SimInstance.exe" @($sdk)
Build-IfChanged (Join-Path $root 'bridge\tia\e2e\TiaDeploy.cs') "$work\TiaDeploy.exe" @("$openness\Siemens.Engineering.Base.dll", "$openness\Siemens.Engineering.Step7.dll")
& (Join-Path $PSScriptRoot 'Start-TiaBridge.ps1') -Check | Out-Null

try {
    & "$work\SimInstance.exe" $sdk create $Instance
    & "$work\TiaDeploy.exe" $work (Join-Path $root 'bridge\tia\e2e\Estampagem.scl')
    if ($LASTEXITCODE -ne 0) { throw "O carregamento do programa a partir do TIA Portal falhou ($LASTEXITCODE)." }
    & "$work\SimInstance.exe" $sdk run $Instance
    Push-Location $root
    try { $env:TIA_E2E_INSTANCE = $Instance; npx tsx scripts/tia-e2e-plcsim.ts; if ($LASTEXITCODE -ne 0) { throw 'O ensaio DC-Simu ↔ PLCSIM falhou.' } }
    finally { Pop-Location }
}
finally {
    if (-not $Keep) {
        & "$work\SimInstance.exe" $sdk remove $Instance
        Remove-Item -Recurse -Force (Join-Path $work 'proj') -ErrorAction SilentlyContinue
    }
}
