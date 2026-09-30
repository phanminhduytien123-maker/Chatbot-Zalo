Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = currentDir & "\dist\win-unpacked\Diana Central Station.exe"

' Chay Tram Trung Tam Diana Desktop trong che do an 100% Terminal
If fso.FileExists(exePath) Then
    WshShell.Run """" & exePath & """", 1, False
Else
    WshShell.Run "cmd /c cd /d """ & currentDir & """ && npx electron desktop/main.cjs", 0, False
End If
