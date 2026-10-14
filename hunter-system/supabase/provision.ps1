# Supabase provisioning helper for the SYSTEM tracker.
# Uses the official Management API with a Personal Access Token (PAT), never a password.
#
# Read-only by default: lists organizations and projects, shows the project ref and status.
# Add switches to act:
#   -RunSchema     -> runs supabase/schema.sql in the chosen project
#   -WriteConfig   -> writes URL + anon key into sites/hunter-system/config.js
#   -CreateIfMissing -CreateProject -> creates a free project if none is found
#
# Examples:
#   powershell -File provision.ps1 -Token sbp_xxx
#   powershell -File provision.ps1 -Token sbp_xxx -RunSchema -WriteConfig
#   powershell -File provision.ps1 -Token sbp_xxx -CreateProject -DbPass 'Stro9gPass' -RunSchema -WriteConfig

param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$Ref = '',
  [switch]$RunSchema,
  [switch]$WriteConfig,
  [switch]$CreateProject,
  [string]$ProjectName = 'system-tracker',
  [string]$Region = 'eu-central-1',
  [string]$DbPass = ''
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$api = 'https://api.supabase.com'
$headers = @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' }
$here = $PSScriptRoot
$sqlPath = Join-Path $here 'schema.sql'
$configPath = Join-Path (Split-Path -Parent $here) 'config.js'

function Api([string]$method, [string]$path, $body) {
  $call = @{ Method = $method; Uri = ($api + $path); Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $body) {
    $json = $body | ConvertTo-Json -Depth 8 -Compress
    $call.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    $call.ContentType = 'application/json; charset=utf-8'
  }
  try {
    return Invoke-RestMethod @call
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $text = $sr.ReadToEnd()
      throw "API $method $path -> $([int]$resp.StatusCode): $text"
    }
    throw "API $method $path -> $($_.Exception.Message)"
  }
}

Write-Output '== organizations =='
$orgs = Api 'GET' '/v1/organizations' $null
foreach ($o in $orgs) { Write-Output ("{0}  {1}" -f $o.id, $o.name) }
if (-not $orgs -or $orgs.Count -eq 0) { throw 'No organizations found for this token.' }

Write-Output ''
Write-Output '== projects =='
$projects = Api 'GET' '/v1/projects' $null
foreach ($p in $projects) {
  Write-Output ("ref={0}  name={1}  region={2}  status={3}" -f $p.id, $p.name, $p.region, $p.status)
}

$target = $null
if ($Ref) {
  $target = $projects | Where-Object { $_.id -eq $Ref } | Select-Object -First 1
  if (-not $target) { throw "Project with ref $Ref not found." }
} elseif ($projects -and $projects.Count -gt 0) {
  $target = $projects | Sort-Object -Property created_at -Descending | Select-Object -First 1
  Write-Output ''
  Write-Output ("Using newest project as target: ref={0} name={1}" -f $target.id, $target.name)
}

if (-not $target) {
  if (-not $CreateProject) {
    Write-Output ''
    Write-Output 'No projects found. Re-run with -CreateProject -DbPass <strong password> to create one.'
    return
  }
  if (-not $DbPass) { throw 'DbPass is required to create a project.' }
  $org = $orgs | Select-Object -First 1
  Write-Output ''
  Write-Output ("Creating project '{0}' in {1} ..." -f $ProjectName, $Region)
  $created = Api 'POST' '/v1/projects' @{
    organization_id = $org.id
    name            = $ProjectName
    region          = $Region
    db_pass         = $DbPass
    plan            = 'free'
  }
  $Ref = $created.id
  Write-Output ("Created ref={0}. Waiting for it to become active ..." -f $Ref)
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 15
    $info = Api 'GET' ("/v1/projects/{0}" -f $Ref) $null
    Write-Output ("status: {0}" -f $info.status)
    if ($info.status -eq 'ACTIVE_HEALTHY') { break }
  }
  $target = Api 'GET' ("/v1/projects/{0}" -f $Ref) $null
}

$ref = $target.id
$url = "https://$ref.supabase.co"
Write-Output ''
Write-Output ("Target project: ref={0}  url={1}  status={2}" -f $ref, $url, $target.status)

if ($RunSchema) {
  if (-not (Test-Path -LiteralPath $sqlPath)) { throw "schema.sql not found: $sqlPath" }
  $sql = [System.IO.File]::ReadAllText($sqlPath, [System.Text.Encoding]::UTF8)
  Write-Output ''
  Write-Output ("Running schema.sql ({0} chars) in {1} ..." -f $sql.Length, $ref)
  $res = Api 'POST' ("/v1/projects/{0}/database/query" -f $ref) @{ query = $sql }
  Write-Output 'Schema applied.'
  if ($res) { $res | ConvertTo-Json -Depth 4 -Compress | Write-Output }
}

$anon = ''
$keys = Api 'GET' ("/v1/projects/{0}/api-keys?reveal=true" -f $ref) $null
foreach ($k in $keys) {
  if ($k.name -eq 'anon' -or $k.type -eq 'publishable' -or $k.name -eq 'publishable') {
    if ($k.api_key) { $anon = $k.api_key }
  }
}
if (-not $anon) {
  Write-Output ''
  Write-Output 'Anon/publishable key was not returned by the API. Copy it from Settings -> API Keys.'
} else {
  Write-Output ''
  Write-Output 'Anon key received (hidden).'
}

if ($WriteConfig -and $anon) {
  $js = "var CONFIG = {`r`n  supabaseUrl: '$url',`r`n  supabaseAnonKey: '$anon'`r`n};`r`n`r`nfunction sbConfigured() {`r`n  return !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);`r`n}`r`n"
  [System.IO.File]::WriteAllText($configPath, $js, (New-Object System.Text.UTF8Encoding($false)))
  Write-Output ("config.js written: {0}" -f $configPath)
}
