Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Tat cac phien cu truoc khi mo moi
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ""Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*diana_assistive_dot.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }""", 0, True

' Khoi chay Cham Tron AssistiveTouch 100% an khong mo cua so đen
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -NoProfile -Sta -WindowStyle Hidden -File """ & strDir & "\diana_assistive_dot.ps1""", 0, False
