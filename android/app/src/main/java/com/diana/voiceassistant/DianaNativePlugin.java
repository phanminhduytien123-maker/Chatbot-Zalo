package com.diana.voiceassistant;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.provider.AlarmClock;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "DianaNative",
    permissions = {
        @Permission(strings = {Manifest.permission.CALL_PHONE}, alias = "call"),
        @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "audio"),
        @Permission(strings = {Manifest.permission.SEND_SMS}, alias = "sms")
    }
)
public class DianaNativePlugin extends Plugin {

    @PluginMethod
    public void setAlarm(PluginCall call) {
        int hour = call.getInt("hour", 7);
        int minutes = call.getInt("minutes", 0);
        String title = call.getString("title", "Báo thức Diana");
        boolean skipUi = call.getBoolean("skipUi", true);

        try {
            Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
            intent.putExtra(AlarmClock.EXTRA_HOUR, hour);
            intent.putExtra(AlarmClock.EXTRA_MINUTES, minutes);
            intent.putExtra(AlarmClock.EXTRA_MESSAGE, title);
            intent.putExtra(AlarmClock.EXTRA_SKIP_UI, skipUi);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Context context = getContext();
            if (intent.resolveActivity(context.getPackageManager()) != null) {
                context.startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("message", "Đã đặt báo thức lúc " + hour + " giờ " + (minutes < 10 ? "0" + minutes : minutes) + " phút");
                call.resolve(ret);
            } else {
                call.reject("Không tìm thấy ứng dụng Đồng hồ trên máy.");
            }
        } catch (Exception e) {
            call.reject("Lỗi đặt báo thức: " + e.getMessage());
        }
    }

    @PluginMethod
    public void makePhoneCall(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber");
        if (phoneNumber == null || phoneNumber.isEmpty()) {
            call.reject("Số điện thoại không hợp lệ");
            return;
        }

        try {
            Intent intent;
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
                intent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + phoneNumber));
            } else {
                intent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phoneNumber));
            }
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Đang gọi số " + phoneNumber);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi gọi điện: " + e.getMessage());
        }
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber");
        String message = call.getString("message", "");

        if (phoneNumber == null || phoneNumber.isEmpty()) {
            call.reject("Số điện thoại không hợp lệ");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_SENDTO);
            intent.setData(Uri.parse("smsto:" + phoneNumber));
            intent.putExtra("sms_body", message);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Đã mở tin nhắn tới " + phoneNumber);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi gửi tin nhắn: " + e.getMessage());
        }
    }

    @PluginMethod
    public void toggleFlashlight(PluginCall call) {
        boolean enable = call.getBoolean("enable", true);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                CameraManager camManager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
                String cameraId = camManager.getCameraIdList()[0];
                camManager.setTorchMode(cameraId, enable);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("status", enable ? "Đã bật đèn pin" : "Đã tắt đèn pin");
                call.resolve(ret);
            } else {
                call.reject("Thiết bị không hỗ trợ bật đèn pin");
            }
        } catch (Exception e) {
            call.reject("Lỗi đèn pin: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null || packageName.isEmpty()) {
            call.reject("Tên gói ứng dụng không hợp lệ");
            return;
        }

        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage(packageName);
            if (intent != null) {
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("message", "Đã mở ứng dụng");
                call.resolve(ret);
            } else {
                call.reject("Không tìm thấy ứng dụng trên máy: " + packageName);
            }
        } catch (Exception e) {
            call.reject("Lỗi mở app: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        int percent = call.getInt("percent", 70);
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            int maxVol = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int targetVol = (int) (maxVol * (percent / 100.0));
            am.setStreamVolume(AudioManager.STREAM_MUSIC, targetVol, AudioManager.FLAG_SHOW_UI);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Đã chỉnh âm lượng lên " + percent + "%");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi chỉnh âm lượng: " + e.getMessage());
        }
    }
}
