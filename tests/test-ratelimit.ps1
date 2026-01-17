# Save as test-ratelimit.ps1 and run: .\test-ratelimit.ps1
for ($i = 1; $i -le 35; $i++) {
  Write-Host "Test $i /35" -NoNewline
  try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/analyze" `
      -Method POST `
      -Content
