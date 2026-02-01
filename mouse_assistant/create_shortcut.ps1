$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$Desktop\Dyktowanie.lnk")
$Shortcut.TargetPath = "C:\Users\bogum\mouse_assistant\start_dictation.bat"
$Shortcut.WorkingDirectory = "C:\Users\bogum\mouse_assistant"
$Shortcut.Save()
Write-Host "Skrot 'Dyktowanie' utworzony na pulpicie!"
