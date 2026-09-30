Set WshShell = CreateObject("WScript.Shell")
currentDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' 1. Ket noi ADB trong che do an 100% (Khong hien Terminal)
WshShell.Run "cmd /c cd /d """ & currentDir & "\tools\scrcpy"" && adb.exe connect 192.168.100.148:5555 && adb.exe connect 192.168.100.225:5555", 0, True

' 2. Bat Scrcpy chieu man hinh 60 FPS (Hoan toan khong co cua so Terminal den)
scrcpyCmd = """" & currentDir & "\tools\scrcpy\scrcpy.exe"" -s 192.168.100.148:5555 --no-audio --video-codec=h264 --window-title ""Diana - Redmi K70"" --max-size 1440 --video-bit-rate 8M --max-fps 60 --stay-awake --always-on-top"
WshShell.Run scrcpyCmd, 0, False
