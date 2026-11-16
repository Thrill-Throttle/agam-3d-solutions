$ErrorActionPreference = "Stop"

$GoogleClientId = "277482533691-uqgpo8eka7hhgv5usqic3b0f9hllsbmb.apps.googleusercontent.com"
$AdminEmail = "akileshan2023@gmail.com"
$AllowedOrigin = if ($env:AGAM_ALLOWED_ORIGIN) { $env:AGAM_ALLOWED_ORIGIN.TrimEnd("/") } else { "http://localhost:8000" }
$AllowedUri = [Uri]$AllowedOrigin
$SessionCookie = "agam_session"
$SessionMaxAge = 43200
$SiteRoot = (Resolve-Path $PSScriptRoot).Path.TrimEnd("\") + "\"

if ($env:AGAM_SESSION_SECRET) {
  $SessionSecret = [Text.Encoding]::UTF8.GetBytes($env:AGAM_SESSION_SECRET)
} else {
  $SessionSecret = [byte[]]::new(32)
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($SessionSecret)
  $rng.Dispose()
  Write-Host "Using a temporary session key; Google sessions will end when this server stops."
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function ConvertFrom-Base64Url([string]$Value) {
  $normalized = $Value.Replace("-", "+").Replace("_", "/")
  switch ($normalized.Length % 4) {
    2 { $normalized += "==" }
    3 { $normalized += "=" }
  }
  return [Convert]::FromBase64String($normalized)
}

function New-SessionToken([string]$Email, [string]$Name) {
  $payload = @{ email = $Email; name = $Name; expires = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + $SessionMaxAge } |
    ConvertTo-Json -Compress
  $encodedPayload = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($payload))
  $hmac = [Security.Cryptography.HMACSHA256]::new($SessionSecret)
  try {
    $signature = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::ASCII.GetBytes($encodedPayload)))
  } finally {
    $hmac.Dispose()
  }
  return "$encodedPayload.$signature"
}

function Send-Json($Context, [int]$Status, $Payload, [string]$SetCookie = "") {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Compress -Depth 6))
  $response = $Context.Response
  $response.StatusCode = $Status
  $response.ContentType = "application/json; charset=utf-8"
  $response.Headers["Cache-Control"] = "no-store"
  if ($SetCookie) { $response.Headers.Add("Set-Cookie", $SetCookie) }
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
}

function Get-Session($Context) {
  $cookie = $Context.Request.Cookies[$SessionCookie]
  if (-not $cookie -or -not $cookie.Value) { return $null }
  $parts = $cookie.Value.Split(".")
  if ($parts.Length -ne 2) { return $null }
  try {
    $hmac = [Security.Cryptography.HMACSHA256]::new($SessionSecret)
    try {
      $expected = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::ASCII.GetBytes($parts[0])))
    } finally {
      $hmac.Dispose()
    }
    $providedBytes = [Text.Encoding]::ASCII.GetBytes($parts[1])
    $expectedBytes = [Text.Encoding]::ASCII.GetBytes($expected)
    if ($providedBytes.Length -ne $expectedBytes.Length) { return $null }
    $difference = 0
    for ($index = 0; $index -lt $providedBytes.Length; $index++) {
      $difference = $difference -bor ($providedBytes[$index] -bxor $expectedBytes[$index])
    }
    if ($difference -ne 0) { return $null }
    $payload = [Text.Encoding]::UTF8.GetString((ConvertFrom-Base64Url $parts[0])) | ConvertFrom-Json
    if ([long]$payload.expires -le [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) { return $null }
    return $payload
  } catch {
    return $null
  }
}

function Get-SecureCookieSuffix {
  if ($AllowedUri.Scheme -eq "https") { return "; Secure" }
  return ""
}

function Write-StaticFile($Context) {
  $relativePath = [Uri]::UnescapeDataString($Context.Request.Url.AbsolutePath.TrimStart("/"))
  if (-not $relativePath) { $relativePath = "index.html" }
  $fullPath = [IO.Path]::GetFullPath([IO.Path]::Combine($SiteRoot, $relativePath))
  if (-not $fullPath.StartsWith($SiteRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Send-Json $Context 403 @{ error = "Forbidden." }
    return
  }
  if (-not [IO.File]::Exists($fullPath)) {
    Send-Json $Context 404 @{ error = "Not found." }
    return
  }
  $mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css" = "text/css; charset=utf-8"
    ".js" = "text/javascript; charset=utf-8"
    ".png" = "image/png"
    ".jpg" = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".svg" = "image/svg+xml"
    ".ico" = "image/x-icon"
  }
  $extension = [IO.Path]::GetExtension($fullPath).ToLowerInvariant()
  $bytes = [IO.File]::ReadAllBytes($fullPath)
  $Context.Response.StatusCode = 200
  $Context.Response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
  if ($fullPath -eq [IO.Path]::Combine($SiteRoot, "assets", "keychain-service-worker.js")) {
    $Context.Response.Headers["Service-Worker-Allowed"] = "/"
  }
  $Context.Response.ContentLength64 = $bytes.Length
  if ($Context.Request.HttpMethod -ne "HEAD") { $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
  $Context.Response.Close()
}

function Handle-Request($Context) {
  $path = $Context.Request.Url.AbsolutePath
  $method = $Context.Request.HttpMethod
  if ($method -eq "GET" -and $path -eq "/api/session") {
    $session = Get-Session $Context
    if (-not $session) {
      Send-Json $Context 200 @{ authenticated = $false }
      return
    }
    $email = ([string]$session.email).ToLowerInvariant()
    Send-Json $Context 200 @{
      authenticated = $true
      name = [string]$session.name
      email = $email
      isAdmin = ($email -eq $AdminEmail)
    }
    return
  }
  if ($method -eq "POST" -and $path -in @("/api/auth/google", "/api/logout")) {
    if ($Context.Request.Headers["Origin"] -ne $AllowedOrigin -or $Context.Request.UserHostName -ne $AllowedUri.Authority) {
      Send-Json $Context 403 @{ error = "Request origin is not allowed." }
      return
    }
    if ($path -eq "/api/logout") {
      $clearCookie = "$SessionCookie=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0$(Get-SecureCookieSuffix)"
      Send-Json $Context 200 @{ ok = $true } $clearCookie
      return
    }
    if ($Context.Request.ContentLength64 -le 0 -or $Context.Request.ContentLength64 -gt 16384) {
      Send-Json $Context 400 @{ error = "Invalid sign-in request." }
      return
    }
    try {
      $reader = [IO.StreamReader]::new($Context.Request.InputStream, $Context.Request.ContentEncoding)
      try { $body = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    } catch {
      Send-Json $Context 400 @{ error = "Invalid sign-in request." }
      return
    }
    $credential = [string]$body.credential
    if (-not $credential -or $credential.Length -gt 12000) {
      Send-Json $Context 400 @{ error = "Google did not provide a valid sign-in credential." }
      return
    }
    try {
      $tokenInfoUrl = "https://oauth2.googleapis.com/tokeninfo?id_token=$([Uri]::EscapeDataString($credential))"
      $claims = Invoke-RestMethod -Method Get -Uri $tokenInfoUrl -TimeoutSec 10
    } catch {
      Send-Json $Context 401 @{ error = "Google sign-in token is invalid or could not be verified." }
      return
    }
    $email = [string]$claims.email
    $emailVerified = ([string]$claims.email_verified -eq "true")
    $expires = 0L
    try { $expires = [long]$claims.exp } catch { $expires = 0L }
    if (
      $claims.aud -ne $GoogleClientId -or
      $claims.iss -notin @("accounts.google.com", "https://accounts.google.com") -or
      -not $claims.sub -or
      -not $emailVerified -or
      $expires -le [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -or
      -not $email
    ) {
      Send-Json $Context 401 @{ error = "Google sign-in could not be verified for this website." }
      return
    }
    $email = $email.ToLowerInvariant()
    $name = if ($claims.name) { [string]$claims.name } elseif ($claims.given_name) { [string]$claims.given_name } else { $email.Split("@")[0] }
    $sessionToken = New-SessionToken $email $name
    $cookie = "$SessionCookie=$sessionToken; Path=/; HttpOnly; SameSite=Lax; Max-Age=$SessionMaxAge$(Get-SecureCookieSuffix)"
    Send-Json $Context 200 @{
      authenticated = $true
      name = $name
      email = $email
      isAdmin = ($email -eq $AdminEmail)
    } $cookie
    return
  }
  if ($method -in @("GET", "HEAD")) {
    Write-StaticFile $Context
    return
  }
  Send-Json $Context 404 @{ error = "Not found." }
}

$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("$AllowedOrigin/")
try {
  $listener.Start()
  Write-Host "AGAM site running at $AllowedOrigin"
  Write-Host "Press Ctrl+C to stop."
  while ($listener.IsListening) {
    try {
      $context = $listener.GetContext()
      Write-Host "$($context.Request.HttpMethod) $($context.Request.Url.AbsolutePath)"
      try {
        Handle-Request $context
      } catch {
        Write-Host "Request failed; details omitted."
        if ($context.Response.OutputStream.CanWrite) {
          Send-Json $context 500 @{ error = "The request could not be completed." }
        }
      }
    } catch [Net.HttpListenerException] {
      break
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
