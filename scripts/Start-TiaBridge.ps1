param(
    [string]$ApiDirectory,
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$tiaRoot = Split-Path -Parent $PSScriptRoot
if (-not $ApiDirectory) {
    $tiaApiRoot = Join-Path ${env:CommonProgramFiles(x86)} 'Siemens\PLCSIMADV\API'
    $tiaApiVersion = Get-ChildItem -LiteralPath $tiaApiRoot -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    if (-not $tiaApiVersion) { throw 'Instale o S7-PLCSIM Advanced com a API .NET. O S7-PLCSIM normal não disponibiliza esta API.' }
    $ApiDirectory = $tiaApiVersion.FullName
}
$tiaSdk = Join-Path $ApiDirectory 'Siemens.Simatic.Simulation.Runtime.Api.x64.dll'
if (-not (Test-Path -LiteralPath $tiaSdk)) { throw "SDK x64 não encontrado: $tiaSdk" }
$tiaCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$tiaBuild = Join-Path $tiaRoot 'runtime\tia-bridge'
New-Item -ItemType Directory -Force -Path $tiaBuild | Out-Null
$tiaExe = Join-Path $tiaBuild 'DcSimu.PlcsimAdapter.exe'
$tiaSource = Join-Path $tiaRoot 'bridge\tia\PlcsimAdapter.cs'
& $tiaCompiler /nologo /target:exe /platform:x64 /optimize+ "/reference:$tiaSdk" /reference:System.Web.Extensions.dll "/out:$tiaExe" $tiaSource
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível compilar o adaptador PLCSIM.' }
if ($Check) {
    $tiaResponse = '{"id":1,"method":"list"}' | & $tiaExe $tiaSdk
    if ($LASTEXITCODE -ne 0) { throw 'A API PLCSIM Advanced não respondeu.' }
    $tiaResponse
    $tiaCheckResult = $tiaResponse | ConvertFrom-Json
    if (-not $tiaCheckResult.ok) { throw "A API PLCSIM Advanced não está disponível: $($tiaCheckResult.error)" }
    exit 0
}
& node (Join-Path $tiaRoot 'bridge\tia\server.mjs') $tiaExe $tiaSdk
exit $LASTEXITCODE
