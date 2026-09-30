Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)
strCommand = """" & strDir & "\scrcpy.exe"""

For Each Arg In WScript.Arguments
    strCommand = strCommand & " """ & replace(Arg, """", """""""""") & """"
Next

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strDir
WshShell.Run strCommand, 1, false
