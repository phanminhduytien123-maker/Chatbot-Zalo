Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

pythonExe = "C:\Users\ADMIN\AppData\Local\Programs\Python\Python312\python.exe"
If Not fso.FileExists(pythonExe) Then
    pythonExe = "python.exe"
End If

scriptPath = currentDir & "\scripts\diana_wake_listener.py"

WshShell.CurrentDirectory = currentDir
WshShell.Run """" & pythonExe & """ """ & scriptPath & """", 0, False
