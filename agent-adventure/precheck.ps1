$ErrorActionPreference = 'Stop'

$agentRoot = $PSScriptRoot
$projectRoot = Split-Path $agentRoot -Parent
$requiredFiles = @(
  'README.md',
  'gm-agent.md',
  'player-agent.md',
  'protocol.md',
  'preflight.md',
  'scenarios/derelict-extant-part-1.md',
  'schemas/gm-update.schema.json',
  'schemas/player-choice.schema.json'
)

foreach ($relativePath in $requiredFiles) {
  $path = Join-Path $agentRoot $relativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing required agent-adventure file: $relativePath"
  }
}

Get-ChildItem -LiteralPath $agentRoot -Recurse -Filter '*.json' | ForEach-Object {
  Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json | Out-Null
}

Get-ChildItem -LiteralPath $agentRoot -Recurse -Filter '*.md' | ForEach-Object {
  $file = $_
  $text = Get-Content -LiteralPath $file.FullName -Raw
  $matches = [regex]::Matches($text, '(?s)```json\s*(.*?)\s*```')
  for ($index = 0; $index -lt $matches.Count; $index += 1) {
    try {
      $matches[$index].Groups[1].Value | ConvertFrom-Json | Out-Null
    } catch {
      throw "Invalid JSON example in $($file.FullName), block $($index + 1): $($_.Exception.Message)"
    }
  }
}

$allInstructions = Get-Content -Raw @(
  (Join-Path $agentRoot 'gm-agent.md'),
  (Join-Path $agentRoot 'player-agent.md'),
  (Join-Path $agentRoot 'protocol.md')
)
$staleTerms = @('removeActionIds', 'upsert-action', 'consume-finite-item')
foreach ($term in $staleTerms) {
  if ($allInstructions -match [regex]::Escape($term)) {
    throw "Stale protocol term remains: $term"
  }
}

Push-Location $projectRoot
try {
  & npm exec tsc -- --noEmit
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript precheck failed.' }

  & npm test
  if ($LASTEXITCODE -ne 0) { throw 'Test precheck failed.' }
} finally {
  Pop-Location
}

Write-Host 'Agent adventure precheck passed. Ready for an instant-virtual-time run.'
