# Live smoke test for the SYSTEM tracker against a real Supabase project.
# Creates two temporary users through the Management API, exercises the RPCs
# (profile, workout with honesty rules, state, friends, leaderboard), then deletes them.
# ASCII only on purpose: PowerShell 5.1 reads BOM-less files as ANSI.
#
# Usage:
#   powershell -File smoke-test.ps1 -Token sbp_xxx
#   powershell -File smoke-test.ps1 -Token sbp_xxx -KeepUsers

param(
  [Parameter(Mandatory = $true)][string]$Token,
  [switch]$KeepUsers,
  [switch]$CleanupOnly,
  [switch]$CheatOnly
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$here = $PSScriptRoot
$configPath = Join-Path (Split-Path -Parent $here) 'config.js'
$cfgText = [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)

$url = [regex]::Match($cfgText, "supabaseUrl:\s*'([^']+)'").Groups[1].Value
$anon = [regex]::Match($cfgText, "supabaseAnonKey:\s*'([^']+)'").Groups[1].Value
if (-not $url -or -not $anon) { throw "config.js has no url/key: $configPath" }
$ref = ([Uri]$url).Host.Split('.')[0]

$mgHeaders = @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' }
$anonHeaders = @{ apikey = $anon; 'Content-Type' = 'application/json' }

$script:fails = 0

function Check([string]$name, [bool]$ok, [string]$detail) {
  if ($ok) { Write-Output ("  OK   {0}" -f $name) }
  else { Write-Output ("  FAIL {0} -- {1}" -f $name, $detail); $script:fails++ }
}

function Call([string]$method, [string]$uri, $body, $headers) {
  $call = @{ Method = $method; Uri = $uri; TimeoutSec = 60 }
  if ($headers) { $call.Headers = $headers }
  if ($null -ne $body) {
    $json = $body | ConvertTo-Json -Depth 8 -Compress
    $call.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    $call.ContentType = 'application/json; charset=utf-8'
  }
  $last = $null
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      $r = Invoke-RestMethod @call
      return @{ ok = $true; status = 200; data = $r }
    } catch {
      $resp = $_.Exception.Response
      if ($resp) {
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
        return @{ ok = $false; status = [int]$resp.StatusCode; data = $sr.ReadToEnd() }
      }
      $last = $_.Exception.Message
      Start-Sleep -Seconds 3
    }
  }
  return @{ ok = $false; status = 0; data = $last }
}

Write-Output ("project: ref={0} url={1}" -f $ref, $url)

$stamp = [DateTime]::UtcNow.ToString('HHmmss')
$email1 = "smoke1-$stamp@example.com"
$email2 = "smoke2-$stamp@example.com"
$pass = 'Smoke-Test-9241'
$nick1 = "smoke1-$stamp"
$nick2 = "smoke2-$stamp"

function Sign-Up([string]$email, [string]$nickname) {
  return Call 'POST' "$url/auth/v1/signup" @{ email = $email; password = $pass; data = @{ nickname = $nickname } } $anonHeaders
}

function Sign-In([string]$email) {
  return Call 'POST' "$url/auth/v1/token?grant_type=password" @{ email = $email; password = $pass } $anonHeaders
}

function Sql([string]$query) {
  return Call 'POST' "https://api.supabase.com/v1/projects/$ref/database/query" @{ query = $query } $mgHeaders
}

function Auth-Headers([string]$token) {
  return @{ apikey = $anon; Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
}

if ($CleanupOnly) {
  $del = Sql "delete from auth.users where email like 'smoke%@example.com';"
  Write-Output ("cleanup delete: ok={0} {1}" -f $del.ok, $del.data)
  $left = Sql "select count(*)::int as users from auth.users where email like 'smoke%@example.com';"
  Write-Output ("leftover users: {0}" -f ($left.data | ConvertTo-Json -Depth 4 -Compress))
  return
}

if ($CheatOnly) {
  $stampC = [DateTime]::UtcNow.ToString('HHmmss')
  $mailC = "smoke-cheat-$stampC@example.com"
  Write-Output 'direct cheating checks'
  $su = Call 'POST' "$url/auth/v1/signup" @{ email = $mailC; password = $pass; data = @{ nickname = "smoke-cheat-$stampC" } } $anonHeaders
  Check 'sign up cheat user' ($su.ok -and $su.data.access_token) $su.data
  if (-not $su.ok) { return }
  $uid = $su.data.user.id
  $h = Auth-Headers $su.data.access_token
  $ins = Call 'POST' "$url/rest/v1/workouts" @{
    id = "direct-$stampC"; user_id = $uid; at = '2026-10-14T10:00:00Z';
    type = 'power'; minutes = 600; intensity = 'max'; exp = 99999
  } $h
  Check 'direct insert into workouts rejected' (-not $ins.ok) $ins.data
  $pat = Call 'PATCH' "$url/rest/v1/profiles?id=eq.$uid" @{ total_exp = 999999; banned = $false } $h
  Check 'direct profile update rejected' (-not $pat.ok) $pat.data
  $prof = Sql "select coalesce(total_exp, -1)::int as e from profiles where id = '$uid';"
  Check 'profile exp still 0' ($prof.ok -and $prof.data[0].e -eq 0) $prof.data
  $del = Sql "delete from auth.users where email like 'smoke%@example.com';"
  Check 'cheat user deleted' $del.ok $del.data
  Write-Output ''
  if ($script:fails -eq 0) { Write-Output 'RESULT: all checks passed' } else { Write-Output ("RESULT: failures = {0}" -f $script:fails) }
  return
}

Write-Output ''
Write-Output '1. sign up and sign in test users'
$u1 = Sign-Up $email1 $nick1
Check 'sign up user 1' ($u1.ok -and $u1.data.access_token) $u1.data
$u2 = Sign-Up $email2 $nick2
Check 'sign up user 2' ($u2.ok -and $u2.data.access_token) $u2.data
if (-not $u1.ok -or -not $u2.ok) { throw 'cannot continue without users' }
$id1 = $u1.data.user.id
$id2 = $u2.data.user.id
$h1 = Auth-Headers $u1.data.access_token
$h2 = Auth-Headers $u2.data.access_token

$s1 = Sign-In $email1
Check 'sign in user 1 with password' ($s1.ok -and $s1.data.access_token) $s1.data
$s2 = Sign-In $email2
Check 'sign in user 2 with password' ($s2.ok -and $s2.data.access_token) $s2.data

Write-Output ''
Write-Output '2. profile'
$sp1 = Call 'POST' "$url/rest/v1/rpc/set_profile" @{ p_nickname = $nick1; p_cls = 'scout' } $h1
Check 'set_profile' $sp1.ok $sp1.data
$sp2 = Call 'POST' "$url/rest/v1/rpc/set_profile" @{ p_nickname = $nick2; p_cls = 'warrior' } $h2
Check 'set_profile for friend' $sp2.ok $sp2.data

Write-Output ''
Write-Output '3. workouts and honesty rules'
$w1 = Call 'POST' "$url/rest/v1/rpc/log_workout" @{
  p_id = "smoke-$stamp-a"; p_at = ([DateTime]::UtcNow.ToString('o')); p_type = 'power';
  p_minutes = 45; p_intensity = 'mid'; p_note = 'smoke'; p_exp = 87
} $h1
Check 'honest workout credited' ($w1.ok -and $w1.data.exp -gt 0) $w1.data

$w2 = Call 'POST' "$url/rest/v1/rpc/log_workout" @{
  p_id = "smoke-$stamp-b"; p_at = ([DateTime]::UtcNow.ToString('o')); p_type = 'power';
  p_minutes = 300; p_intensity = 'mid'; p_note = 'smoke'; p_exp = 500
} $h1
Check 'implausible workout flagged' ($w2.ok -and $w2.data.flag) $w2.data
Check 'flagged workout gives no exp' ($w2.ok -and $w2.data.exp -eq 0) $w2.data
Check 'flag mentions the 240 minute rule' ($w2.ok -and $w2.data.flag -match '240') $w2.data

Write-Output ''
Write-Output '4. state and violations'
$st = Call 'POST' "$url/rest/v1/rpc/my_state" @{} $h1
Check 'my_state returns own profile' ($st.ok -and $st.data.profile.nickname -eq $nick1) $st.data
Check 'violation recorded' ($st.ok -and $st.data.violations24h -ge 1) $st.data
Check 'level matches exp' ($st.ok -and $st.data.profile.level -ge 1) $st.data

Write-Output ''
Write-Output '4b. server text encoding'
$enc = Sql "select ascii(substr(reason, 1, 1)) as a from violations order by created_at desc limit 1;"
Check 'reason text stored as cyrillic (1079 = z)' ($enc.ok -and $enc.data[0].a -eq 1079) $enc.data

Write-Output ''
Write-Output '5. friends'
$fr = Call 'POST' "$url/rest/v1/rpc/send_friend_request" @{ p_nickname = $nick2 } $h1
Check 'friend request sent' ($fr.ok -and $fr.data) $fr.data
$lf = Call 'POST' "$url/rest/v1/rpc/list_friends" @{} $h2
Check 'request visible as incoming' ($lf.ok -and $lf.data.Count -ge 1 -and $lf.data[0].incoming) $lf.data
$an = Call 'POST' "$url/rest/v1/rpc/answer_friend_request" @{ p_friend = $id1; p_accept = $true } $h2
Check 'friend request accepted' ($an.ok -and $an.data) $an.data
$lf2 = Call 'POST' "$url/rest/v1/rpc/list_friends" @{} $h1
Check 'friendship stored as accepted' ($lf2.ok -and $lf2.data.Count -ge 1 -and $lf2.data[0].status -eq 'accepted') $lf2.data

Write-Output ''
Write-Output '6. leaderboard'
$lb = Call 'POST' "$url/rest/v1/rpc/leaderboard" @{} $h1
Check 'leaderboard lists both hunters' ($lb.ok -and $lb.data.Count -ge 2) $lb.data
if ($lb.ok -and $lb.data.Count -ge 1) {
  $me = $lb.data | Where-Object { $_.me } | Select-Object -First 1
  Check 'leaderboard marks me' ($null -ne $me -and $me.nickname -eq $nick1) $lb.data
}

Write-Output ''
Write-Output '7. client cannot cheat directly'
$direct = Call 'POST' "$url/rest/v1/workouts" @{
  id = "direct-$stamp"; user_id = $id1; at = ([DateTime]::UtcNow.ToString('o'));
  type = 'power'; minutes = 600; intensity = 'max'; exp = 99999
} $h1
Check 'direct insert into workouts rejected' (-not $direct.ok) $direct.data
$self = Call 'PATCH' "$url/rest/v1/profiles?id=eq.$id1" @{ total_exp = 999999; banned = $false } $h1
Check 'direct profile update rejected' (-not $self.ok) $self.data

Write-Output ''
Write-Output '8. cleanup'
if ($KeepUsers) {
  Write-Output ("  skipped. test users left: {0}, {1}" -f $email1, $email2)
} else {
  $del = Sql "delete from auth.users where email like 'smoke%@example.com';"
  Check 'delete test users' $del.ok $del.data
  $left = Sql "select count(*)::int as c from profiles where nickname like 'smoke%';"
  Check 'no test data left' ($left.ok -and $left.data[0].c -eq 0) $left.data
}

Write-Output ''
if ($script:fails -eq 0) { Write-Output 'RESULT: all checks passed' } else { Write-Output ("RESULT: failures = {0}" -f $script:fails) }
