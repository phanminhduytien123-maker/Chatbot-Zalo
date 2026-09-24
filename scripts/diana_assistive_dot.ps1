<#
.SYNOPSIS
    Diana AI - Native Windows AssistiveTouch Floating Dot
    Chấm tròn AssistiveTouch nổi trên màn hình Windows (Always on Top)
#>

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms, System.Speech

[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$serverUrl = "https://diana-h73u.onrender.com"

# 1. Khởi tạo Speech Synthesizer tiếng Việt / tiếng Anh
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$viVoice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "*vi*" -or $_.VoiceInfo.Name -like "*Vietnamese*" } | Select-Object -First 1
if ($viVoice) {
    $synth.SelectVoice($viVoice.VoiceInfo.Name)
}

# 2. Tạo giao diện XAML cho Chấm Nổi AssistiveTouch
[xml]$xaml = @"
<Window
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    Title="Diana AssistiveTouch"
    Width="72" Height="72"
    WindowStyle="None"
    AllowsTransparency="True"
    Background="Transparent"
    Topmost="True"
    ShowInTaskbar="False"
    ResizeMode="NoResize">

    <Window.Resources>
        <Storyboard x:Key="PulseAnim" RepeatBehavior="Forever" AutoReverse="True">
            <DoubleAnimation Storyboard.TargetName="DotScale" Storyboard.TargetProperty="ScaleX" From="1.0" To="1.15" Duration="0:0:0.8"/>
            <DoubleAnimation Storyboard.TargetName="DotScale" Storyboard.TargetProperty="ScaleY" From="1.0" To="1.15" Duration="0:0:0.8"/>
        </Storyboard>
    </Window.Resources>

    <Grid Cursor="Hand">
        <!-- Vòng hào quang bên ngoài -->
        <Border Name="AuraRing" Width="70" Height="70" CornerRadius="35" Opacity="0.4">
            <Border.Background>
                <RadialGradientBrush>
                    <GradientStop Color="#FF00F2FE" Offset="0.2"/>
                    <GradientStop Color="#00000000" Offset="1"/>
                </RadialGradientBrush>
            </Border.Background>
        </Border>

        <!-- Thân chấm tròn kính mờ (Glassmorphism) -->
        <Border Name="DotBody" Width="58" Height="58" CornerRadius="29" 
                Background="#D00B101E" BorderBrush="#8000F2FE" BorderThickness="2"
                RenderTransformOrigin="0.5,0.5">
            <Border.RenderTransform>
                <ScaleTransform x:Name="DotScale" ScaleX="1.0" ScaleY="1.0"/>
            </Border.RenderTransform>
            <Border.Effect>
                <DropShadowEffect BlurRadius="18" ShadowDepth="4" Direction="270" Color="#00F2FE" Opacity="0.5"/>
            </Border.Effect>

            <Grid HorizontalAlignment="Center" VerticalAlignment="Center">
                <TextBlock Name="DotEmoji" Text="🌸" FontSize="22" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                <TextBlock Name="DotStatus" Text="🎙️" FontSize="20" HorizontalAlignment="Center" VerticalAlignment="Center" Visibility="Collapsed"/>
            </Grid>
        </Border>
    </Grid>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [System.Windows.Markup.XamlReader]::Load($reader)

# 3. Định vị chấm nổi ở cạnh phải màn hình desktop
$screenWidth = [System.Windows.SystemParameters]::PrimaryScreenWidth
$screenHeight = [System.Windows.SystemParameters]::PrimaryScreenHeight
$window.Left = $screenWidth - 90
$window.Top = ($screenHeight / 2) - 36

$dotBody = $window.FindName("DotBody")
$dotEmoji = $window.FindName("DotEmoji")
$dotStatus = $window.FindName("DotStatus")
$auraRing = $window.FindName("AuraRing")
$pulseAnim = $window.Resources["PulseAnim"]

$script:isDragging = $false
$script:dragStart = [System.Windows.Point]::new(0, 0)
$script:isListening = $false

# 4. Sự kiện Kéo thả chấm nổi quanh màn hình
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
        # Click / Tap -> Bật Web Voice App hoặc nhận diện giọng nói
        OnDotClick
    } else {
        # Snap bám vào mép viền trái/phải màn hình desktop
        $midX = [System.Windows.SystemParameters]::PrimaryScreenWidth / 2
        if ($window.Left -lt $midX) {
            $window.Left = 16
        } else {
            $window.Left = [System.Windows.SystemParameters]::PrimaryScreenWidth - 88
        }
    }
})

function OnDotClick {
    if ($script:isListening) { return }
    $script:isListening = $true

    # Hiệu ứng đang nghe
    $dotBody.BorderBrush = [System.Windows.Media.Brushes]::HotPink
    $dotEmoji.Visibility = [System.Windows.Visibility]::Collapsed
    $dotStatus.Visibility = [System.Windows.Visibility]::Visible
    $pulseAnim.Begin($dotBody, $true)

    # Mở Web App Diana (hoặc kết nối trực tiếp)
    Start-Process "$serverUrl"

    Start-Sleep -Milliseconds 2500
    
    # Trả về trạng thái chờ
    $dotBody.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#8000F2FE")
    $dotEmoji.Visibility = [System.Windows.Visibility]::Visible
    $dotStatus.Visibility = [System.Windows.Visibility]::Collapsed
    $pulseAnim.Stop($dotBody)
    $script:isListening = $false
}

# Menu chuột phải: Thoát chấm nổi
$contextMenu = New-Object System.Windows.Controls.ContextMenu
$menuOpenWeb = New-Object System.Windows.Controls.MenuItem
$menuOpenWeb.Header = "🌸 Mở Trợ lý Diana Web App"
$menuOpenWeb.Add_Click({ Start-Process "$serverUrl" })

$menuExit = New-Object System.Windows.Controls.MenuItem
$menuExit.Header = "❌ Đóng Chấm Nổi Diana"
$menuExit.Add_Click({ $window.Close(); [System.Windows.Forms.Application]::Exit() })

$contextMenu.Items.Add($menuOpenWeb) | Out-Null
$contextMenu.Items.Add($menuExit) | Out-Null
$window.ContextMenu = $contextMenu

# 5. Khởi chạy hiển thị cửa sổ chấm nổi
$app = New-Object System.Windows.Application
$app.Run($window) | Out-Null
