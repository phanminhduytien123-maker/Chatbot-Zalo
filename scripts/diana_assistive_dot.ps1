# ==============================================================================
# DIANA AI - 100% NATIVE WINDOWS ASSISTIVETOUCH FLOATING BUBBLE (ALWAYS ON TOP)
# ==============================================================================

[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms

$serverUrl = "https://diana-h73u.onrender.com"

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

# Windows Media Player COM Object cho Giọng đọc Nữ Diana Tiếng Việt Tự Nhiên
$script:wmp = $null
try {
    $script:wmp = New-Object -ComObject "WMPlayer.OCX"
} catch {}

# Giao diện XAML WPF thuần Chấm Tròn 100% trong suốt + Bong bóng đối thoại
[xml]$xaml = @"
<Window
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    Title="Diana Floating Bubble"
    Width="300" Height="80"
    WindowStyle="None"
    AllowsTransparency="True"
    Background="Transparent"
    Topmost="True"
    ShowInTaskbar="False"
    ResizeMode="NoResize">

    <Window.Resources>
        <Storyboard x:Key="PulseAnim" RepeatBehavior="Forever" AutoReverse="True">
            <DoubleAnimation Storyboard.TargetName="DotScale" Storyboard.TargetProperty="ScaleX" From="1.0" To="1.16" Duration="0:0:0.5"/>
            <DoubleAnimation Storyboard.TargetName="DotScale" Storyboard.TargetProperty="ScaleY" From="1.0" To="1.16" Duration="0:0:0.5"/>
        </Storyboard>
        <Storyboard x:Key="RotateAura" RepeatBehavior="Forever">
            <DoubleAnimation Storyboard.TargetName="AuraRotate" Storyboard.TargetProperty="Angle" From="0" To="360" Duration="0:0:5"/>
        </Storyboard>
    </Window.Resources>

    <Canvas Name="MainCanvas" Width="300" Height="80" Background="Transparent">
        <!-- Bong bóng lời thoại phụ đề bên cạnh chấm tròn -->
        <Border Name="SpeechBubble" Canvas.Left="0" Canvas.Top="12" MaxWidth="215" 
                CornerRadius="14" Background="#E60B101E" BorderBrush="#9900F2FE" BorderThickness="1.5"
                Padding="10,6" Visibility="Collapsed">
            <Border.Effect>
                <DropShadowEffect BlurRadius="14" ShadowDepth="2" Direction="270" Color="#00F2FE" Opacity="0.45"/>
            </Border.Effect>
            <TextBlock Name="BubbleText" Text="Đang nghe..." Foreground="#F8FAFC" 
                       FontSize="11" FontFamily="Segoe UI, Be Vietnam Pro" TextWrapping="Wrap" MaxHeight="52"/>
        </Border>

        <!-- Chấm tròn chính AssistiveTouch -->
        <Grid Name="DotRoot" Canvas.Left="225" Canvas.Top="6" Width="68" Height="68" Cursor="Hand">
            <!-- Vòng hào quang phát sáng xoay tròn -->
            <Border Name="AuraRing" Width="66" Height="66" CornerRadius="33" Opacity="0.6" RenderTransformOrigin="0.5,0.5">
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
            <Border Name="DotBody" Width="56" Height="56" CornerRadius="28" 
                    Background="#F0060911" BorderBrush="#FF00F2FE" BorderThickness="2"
                    RenderTransformOrigin="0.5,0.5">
                <Border.RenderTransform>
                    <ScaleTransform x:Name="DotScale" ScaleX="1.0" ScaleY="1.0"/>
                </Border.RenderTransform>
                <Border.Effect>
                    <DropShadowEffect BlurRadius="18" ShadowDepth="0" Color="#00F2FE" Opacity="0.65"/>
                </Border.Effect>

                <Grid HorizontalAlignment="Center" VerticalAlignment="Center">
                    <TextBlock Name="DotEmoji" Text="🌸" FontSize="24" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                    <TextBlock Name="DotStatus" Text="🎙️" FontSize="22" HorizontalAlignment="Center" VerticalAlignment="Center" Visibility="Collapsed"/>
                </Grid>
            </Border>
        </Grid>
    </Canvas>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [System.Windows.Markup.XamlReader]::Load($reader)

# Vị trí khởi đầu ở mép phải màn hình máy tính
$screenWidth = [System.Windows.SystemParameters]::PrimaryScreenWidth
$screenHeight = [System.Windows.SystemParameters]::PrimaryScreenHeight
$window.Left = $screenWidth - 305
$window.Top = ($screenHeight / 2) - 40

$dotRoot = $window.FindName("DotRoot")
$dotBody = $window.FindName("DotBody")
$dotEmoji = $window.FindName("DotEmoji")
$dotStatus = $window.FindName("DotStatus")
$auraRing = $window.FindName("AuraRing")
$speechBubble = $window.FindName("SpeechBubble")
$bubbleText = $window.FindName("BubbleText")
$pulseAnim = $window.Resources["PulseAnim"]
$rotateAura = $window.Resources["RotateAura"]

$script:isDragging = $false
$script:dragStart = [System.Windows.Point]::new(0, 0)
$script:isRecording = $false
$script:tempAudioPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "diana_voice_record.wav")
$script:tempMp3Path = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "diana_voice_tts.mp3")
$script:bubbleTimer = $null

$rotateAura.Begin($auraRing, $true)

function ShowBubbleMsg($msg, $durationSec = 6) {
    $bubbleText.Text = $msg
    $speechBubble.Visibility = [System.Windows.Visibility]::Visible
    if ($script:bubbleTimer) { $script:bubbleTimer.Stop() }
    $script:bubbleTimer = New-Object System.Windows.Threading.DispatcherTimer
    $script:bubbleTimer.Interval = [TimeSpan]::FromSeconds($durationSec)
    $script:bubbleTimer.Add_Tick({
        $speechBubble.Visibility = [System.Windows.Visibility]::Collapsed
        $script:bubbleTimer.Stop()
    })
    $script:bubbleTimer.Start()
}

function PlayDianaVoice($text) {
    try {
        if (-not $text) { return }
        $cleanText = [System.Text.RegularExpressions.Regex]::Replace($text, '[*_#~\`]', '')
        $cleanText = [System.Text.RegularExpressions.Regex]::Replace($cleanText, '[\uD800-\uDBFF][\uDC00-\uDFFF]', '')
        
        $encoded = [Uri]::EscapeDataString($cleanText.Substring(0, [Math]::Min(350, $cleanText.Length)))
        $ttsUrl = "$serverUrl/api/tts?text=$encoded&voice=diana_female"

        $ttsClient = New-Object System.Net.WebClient
        $ttsClient.Add_DownloadFileCompleted({
            param($s, $e)
            if ($e.Error -eq $null -and (Test-Path $script:tempMp3Path)) {
                if ($script:wmp) {
                    $script:wmp.URL = $script:tempMp3Path
                    $script:wmp.controls.play()
                }
            }
        })
        if (Test-Path $script:tempMp3Path) { Remove-Item $script:tempMp3Path -Force -ErrorAction SilentlyContinue }
        $ttsClient.DownloadFileAsync([Uri]$ttsUrl, $script:tempMp3Path)
    } catch {}
}

# Sự kiện Kéo thả & Snap mép màn hình
$dotRoot.Add_MouseLeftButtonDown({
    $script:isDragging = $true
    $script:dragStart = [System.Windows.Forms.Cursor]::Position
    $window.DragMove()
})

$dotRoot.Add_MouseLeftButtonUp({
    $script:isDragging = $false
    $currentPos = [System.Windows.Forms.Cursor]::Position
    $dist = [Math]::Sqrt([Math]::Pow($currentPos.X - $script:dragStart.X, 2) + [Math]::Pow($currentPos.Y - $script:dragStart.Y, 2))

    if ($dist -lt 6) {
        ToggleVoice
    } else {
        $midX = [System.Windows.SystemParameters]::PrimaryScreenWidth / 2
        if ($window.Left -lt $midX) {
            $window.Left = 10
            [System.Windows.Controls.Canvas]::SetLeft($speechBubble, 75)
            [System.Windows.Controls.Canvas]::SetLeft($dotRoot, 5)
        } else {
            $window.Left = [System.Windows.SystemParameters]::PrimaryScreenWidth - 305
            [System.Windows.Controls.Canvas]::SetLeft($speechBubble, 0)
            [System.Windows.Controls.Canvas]::SetLeft($dotRoot, 225)
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

        ShowBubbleMsg "🎙️ Diana đang nghe anh nói..." 15

        try {
            [WinAudioRecorder]::mciSendString("close all", "", 0, 0) | Out-Null
            [WinAudioRecorder]::mciSendString("open new type waveaudio alias recsound", "", 0, 0) | Out-Null
            [WinAudioRecorder]::mciSendString("record recsound", "", 0, 0) | Out-Null
        } catch {}

    } else {
        # --- DỪNG THU ÂM & GỬI CHO DIANA AI ---
        $script:isRecording = $false
        $dotBody.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FF00F2FE")
        $dotEmoji.Visibility = [System.Windows.Visibility]::Visible
        $dotStatus.Visibility = [System.Windows.Visibility]::Collapsed
        $pulseAnim.Stop($dotBody)

        ShowBubbleMsg "⚡ Diana đang suy nghĩ..." 10

        try {
            [WinAudioRecorder]::mciSendString("stop recsound", "", 0, 0) | Out-Null
            if (Test-Path $script:tempAudioPath) { Remove-Item $script:tempAudioPath -Force -ErrorAction SilentlyContinue }
            [WinAudioRecorder]::mciSendString("save recsound `"$($script:tempAudioPath)`"", "", 0, 0) | Out-Null
            [WinAudioRecorder]::mciSendString("close recsound", "", 0, 0) | Out-Null
        } catch {}

        # Gửi dữ liệu âm thanh bất đồng bộ bằng WebClient
        if (Test-Path $script:tempAudioPath) {
            $bytes = [System.IO.File]::ReadAllBytes($script:tempAudioPath)
            if ($bytes.Length -gt 1500) {
                $base64 = [Convert]::ToBase64String($bytes)
                $bodyObj = @{ audio = $base64; mimeType = "audio/wav" } | ConvertTo-Json

                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add("Content-Type", "application/json; charset=utf-8")
                $wc.Encoding = [System.Text.Encoding]::UTF8

                $wc.Add_UploadStringCompleted({
                    param($s, $e)
                    try {
                        if ($e.Error -ne $null) {
                            ShowBubbleMsg "⚠️ Không thể kết nối máy chủ Diana!" 5
                            return
                        }
                        $res = $e.Result | ConvertFrom-Json
                        if ($res -and $res.success -and $res.reply) {
                            $replyText = if ($res.reply.text) { $res.reply.text } else { $res.reply.ToString() }
                            ShowBubbleMsg "🌸 $replyText" 8
                            PlayDianaVoice $replyText
                        } elseif ($res -and $res.error) {
                            ShowBubbleMsg "💡 $($res.error)" 5
                        } else {
                            ShowBubbleMsg "🌸 Dạ em đã nhận được rồi ạ!" 4
                            PlayDianaVoice "Dạ em đã nhận được yêu cầu rồi ạ!"
                        }
                    } catch {
                        ShowBubbleMsg "🌸 Dạ em đã hoàn tất rồi ạ!" 4
                    }
                })

                $wc.UploadStringAsync([Uri]"$serverUrl/api/voice-audio", "POST", $bodyObj)
                return
            }
        }

        ShowBubbleMsg "💡 Chưa ghi nhận giọng nói, anh thử lại nhé!" 4
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
$dotRoot.ContextMenu = $contextMenu

# Khởi chạy App WPF
$app = New-Object System.Windows.Application
$app.Run($window) | Out-Null
