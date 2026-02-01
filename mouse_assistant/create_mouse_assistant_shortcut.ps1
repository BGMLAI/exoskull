$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$Desktop\Mouse Assistant.lnk")
$Shortcut.TargetPath = "C:\Users\bogum\mouse_assistant\start_mouse_assistant.bat"
$Shortcut.WorkingDirectory = "C:\Users\bogum\mouse_assistant"
$Shortcut.Description = "Mouse Assistant - Aplikacja do zarządzania komputerem myszką z funkcjami Speechify"
$Shortcut.IconLocation = "C:\Windows\System32\shell32.dll,13"
$Shortcut.Save()
Write-Host "Skrot 'Mouse Assistant' utworzony na pulpicie!" -ForegroundColor Green
Write-Host "Lokalizacja: $Desktop\Mouse Assistant.lnk" -ForegroundColor Cyan
