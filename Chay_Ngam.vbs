' ==============================================================
' DIANA PC AGENT - CHAY NGAM HOAN TOAN KHONG HIEN THI CUA SO
' ==============================================================
Set fso = CreateObject("Scripting.FileSystemObject")
strCurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strCurrentDir

' Chay node pcAgent.js an 100% khong bat terminal
WshShell.Run "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & strCurrentDir & "\scripts\pc_agent_manager.ps1"" start", 0, False
