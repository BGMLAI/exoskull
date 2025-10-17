param([string]$Message)

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$path = "C:\Users\bogum\.claude\decisions\$timestamp.md"
$Message | Out-File -FilePath $path -Encoding utf8

# Git commit (opcjonalnie)
Set-Location "C:\Users\bogum"
git add -A
git commit -m "[ClaudeDecision@$timestamp] $Message"
git push