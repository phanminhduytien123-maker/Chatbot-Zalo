# ==============================================================================
# DIANA AI - 100% NATIVE WINDOWS ASSISTIVETOUCH FLOATING BUBBLE (ALWAYS ON TOP)
# ==============================================================================

[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms, System.Speech

$serverUrl = "https://diana-h73u.onrender.com"

# Speech Synthesizer Tiếng Việt / Tiếng Anh
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$viVoice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "*vi*" -or $_.VoiceInfo.Name -like "*Vietnamese*" } | Select-Object -First 1
if ($viVoice) {
    $synth.SelectVoice($viVoice.VoiceInfo.Name)
}

# WinMM Audio Recorder API
try {
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class WinAudioRecorder {
        [DllImport("winmm.dll", EntryPoint = "mciSendStringA", CharSet = CharSet.Ansi)]
        public static extern int mciSendString(string command, string returnString, int returnLength, int callback);
    }
"@ -ErrorAction SilentlyContinue
} catch {}

# Giao diện XAML WPF thuần Chấm Tròn 100% trong suốt
[xml]$xaml = @"
<Window
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    Title="Diana Floating Bubble"
    Width="76" Height="76"
    WindowStyle="None"
    AllowsTransparency="True"
    Background="Transparent"
    Topmost="True"
    ShowInTaskbar="False"
    ResizeMode="NoResize">

    <Window.Resources>
        <Storyboard x:Key="PulseAnim" RepeatBehavior="Forever" AutoReverse="True">
            <DoubleAnimation Storyboard.TargetName="DotScale" Storyboard.TargetProperty="ScaleX" From="1.0" To="1.15" Duration="0:0:0.5"/>
            <DoubleAnimation Storyboard.TargetName="DotScale" Storyboard.TargetProperty="ScaleY" From="1.0" To="1.15" Duration="0:0:0.5"/>
        </Storyboard>
        <Storyboard x:Key="RotateAura" RepeatBehavior="Forever">
            <DoubleAnimation Storyboard.TargetName="AuraRotate" Storyboard.TargetProperty="Angle" From="0" To="360" Duration="0:0:5"/>
        </Storyboard>
    </Window.Resources>

    <Grid Name="DotRoot" Width="76" Height="76" Cursor="Hand">
        <!-- Vòng hào quang phát sáng xoay tròn -->
        <Border Name="AuraRing" Width="72" Height="72" CornerRadius="36" Opacity="0.6" RenderTransformOrigin="0.5,0.5">
            <Border.RenderTransform>
                <RotateTransform x:Name="AuraRotate" Angle="0"/>
            </Border.RenderTransform>
            <Border.Background>
                <RadialGradientBrush>
                    <GradientStop Color="#FF00F2FE" Offset="0.1"/>
                    <GradientStop Color="#809333EA" Offset="0.6"/>
                    <GradientStop Color="#00000000" Offset="1"/>
                </RadialGradientBrush>
            </Border.Background>
        </Border>

        <!-- Thân chấm tròn kính mờ AssistiveTouch -->
        <Border Name="DotBody" Width="60" Height="60" CornerRadius="30" 
                Background="#EE060911" BorderBrush="#FF00F2FE" BorderThickness="2.5"
                RenderTransformOrigin="0.5,0.5">
            <Border.RenderTransform>
                <ScaleTransform x:Name="DotScale" ScaleX="1.0" ScaleY="1.0"/>
            </Border.RenderTransform>
            <Border.Effect>
                <DropShadowEffect BlurRadius="20" ShadowDepth="0" Color="#00F2FE" Opacity="0.7"/>
            </Border.Effect>

            <Grid HorizontalAlignment="Center" VerticalAlignment="Center">
                <TextBlock Name="DotEmoji" Text="🌸" FontSize="26" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                <TextBlock Name="DotStatus" Text="🎙️" FontSize="24" HorizontalAlignment="Center" VerticalAlignment="Center" Visibility="Collapsed"/>
            </Grid>
        </Border>
    </Grid>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [System.Windows.Markup.XamlReader]::Load($reader)

# Vị trí khởi đầu ở mép phải màn hình máy tính
$screenWidth = [System.Windows.SystemParameters]::PrimaryScreenWidth
$screenHeight = [System.Windows.SystemParameters]::PrimaryScreenHeight
$window.Left = $screenWidth - 90
$window.Top = ($screenHeight / 2) - 38

$dotRoot = $window.FindName("DotRoot")
$dotBody = $window.FindName("DotBody")
$dotEmoji = $window.FindName("DotEmoji")
$dotStatus = $window.FindName("DotStatus")
$auraRing = $window.FindName("AuraRing")
$pulseAnim = $window.Resources["PulseAnim"]
$rotateAura = $window.Resources["RotateAura"]

$script:isDragging = $false
$script:dragStart = [System.Windows.Point]::new(0, 0)
$script:isRecording = $false
$script:tempAudioPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "diana_voice_record.wav")

$rotateAura.Begin($auraRing, $true)

# Sự kiện Kéo thả & Snap mép màn hình
$window.Add_MouseLeftButtonDown({
    $script:isDragging = $true
    $script:dragStart = [System.Windows.Forms.Cursor]::Position
    $window.DragMove()
})

$window.Add_MouseLeftButtonUp({
    $script:isDragging = $false
    $currentPos = [System.Windows.Forms.Cursor]::Position
    $dist = [Math]::Sqrt([Math]::Pow($currentPos.X - $script:dragStart.X, 2) + [Math]::Pow($currentPos.Y - $script:dragStart.Y, 2))

    if ($dist -lt 5) {
        ToggleVoice
    } else {
        $midX = [System.Windows.SystemParameters]::PrimaryScreenWidth / 2
        if ($window.Left -lt $midX) {
            $window.Left = 12
        } else {
            $window.Left = [System.Windows.SystemParameters]::PrimaryScreenWidth - 88
        }
    }
})

function ToggleVoice {
    if (-not $script:isRecording) {
        # --- BẮT ĐẦU THU ÂM ---
        $script:isRecording = $true
        $dotBody.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFEC4899")
        $dotEmoji.Visibility = [System.Windows.Visibility]::Collapsed
        $dotStatus.Visibility = [System.Windows.Visibility]::Visible
        $pulseAnim.Begin($dotBody, $true)

        try {
            [WinAudioRecorder]::mciSendString("close all", "", 0, 0) | Out-Null
            [WinAudioRecorder]::mciSendString("open new type waveaudio alias recsound", "", 0, 0) | Out-Null
            [WinAudioRecorder]::mciSendString("set recsound bitspersample 16 channels 1 samplespersec 16000", "", 0, 0) | Out-Null
            [WinAudioRecorder]::mciSendString("record recsound", "", 0, 0) | Out-Null
        } catch {}

    } else {
        # --- DỪNG THU ÂM & GỬI CHO DIANA AI ---
        $script:isRecording = $false
        $dotBody.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FF00F2FE")
        $dotEmoji.Visibility = [System.Windows.Visibility]::Visible
        $dotStatus.Visibility = [System.Windows.Visibility]::Collapsed
        $pulseAnim.Stop($dotBody)

        try {
            [WinAudioRecorder]::mciSendString("stop recsound", "", 0, 0) | Out-Null
            if (Test-Path $script:tempAudioPath) { Remove-Item $script:tempAudioPath -Force }
            [WinAudioRecorder]::mciSendString("save recsound `"$($script:tempAudioPath)`"", "", 0, 0) | Out-Null
            [WinAudioRecorder]::mciSendString("close recsound", "", 0, 0) | Out-Null
        } catch {}

        # Gửi dữ liệu âm thanh bất đồng bộ bằng WebClient
        if (Test-Path $script:tempAudioPath) {
            $bytes = [System.IO.File]::ReadAllBytes($script:tempAudioPath)
            if ($bytes.Length -gt 1000) {
                $base64 = [Convert]::ToBase64String($bytes)
                $bodyObj = @{ audio = $base64; mimeType = "audio/wav" } | ConvertTo-Json

                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add("Content-Type", "application/json; charset=utf-8")
                $wc.Encoding = [System.Text.Encoding]::UTF8

                $wc.Add_UploadStringCompleted({
                    param($s, $e)
                    try {
                        if ($e.Error -ne $null) {
                            $synth.SpeakAsync("Không thể kết nối máy chủ Diana ạ!") | Out-Null
                            return
                        }
                        $res = $e.Result | ConvertFrom-Json
                        if ($res -and $res.reply) {
                            $replyText = if ($res.reply.text) { $res.reply.text } else { $res.reply.ToString() }
                            $cleanReply = [System.Text.RegularExpressions.Regex]::Replace($replyText, '[*_#~\`]', '')
                            $synth.SpeakAsync($cleanReply) | Out-Null
                        } else {
                            $synth.SpeakAsync("Dạ em đã thực thi xong yêu cầu của anh rồi ạ!") | Out-Null
                        }
                    } catch {
                        $synth.SpeakAsync("Dạ em đã nhận được yêu cầu rồi ạ!") | Out-Null
                    }
                })

                $wc.UploadStringAsync([Uri]"$serverUrl/api/voice-audio", "POST", $bodyObj)
                return
            }
        }

        $synth.SpeakAsync("Dạ em chưa nghe rõ, anh nói lại giúp em nhé!") | Out-Null
    }
}

# Menu chuột phải
$contextMenu = New-Object System.Windows.Controls.ContextMenu
$menuOpenWeb = New-Object System.Windows.Controls.MenuItem
$menuOpenWeb.Header = "🌸 Mở bảng điều khiển Web Diana"
$menuOpenWeb.Add_Click({ Start-Process $serverUrl })

$menuExit = New-Object System.Windows.Controls.MenuItem
$menuExit.Header = "❌ Đóng Chấm Nổi Diana"
$menuExit.Add_Click({ $window.Close(); [System.Windows.Forms.Application]::Exit() })

$contextMenu.Items.Add($menuOpenWeb) | Out-Null
$contextMenu.Items.Add($menuExit) | Out-Null
$window.ContextMenu = $contextMenu

# Khởi chạy App WPF
$app = New-Object System.Windows.Application
$app.Run($window) | Out-Null
