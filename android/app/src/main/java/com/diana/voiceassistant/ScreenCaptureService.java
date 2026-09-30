package com.diana.voiceassistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Point;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ScreenCaptureService: Dịch vụ quay & truyền trực tiếp màn hình điện thoại (Native Screen Cast)
 * - 100% không cần Developer Options / Wireless Debugging
 * - Tương thích hoàn toàn Android 10 đến Android 15 (HyperOS / MIUI)
 * - Cung cấp luồng phát video MJPEG độ trễ siêu thấp qua HTTP Server tích hợp (Port 8088)
 */
public class ScreenCaptureService extends Service {

    public static final String ACTION_START = "ACTION_START";
    public static final String ACTION_STOP = "ACTION_STOP";
    public static final String EXTRA_RESULT_CODE = "EXTRA_RESULT_CODE";
    public static final String EXTRA_DATA = "EXTRA_DATA";

    public static final int SERVER_PORT = 8088;
    private static final String CHANNEL_ID = "diana_screen_stream_channel";
    private static final int NOTIFICATION_ID = 9527;

    private static boolean isStreamingActive = false;
    private static String currentStreamUrl = "";

    private MediaProjectionManager mediaProjectionManager;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private ServerSocket serverSocket;
    private ExecutorService serverExecutor;
    private android.os.HandlerThread captureThread;
    private Handler captureHandler;

    private final Set<OutputStream> connectedClients = Collections.synchronizedSet(new HashSet<>());
    private byte[] latestJpegFrame = null;
    private long lastFrameTime = 0;
    private int frameCount = 0;
    private int currentFps = 0;
    private long lastFpsMeasureTime = 0;

    public static boolean isStreaming() {
        return isStreamingActive;
    }

    public static String getStreamUrl() {
        return currentStreamUrl;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        mediaProjectionManager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        serverExecutor = Executors.newCachedThreadPool();
        
        captureThread = new android.os.HandlerThread("DianaScreenCaptureThread", android.os.Process.THREAD_PRIORITY_DISPLAY);
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());
        
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopScreenStream();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(action)) {
            int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
            Intent data = intent.getParcelableExtra(EXTRA_DATA);

            if (resultCode != 0 && data != null) {
                startForegroundWithNotification();
                startScreenCapture(resultCode, data);
                startHttpMjpegServer();
            } else {
                stopSelf();
            }
        }

        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Diana Phone Screen Stream",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Dịch vụ truyền trực tiếp màn hình điện thoại lên máy tính");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundWithNotification() {
        Intent stopIntent = new Intent(this, ScreenCaptureService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            0,
            stopIntent,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("📱 Diana đang phát trực tiếp màn hình")
            .setContentText("Màn hình đang truyền 60 FPS lên máy tính (Cổng " + SERVER_PORT + ")")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_delete, "Dừng phát", stopPendingIntent)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startScreenCapture(int resultCode, Intent data) {
        try {
            mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, data);
            if (mediaProjection == null) {
                Log.e("DianaScreenStream", "MediaProjection is null");
                stopSelf();
                return;
            }

            mediaProjection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    super.onStop();
                    stopScreenStream();
                }
            }, captureHandler);

            WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            DisplayMetrics metrics = new DisplayMetrics();
            wm.getDefaultDisplay().getRealMetrics(metrics);

            int screenWidth = metrics.widthPixels;
            int screenHeight = metrics.heightPixels;
            int density = metrics.densityDpi;

            // Thu phóng kích thước tối ưu cho độ nét HD (720p) để đạt 60 FPS mượt mà
            int targetWidth = 720;
            int calculatedHeight = (int) ((float) screenHeight * targetWidth / screenWidth);
            if (calculatedHeight % 2 != 0) calculatedHeight++;

            final int finalWidth = targetWidth;
            final int finalHeight = calculatedHeight;

            imageReader = ImageReader.newInstance(finalWidth, finalHeight, PixelFormat.RGBA_8888, 2);

            virtualDisplay = mediaProjection.createVirtualDisplay(
                "DianaScreenStreamDisplay",
                finalWidth,
                finalHeight,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                captureHandler
            );

            lastFpsMeasureTime = System.currentTimeMillis();

            imageReader.setOnImageAvailableListener(reader -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image != null) {
                        long now = System.currentTimeMillis();
                        // Giới hạn tốc độ khung hình ~ 60 FPS (cách nhau >= 16ms)
                        if (now - lastFrameTime >= 16) {
                            lastFrameTime = now;
                            frameCount++;
                            if (now - lastFpsMeasureTime >= 1000) {
                                currentFps = frameCount;
                                frameCount = 0;
                                lastFpsMeasureTime = now;
                            }
                            byte[] jpeg = convertImageToJpeg(image, finalWidth, finalHeight);
                            if (jpeg != null) {
                                latestJpegFrame = jpeg;
                                broadcastFrameToClients(jpeg);
                            }
                        }
                    }
                } catch (Exception e) {
                    Log.w("DianaScreenStream", "Lỗi xử lý frame: " + e.getMessage());
                } finally {
                    if (image != null) {
                        image.close();
                    }
                }
            }, captureHandler);

            isStreamingActive = true;
            String localIp = getDeviceIpAddress();
            currentStreamUrl = "http://" + localIp + ":" + SERVER_PORT + "/stream.mjpg";
            Log.d("DianaScreenStream", "✅ Stream màn hình đã bắt đầu tại: " + currentStreamUrl);

        } catch (Exception e) {
            Log.e("DianaScreenStream", "Lỗi khởi động ScreenCapture: ", e);
            stopSelf();
        }
    }

    private Bitmap rawBitmap = null;
    private Bitmap croppedBitmap = null;
    private android.graphics.Canvas cropCanvas = null;
    private final ByteArrayOutputStream reusableBaos = new ByteArrayOutputStream(128 * 1024);
    private final Object frameLock = new Object();

    private byte[] convertImageToJpeg(Image image, int width, int height) {
        synchronized (frameLock) {
            try {
                Image.Plane[] planes = image.getPlanes();
                if (planes == null || planes.length == 0) return null;
                ByteBuffer buffer = planes[0].getBuffer();
                int pixelStride = planes[0].getPixelStride();
                int rowStride = planes[0].getRowStride();
                int rowPadding = rowStride - pixelStride * width;
                int fullWidth = width + rowPadding / pixelStride;

                if (rawBitmap == null || rawBitmap.getWidth() != fullWidth || rawBitmap.getHeight() != height) {
                    if (rawBitmap != null) {
                        try { rawBitmap.recycle(); } catch (Exception ignored) {}
                    }
                    rawBitmap = Bitmap.createBitmap(fullWidth, height, Bitmap.Config.ARGB_8888);
                }

                buffer.rewind();
                rawBitmap.copyPixelsFromBuffer(buffer);

                Bitmap finalBitmap = rawBitmap;
                if (rowPadding != 0) {
                    if (croppedBitmap == null || croppedBitmap.getWidth() != width || croppedBitmap.getHeight() != height) {
                        if (croppedBitmap != null) {
                            try { croppedBitmap.recycle(); } catch (Exception ignored) {}
                        }
                        croppedBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                        cropCanvas = new android.graphics.Canvas(croppedBitmap);
                    }
                    cropCanvas.drawBitmap(rawBitmap, 0, 0, null);
                    finalBitmap = croppedBitmap;
                }

                reusableBaos.reset();
                // Nén JPEG 65% để tối ưu tốc độ 60 FPS, độ trễ ~0ms, băng thông nhẹ
                finalBitmap.compress(Bitmap.CompressFormat.JPEG, 65, reusableBaos);
                return reusableBaos.toByteArray();
            } catch (Throwable t) {
                Log.w("DianaScreenStream", "Lỗi encode frame: " + t.getMessage());
                return null;
            }
        }
    }

    private void startHttpMjpegServer() {
        serverExecutor.execute(() -> {
            try {
                serverSocket = new ServerSocket(SERVER_PORT);
                Log.d("DianaScreenStream", "MJPEG Server đang lắng nghe tại cổng " + SERVER_PORT);

                while (isStreamingActive && serverSocket != null && !serverSocket.isClosed()) {
                    try {
                        Socket socket = serverSocket.accept();
                        serverExecutor.execute(() -> handleClientSocket(socket));
                    } catch (IOException e) {
                        if (!isStreamingActive) break;
                    }
                }
            } catch (IOException e) {
                Log.e("DianaScreenStream", "Lỗi khởi động ServerSocket: ", e);
            }
        });
    }

    private void handleClientSocket(Socket socket) {
        OutputStream out = null;
        try {
            socket.setTcpNoDelay(true);
            java.io.InputStream in = socket.getInputStream();
            byte[] buf = new byte[1024];
            int read = in.read(buf);
            String request = read > 0 ? new String(buf, 0, read) : "";

            out = socket.getOutputStream();

            // Nếu client yêu cầu frame đơn lẻ "/frame.jpg"
            if (request.contains("GET /frame.jpg") || request.contains("GET /frame")) {
                byte[] currentFrame = latestJpegFrame;
                if (currentFrame != null) {
                    String resp = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: image/jpeg\r\n" +
                        "Content-Length: " + currentFrame.length + "\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Cache-Control: no-cache, no-store, must-revalidate\r\n" +
                        "Connection: close\r\n\r\n";
                    out.write(resp.getBytes("UTF-8"));
                    out.write(currentFrame);
                    out.flush();
                } else {
                    String resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
                    out.write(resp.getBytes("UTF-8"));
                    out.flush();
                }
                return;
            }

            // Nếu client yêu cầu trang HTML "/" hoặc "/index.html" -> Trả về giao diện xem màn hình trực tiếp
            if (request.contains("GET / ") || request.contains("GET /index.html") || request.contains("GET /view")) {
                String html = "<!DOCTYPE html>\n" +
                    "<html>\n" +
                    "<head>\n" +
                    "<meta charset=\"UTF-8\">\n" +
                    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n" +
                    "<title>📱 Diana Live Screen - Redmi K70</title>\n" +
                    "<style>\n" +
                    "body { margin:0; padding:0; background:#0c0d0e; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; overflow:hidden; font-family:system-ui,sans-serif; color:#fff; }\n" +
                    ".header { position:fixed; top:12px; display:flex; align-items:center; gap:8px; background:rgba(17,18,21,0.9); padding:6px 16px; border-radius:20px; border:1px solid rgba(0,242,254,0.3); backdrop-filter:blur(10px); z-index:10; font-size:0.82rem; font-weight:600; box-shadow:0 4px 20px rgba(0,0,0,0.5); }\n" +
                    ".live-dot { width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981; animation:p 1s infinite alternate; }\n" +
                    "@keyframes p { from { opacity:0.4; } to { opacity:1; } }\n" +
                    ".screen-container { width:100%; height:100vh; display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box; }\n" +
                    "canvas { max-width:100%; max-height:94vh; border-radius:12px; object-fit:contain; box-shadow:0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0,242,254,0.15); border:1px solid rgba(255,255,255,0.08); background:#000; }\n" +
                    "</style>\n" +
                    "</head>\n" +
                    "<body>\n" +
                    "<div class=\"header\"><span class=\"live-dot\"></span> 📱 Redmi K70 Live (60 FPS Ultra-Fast)</div>\n" +
                    "<div class=\"screen-container\"><canvas id=\"screenCanvas\"></canvas></div>\n" +
                    "<script>\n" +
                    "const canvas = document.getElementById('screenCanvas');\n" +
                    "const ctx = canvas.getContext('2d');\n" +
                    "let img = new Image();\n" +
                    "let isFetching = false;\n" +
                    "function loadNextFrame() {\n" +
                    "  if (isFetching) return;\n" +
                    "  isFetching = true;\n" +
                    "  const nextImg = new Image();\n" +
                    "  nextImg.onload = () => {\n" +
                    "    if (canvas.width !== nextImg.width) {\n" +
                    "      canvas.width = nextImg.width;\n" +
                    "      canvas.height = nextImg.height;\n" +
                    "    }\n" +
                    "    ctx.drawImage(nextImg, 0, 0);\n" +
                    "    isFetching = false;\n" +
                    "    requestAnimationFrame(loadNextFrame);\n" +
                    "  };\n" +
                    "  nextImg.onerror = () => {\n" +
                    "    isFetching = false;\n" +
                    "    setTimeout(loadNextFrame, 100);\n" +
                    "  };\n" +
                    "  nextImg.src = '/frame.jpg?t=' + Date.now();\n" +
                    "}\n" +
                    "loadNextFrame();\n" +
                    "</script>\n" +
                    "</body>\n" +
                    "</html>";
                byte[] htmlBytes = html.getBytes("UTF-8");
                String resp = "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: text/html; charset=UTF-8\r\n" +
                    "Content-Length: " + htmlBytes.length + "\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Connection: close\r\n\r\n";
                out.write(resp.getBytes("UTF-8"));
                out.write(htmlBytes);
                out.flush();
                return;
            }

            // Nếu client kiểm tra trạng thái hoặc ping
            if (request.contains("GET /status") || request.contains("GET /ping")) {
                String json = "{\"status\":\"active\",\"fps\":" + currentFps + ",\"port\":" + SERVER_PORT + ",\"streaming\":true,\"device\":\"Redmi K70\"}";
                byte[] jsonBytes = json.getBytes("UTF-8");
                String resp = "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: application/json; charset=UTF-8\r\n" +
                    "Content-Length: " + jsonBytes.length + "\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Connection: close\r\n\r\n";
                out.write(resp.getBytes("UTF-8"));
                out.write(jsonBytes);
                out.flush();
                return;
            }

            // Mặc định phục vụ luồng video MJPEG
            String header = "HTTP/1.1 200 OK\r\n" +
                "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n" +
                "Cache-Control: no-cache, no-store, must-revalidate\r\n" +
                "Pragma: no-cache\r\n" +
                "Expires: 0\r\n" +
                "Access-Control-Allow-Origin: *\r\n\r\n";

            out.write(header.getBytes("UTF-8"));
            out.flush();

            connectedClients.add(out);

            // Gửi frame đầu tiên nếu có
            if (latestJpegFrame != null) {
                synchronized (out) {
                    sendFrame(out, latestJpegFrame);
                }
            }

            // Giữ kết nối mở
            while (isStreamingActive && !socket.isClosed()) {
                Thread.sleep(500);
            }
        } catch (Exception ignored) {
        } finally {
            if (out != null) {
                connectedClients.remove(out);
                try { out.close(); } catch (Exception ignored) {}
            }
            try { socket.close(); } catch (Exception ignored) {}
        }
    }


    private void broadcastFrameToClients(byte[] frame) {
        if (connectedClients.isEmpty() || frame == null) return;

        Set<OutputStream> toRemove = new HashSet<>();
        synchronized (connectedClients) {
            for (OutputStream out : connectedClients) {
                try {
                    synchronized (out) {
                        sendFrame(out, frame);
                    }
                } catch (Exception e) {
                    toRemove.add(out);
                }
            }
            connectedClients.removeAll(toRemove);
        }
    }

    private void sendFrame(OutputStream out, byte[] frame) throws IOException {
        String frameHeader = "--frame\r\n" +
            "Content-Type: image/jpeg\r\n" +
            "Content-Length: " + frame.length + "\r\n\r\n";
        out.write(frameHeader.getBytes("UTF-8"));
        out.write(frame);
        out.write("\r\n".getBytes("UTF-8"));
        out.flush();
    }

    private void stopScreenStream() {
        isStreamingActive = false;
        currentStreamUrl = "";

        if (virtualDisplay != null) {
            try { virtualDisplay.release(); } catch (Exception ignored) {}
            virtualDisplay = null;
        }

        if (imageReader != null) {
            try { imageReader.close(); } catch (Exception ignored) {}
            imageReader = null;
        }

        if (mediaProjection != null) {
            try { mediaProjection.stop(); } catch (Exception ignored) {}
            mediaProjection = null;
        }

        if (serverSocket != null) {
            try { serverSocket.close(); } catch (Exception ignored) {}
            serverSocket = null;
        }

        synchronized (connectedClients) {
            for (OutputStream out : connectedClients) {
                try { out.close(); } catch (Exception ignored) {}
            }
            connectedClients.clear();
        }

        synchronized (frameLock) {
            if (rawBitmap != null) {
                try { rawBitmap.recycle(); } catch (Exception ignored) {}
                rawBitmap = null;
            }
            if (croppedBitmap != null) {
                try { croppedBitmap.recycle(); } catch (Exception ignored) {}
                croppedBitmap = null;
            }
            cropCanvas = null;
        }

        stopForeground(true);
        Log.d("DianaScreenStream", "🛑 Đã dừng ScreenCaptureService.");
    }

    private String getDeviceIpAddress() {
        try {
            java.util.Enumeration<java.net.NetworkInterface> interfaces = java.net.NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                java.net.NetworkInterface iface = interfaces.nextElement();
                if (iface.isLoopback() || !iface.isUp()) continue;
                java.util.Enumeration<java.net.InetAddress> addresses = iface.getInetAddresses();
                while (addresses != null && addresses.hasMoreElements()) {
                    java.net.InetAddress addr = addresses.nextElement();
                    if (!addr.isLoopbackAddress() && addr instanceof java.net.Inet4Address) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {}
        return "192.168.100.225";
    }

    @Override
    public void onDestroy() {
        stopScreenStream();
        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
        }
        if (serverExecutor != null) {
            serverExecutor.shutdownNow();
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
