param([string]$ShortcutDirectory = [Environment]::GetFolderPath('Desktop'))

$projectDirectory = Split-Path -Parent $PSScriptRoot
$appExecutable = Join-Path $projectDirectory 'dist\ColdReach-win32-x64\ColdReach.exe'
if (-not (Test-Path -LiteralPath $appExecutable)) { throw 'Build the desktop app first with npm run desktop:build.' }
$shortcutPath = Join-Path $ShortcutDirectory 'ColdReach.lnk'
$shortcutShell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $shortcutPath) {
  $existingShortcut = $shortcutShell.CreateShortcut($shortcutPath)
  if ($existingShortcut.TargetPath -ne $appExecutable) { throw 'A different ColdReach shortcut already exists. Choose another shortcut directory.' }
}
$shortcut = $shortcutShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $appExecutable
$shortcut.WorkingDirectory = Split-Path -Parent $appExecutable
$shortcut.IconLocation = "$appExecutable,0"
$shortcut.Description = 'Open ColdReach. Closing its window stops the local server.'
$shortcut.Save()
Write-Output "Created shortcut: $shortcutPath"
