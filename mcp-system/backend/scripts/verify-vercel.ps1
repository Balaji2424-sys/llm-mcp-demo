param(
  [string]$BaseUrl = "https://llm-mcp-demo.vercel.app",
  [int]$TimeoutSec = 45
)

function Invoke-JsonPost {
  param(
    [string]$Url,
    [string]$Body
  )

  Invoke-WebRequest -Uri $Url -Method POST -ContentType "application/json" -Body $Body -TimeoutSec $TimeoutSec
}

Write-Host "== Smoke: GET / =="
try {
  $root = Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -TimeoutSec $TimeoutSec
  Write-Host "GET / status:" $root.StatusCode
  Write-Host $root.Content
} catch {
  Write-Host "GET / failed:" $_.Exception.Message
}

Write-Host ""
Write-Host "== Smoke: POST /query invalid payload (expect 400) =="
try {
  $invalid = Invoke-JsonPost -Url "$BaseUrl/query" -Body "{}"
  Write-Host "Unexpected success status:" $invalid.StatusCode
  Write-Host $invalid.Content
} catch {
  if ($_.Exception.Response) {
    Write-Host "POST /query invalid status:" $_.Exception.Response.StatusCode.value__
  } else {
    Write-Host "POST /query invalid failed:" $_.Exception.Message
  }
}

Write-Host ""
Write-Host "== Health: GET /health =="
try {
  $health = Invoke-WebRequest -Uri "$BaseUrl/health" -Method GET -TimeoutSec $TimeoutSec
  Write-Host "GET /health status:" $health.StatusCode
  Write-Host $health.Content
} catch {
  Write-Host "GET /health failed:" $_.Exception.Message
}

Write-Host ""
Write-Host "== Functional: GitHub query =="
try {
  $githubBody = '{"query":"create github repo vercel-health-check-test"}'
  $githubResult = Invoke-JsonPost -Url "$BaseUrl/query" -Body $githubBody
  Write-Host "GitHub query status:" $githubResult.StatusCode
  Write-Host $githubResult.Content
} catch {
  Write-Host "GitHub query failed:" $_.Exception.Message
}

Write-Host ""
Write-Host "== Functional: Drive query =="
try {
  $driveBody = '{"query":"create drive folder STUDENTS/A,B"}'
  $driveResult = Invoke-JsonPost -Url "$BaseUrl/query" -Body $driveBody
  Write-Host "Drive query status:" $driveResult.StatusCode
  Write-Host $driveResult.Content
} catch {
  Write-Host "Drive query failed:" $_.Exception.Message
}

Write-Host ""
Write-Host "== Functional: Both query =="
try {
  $bothBody = '{"query":"create github repo vercel-health-check-test and create drive folder STUDENTS/A,B"}'
  $bothResult = Invoke-JsonPost -Url "$BaseUrl/query" -Body $bothBody
  Write-Host "Both query status:" $bothResult.StatusCode
  Write-Host $bothResult.Content
} catch {
  Write-Host "Both query failed:" $_.Exception.Message
}
