' ==============================================================
' DIANA AI - CHAY CHAM NOI ASSISTIVETOUCH HOAN TOAN KHONG HIEN CUA SO DEN
' ==============================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.Run "wscript.exe """ & strDir & "\scripts\diana_dot_launcher.vbs""", 0, False
