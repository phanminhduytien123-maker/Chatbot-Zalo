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
import android.util.Log;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "DianaNative",
    permissions = {
        @Permission(strings = {Manifest.permission.CALL_PHONE}, alias = "call"),
        @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "audio"),
        @Permission(strings = {Manifest.permission.SEND_SMS}, alias = "sms"),
        @Permission(strings = {Manifest.permission.READ_CONTACTS}, alias = "contacts")
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
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Context context = getContext();
            boolean launched = false;

            try {
                context.startActivity(intent);
                launched = true;
            } catch (Exception e1) {
                try {
                    Intent clockIntent = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
                    clockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(clockIntent);
                    launched = true;
                } catch (Exception e2) {
                    Log.e("DianaNative", "Lỗi khởi động Alarm intent", e2);
                }
            }

            String timeStr = hour + ":" + (minutes < 10 ? "0" + minutes : minutes);
            try {
                android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                mainHandler.post(() -> {
                    android.widget.Toast.makeText(context, "⏰ Diana đã cài báo thức lúc " + timeStr, android.widget.Toast.LENGTH_LONG).show();
                });
            } catch (Exception ignored) {}

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Dạ em đã đặt báo thức trên điện thoại lúc " + hour + " giờ " + (minutes < 10 ? "0" + minutes : minutes) + " phút cho anh rồi nhé! ⏰");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi đặt báo thức: " + e.getMessage());
        }
    }

    @PluginMethod
    public void makePhoneCall(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber");
        String zaloDataId = call.getString("zaloDataId", "");
        String userId = call.getString("userId", "");
        String sim = call.getString("sim", "");
        String app = call.getString("app", "phone");
        String action = call.getString("action", "call"); // "call", "chat", "video"

        if ((phoneNumber == null || phoneNumber.isEmpty()) && (zaloDataId == null || zaloDataId.isEmpty()) && (userId == null || userId.isEmpty())) {
            call.reject("Số điện thoại hoặc liên hệ không hợp lệ");
            return;
        }

        try {
            Context context = getContext();

            // 1. Xử lý tác vụ Zalo (Nhắn tin / Gọi thoại / Gọi video)
            if ("zalo".equalsIgnoreCase(app)) {
                boolean openedNatively = false;

                // Cách 1: Sử dụng Zalo Data ID từ Android Contacts Provider nếu có
                if (zaloDataId != null && !zaloDataId.isEmpty()) {
                    try {
                        Intent zaloDataIntent = new Intent(Intent.ACTION_VIEW);
                        String mimeType = "vnd.android.cursor.item/com.zing.zalo.call";
                        if ("chat".equalsIgnoreCase(action)) {
                            mimeType = "vnd.android.cursor.item/com.zing.zalo.message";
                        } else if ("video".equalsIgnoreCase(action)) {
                            mimeType = "vnd.android.cursor.item/com.zing.zalo.video.call";
                        }
                        zaloDataIntent.setDataAndType(Uri.parse("content://com.android.contacts/data/" + zaloDataId), mimeType);
                        zaloDataIntent.setPackage("com.zing.zalo");
                        zaloDataIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(zaloDataIntent);
                        openedNatively = true;
                    } catch (Exception ignored) {}
                }

                // Cách 2: Mở qua User ID nếu có
                if (!openedNatively && userId != null && !userId.isEmpty()) {
                    try {
                        Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://zalo.me/" + Uri.encode(userId)));
                        viewIntent.setPackage("com.zing.zalo");
                        viewIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(viewIntent);
                        openedNatively = true;
                    } catch (Exception ignored) {}
                }

                // Cách 3: Mở qua liên kết https://zalo.me/[phone]
                if (!openedNatively) {
                    String cleanPhone = (phoneNumber != null) ? phoneNumber.replaceAll("[\\s.-]", "") : "";
                    if (cleanPhone.startsWith("+84")) {
                        cleanPhone = "0" + cleanPhone.substring(3);
                    }
                    Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://zalo.me/" + Uri.encode(cleanPhone)));
                    viewIntent.setPackage("com.zing.zalo");
                    viewIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(viewIntent);
                }

                String actionText = "chat".equalsIgnoreCase(action) ? "nhắn tin" : ("video".equalsIgnoreCase(action) ? "gọi video" : "gọi");
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("message", "Đã mở Zalo để " + actionText + " ạ! 💬");
                call.resolve(ret);
                return;
            }

            // 2. Xử lý Gọi thường qua SIM (GSM)
            boolean hasCallPerm = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED;
            
            if (!hasCallPerm) {
                Intent intent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(phoneNumber)));
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("message", "Đã mở bàn phím gọi số " + phoneNumber);
                call.resolve(ret);
                return;
            }

            android.telecom.TelecomManager telecomManager = (android.telecom.TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
            android.telephony.SubscriptionManager subManager = (android.telephony.SubscriptionManager) context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            
            android.telecom.PhoneAccountHandle targetHandle = null;
            String chosenSimName = "";
            int slotIdx = 0;
            int subId = 1;

            if (subManager != null && ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                java.util.List<android.telephony.SubscriptionInfo> subList = subManager.getActiveSubscriptionInfoList();
                java.util.List<android.telecom.PhoneAccountHandle> handles = (telecomManager != null) ? telecomManager.getCallCapablePhoneAccounts() : null;

                if (subList != null && !subList.isEmpty()) {
                    android.telephony.SubscriptionInfo targetSub = null;
                    String simQuery = (sim != null) ? sim.trim().toLowerCase() : "";

                    if (!simQuery.isEmpty()) {
                        for (android.telephony.SubscriptionInfo info : subList) {
                            String disp = info.getDisplayName() != null ? info.getDisplayName().toString().toLowerCase() : "";
                            String carrier = info.getCarrierName() != null ? info.getCarrierName().toString().toLowerCase() : "";
                            int slot = info.getSimSlotIndex();

                            if (disp.contains(simQuery) || carrier.contains(simQuery) ||
                                (simQuery.contains("1") && slot == 0) ||
                                (simQuery.contains("2") && slot == 1) ||
                                (simQuery.contains("vina") && slot == 0) ||
                                (simQuery.contains("mobi") && slot == 1)) {
                                targetSub = info;
                                chosenSimName = info.getDisplayName() != null ? info.getDisplayName().toString() : carrier;
                                break;
                            }
                        }
                    }

                    if (targetSub == null && !subList.isEmpty()) {
                        targetSub = subList.get(0);
                        chosenSimName = targetSub.getDisplayName() != null ? targetSub.getDisplayName().toString() : "";
                    }

                    if (targetSub != null) {
                        slotIdx = targetSub.getSimSlotIndex();
                        subId = targetSub.getSubscriptionId();

                        // Tìm trong list handles hệ thống
                        if (handles != null) {
                            for (android.telecom.PhoneAccountHandle handle : handles) {
                                if (handle.getId().equals(String.valueOf(subId)) ||
                                    handle.getId().equals(targetSub.getIccId()) ||
                                    handle.getId().contains(String.valueOf(slotIdx))) {
                                    targetHandle = handle;
                                    break;
                                }
                            }
                        }

                        // Nếu chưa có, khởi tạo chính xác PhoneAccountHandle cho TelephonyConnectionService
                        if (targetHandle == null) {
                            android.content.ComponentName telephonyComp = new android.content.ComponentName(
                                "com.android.phone", 
                                "com.android.services.telephony.TelephonyConnectionService"
                            );
                            targetHandle = new android.telecom.PhoneAccountHandle(telephonyComp, String.valueOf(subId));
                        }
                    }
                }
            }

            Uri uri = Uri.parse("tel:" + Uri.encode(phoneNumber));
            android.os.Bundle extras = new android.os.Bundle();
            
            if (targetHandle != null) {
                extras.putParcelable(android.telecom.TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, targetHandle);
                extras.putParcelable("android.telecom.extra.PHONE_ACCOUNT_HANDLE", targetHandle);
            }
            extras.putBoolean(android.telecom.TelecomManager.EXTRA_START_CALL_WITH_SPEAKERPHONE, false);
            extras.putInt("simSlot", slotIdx);
            extras.putInt("slot", slotIdx);
            extras.putInt("com.android.phone.extra.slot", slotIdx);
            extras.putInt("simId", subId);
            extras.putInt("subscription", subId);
            extras.putInt("sub_id", subId);
            extras.putInt("subscription_id", subId);
            extras.putInt("phone_account_or_subid", subId);
            extras.putInt("android.telephony.extra.SUBSCRIPTION_INDEX", subId);
            extras.putBoolean("com.android.phone.force.slot", true);
            extras.putBoolean("Cdma_Supp", true);

            if (telecomManager != null) {
                telecomManager.placeCall(uri, extras);
            } else {
                Intent intent = new Intent(Intent.ACTION_CALL, uri);
                intent.setPackage("com.android.server.telecom");
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                intent.putExtras(extras);
                context.startActivity(intent);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Đang gọi thường tới " + phoneNumber + (!chosenSimName.isEmpty() ? " qua SIM " + chosenSimName : ""));
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

    @PermissionCallback
    private void contactsPermCallback(PluginCall call) {
        if (getPermissionState("contacts") == com.getcapacitor.PermissionState.GRANTED) {
            searchContacts(call);
        } else {
            call.reject("Chưa có quyền truy cập danh bạ");
        }
    }

    @PluginMethod
    public void searchContacts(PluginCall call) {
        String query = call.getString("name", "");
        if (query == null || query.trim().isEmpty()) {
            call.reject("Tên tìm kiếm không được để trống");
            return;
        }

        Context context = getContext();
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermCallback");
            return;
        }

        boolean onlyZaloFriends = call.getBoolean("onlyZaloFriends", false);
        String normQuery = removeAccents(query.trim());
        String[] queryWords = normQuery.split("\\s+");

        class ScoredContact {
            String name;
            String phoneNumber;
            String photo;
            String zaloDataId;
            boolean isZaloFriend;
            int score;
        }

        java.util.List<ScoredContact> scoredList = new java.util.ArrayList<>();
        java.util.Map<String, ScoredContact> mapByPhone = new java.util.HashMap<>();
        java.util.Map<Long, String> zaloDataIdMap = new java.util.HashMap<>(); // contactId -> zaloDataId

        try {
            android.content.ContentResolver cr = context.getContentResolver();

            // 1. Truy vấn các liên kết Zalo Data nếu có
            try {
                android.net.Uri dataUri = android.provider.ContactsContract.Data.CONTENT_URI;
                String[] dataProj = new String[] {
                    android.provider.ContactsContract.Data._ID,
                    android.provider.ContactsContract.Data.CONTACT_ID,
                    android.provider.ContactsContract.Data.MIMETYPE,
                    android.provider.ContactsContract.Data.DATA3,
                    android.provider.ContactsContract.Data.DISPLAY_NAME
                };
                String dataSel = android.provider.ContactsContract.Data.MIMETYPE + " = 'vnd.android.cursor.item/com.zing.zalo.call'";
                android.database.Cursor dataCursor = cr.query(dataUri, dataProj, dataSel, null, null);
                if (dataCursor != null) {
                    while (dataCursor.moveToNext()) {
                        long dId = dataCursor.getLong(0);
                        long cId = dataCursor.getLong(1);
                        zaloDataIdMap.put(cId, String.valueOf(dId));
                    }
                    dataCursor.close();
                }
            } catch (Exception ignored) {}

            // 2. Truy vấn danh bạ điện thoại chính (ContactsContract.CommonDataKinds.Phone)
            android.net.Uri phoneUri = android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI;
            String[] phoneProj = new String[] {
                android.provider.ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER,
                android.provider.ContactsContract.CommonDataKinds.Phone.PHOTO_THUMBNAIL_URI
            };

            android.database.Cursor cursor = cr.query(phoneUri, phoneProj, null, null, android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC");
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    long contactId = cursor.getLong(0);
                    String displayName = cursor.getString(1);
                    String number = cursor.getString(2);
                    String photo = cursor.getString(3);

                    if (displayName == null || number == null) continue;

                    String normName = removeAccents(displayName);
                    String cleanPhone = number.replaceAll("[\\s.-]", "");
                    if (cleanPhone.startsWith("+84")) {
                        cleanPhone = "0" + cleanPhone.substring(3);
                    } else if (cleanPhone.startsWith("84") && cleanPhone.length() >= 11) {
                        cleanPhone = "0" + cleanPhone.substring(2);
                    }

                    // Tính điểm khớp tên (Scoring)
                    int score = 0;
                    if (normName.equals(normQuery)) {
                        score = 100; // Khớp chính xác 100%
                    } else if (normName.startsWith(normQuery)) {
                        score = 80;  // Bắt đầu bằng từ khóa
                    } else if (normName.contains(" " + normQuery + " ") || normName.endsWith(" " + normQuery) || normName.startsWith(normQuery + " ")) {
                        score = 70;  // Khớp chính xác từng từ đứng riêng
                    } else if (normName.contains(normQuery)) {
                        score = 50;  // Chứa từ khóa
                    } else {
                        // Khớp tất cả các từ trong query
                        boolean allWordsMatch = true;
                        for (String w : queryWords) {
                            if (!w.isEmpty() && !normName.contains(w)) {
                                allWordsMatch = false;
                                break;
                            }
                        }
                        if (allWordsMatch && queryWords.length > 0) {
                            score = 40;
                        } else if (normQuery.length() >= 3 && normQuery.contains(normName) && normName.length() >= 2) {
                            score = 30;
                        }
                    }

                    if (score > 0) {
                        String zDataId = zaloDataIdMap.get(contactId);
                        boolean isZalo = (zDataId != null);
                        if (isZalo) score += 10; // Ưu tiên người có Zalo

                        if (!mapByPhone.containsKey(cleanPhone) || mapByPhone.get(cleanPhone).score < score) {
                            ScoredContact sc = new ScoredContact();
                            sc.name = displayName;
                            sc.phoneNumber = cleanPhone;
                            sc.photo = (photo != null) ? photo : "";
                            sc.zaloDataId = (zDataId != null) ? zDataId : "";
                            sc.isZaloFriend = isZalo;
                            sc.score = score;

                            mapByPhone.put(cleanPhone, sc);
                        }
                    }
                }
                cursor.close();
            }

            // 3. Quét thêm bảng Zalo Data độc lập (nếu có tài khoản Zalo không lưu trong Phone table)
            try {
                android.net.Uri uri = android.provider.ContactsContract.Data.CONTENT_URI;
                String[] proj = new String[] {
                    android.provider.ContactsContract.Data._ID,
                    android.provider.ContactsContract.Data.DISPLAY_NAME,
                    android.provider.ContactsContract.Data.DATA3,
                    android.provider.ContactsContract.Data.PHOTO_THUMBNAIL_URI,
                    android.provider.ContactsContract.Data.DATA1
                };
                String sel = android.provider.ContactsContract.Data.MIMETYPE + " = ?";
                String[] selArgs = new String[] { "vnd.android.cursor.item/com.zing.zalo.call" };
                android.database.Cursor zCursor = cr.query(uri, proj, sel, selArgs, null);
                if (zCursor != null) {
                    while (zCursor.moveToNext()) {
                        long dId = zCursor.getLong(0);
                        String displayName = zCursor.getString(1);
                        String data3 = zCursor.getString(2);
                        String photo = zCursor.getString(3);
                        String data1 = zCursor.getString(4);

                        if (displayName == null) continue;
                        String normName = removeAccents(displayName);

                        String cleanPhone = "";
                        if (data3 != null) {
                            int start = data3.indexOf('(');
                            int end = data3.indexOf(')', start);
                            if (start != -1 && end != -1) {
                                cleanPhone = data3.substring(start + 1, end).replaceAll("[\\s.-]", "");
                            }
                        }
                        if (cleanPhone.startsWith("+84")) cleanPhone = "0" + cleanPhone.substring(3);
                        else if (cleanPhone.startsWith("84") && cleanPhone.length() >= 11) cleanPhone = "0" + cleanPhone.substring(2);

                        if (cleanPhone.isEmpty() && data1 != null) cleanPhone = data1;

                        int score = 0;
                        if (normName.equals(normQuery)) score = 110;
                        else if (normName.startsWith(normQuery)) score = 90;
                        else if (normName.contains(" " + normQuery + " ") || normName.endsWith(" " + normQuery) || normName.startsWith(normQuery + " ")) score = 80;
                        else if (normName.contains(normQuery)) score = 60;
                        else {
                            boolean allWordsMatch = true;
                            for (String w : queryWords) {
                                if (!w.isEmpty() && !normName.contains(w)) {
                                    allWordsMatch = false;
                                    break;
                                }
                            }
                            if (allWordsMatch && queryWords.length > 0) score = 50;
                        }

                        if (score > 0) {
                            String key = cleanPhone.isEmpty() ? displayName : cleanPhone;
                            if (!mapByPhone.containsKey(key) || mapByPhone.get(key).score < score) {
                                ScoredContact sc = new ScoredContact();
                                sc.name = displayName;
                                sc.phoneNumber = cleanPhone;
                                sc.photo = (photo != null) ? photo : "";
                                sc.zaloDataId = String.valueOf(dId);
                                sc.isZaloFriend = true;
                                sc.score = score;
                                mapByPhone.put(key, sc);
                            }
                        }
                    }
                    zCursor.close();
                }
            } catch (Exception ignored) {}

            // Chuyển sang danh sách và sắp xếp theo điểm số cao nhất lên đầu
            scoredList.addAll(mapByPhone.values());
            java.util.Collections.sort(scoredList, (a, b) -> Integer.compare(b.score, a.score));

            com.getcapacitor.JSArray results = new com.getcapacitor.JSArray();
            for (ScoredContact sc : scoredList) {
                // Nếu tìm bạn bè Zalo, BỎ QUA HOÀN TOÀN những người không có tài khoản Zalo / không phải Zalo data
                if (onlyZaloFriends && (!sc.isZaloFriend || sc.zaloDataId == null || sc.zaloDataId.isEmpty())) {
                    continue;
                }

                JSObject item = new JSObject();
                item.put("name", sc.name);
                item.put("phoneNumber", sc.phoneNumber);
                item.put("photo", sc.photo);
                item.put("zaloDataId", sc.zaloDataId);
                item.put("isZaloFriend", sc.isZaloFriend);
                results.put(item);
            }

            JSObject ret = new JSObject();
            ret.put("contacts", results);
            ret.put("count", results.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi tìm danh bạ: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getAllDeviceZaloContacts(PluginCall call) {
        Context context = getContext();
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermCallback");
            return;
        }

        try {
            android.content.ContentResolver cr = context.getContentResolver();
            android.net.Uri uri = android.provider.ContactsContract.Data.CONTENT_URI;
            String[] proj = new String[] {
                android.provider.ContactsContract.Data._ID,
                android.provider.ContactsContract.Data.DISPLAY_NAME,
                android.provider.ContactsContract.Data.DATA3,
                android.provider.ContactsContract.Data.PHOTO_THUMBNAIL_URI,
                android.provider.ContactsContract.Data.DATA1
            };
            String sel = android.provider.ContactsContract.Data.MIMETYPE + " = ?";
            String[] selArgs = new String[] { "vnd.android.cursor.item/com.zing.zalo.call" };
            android.database.Cursor zCursor = cr.query(uri, proj, sel, selArgs, null);

            com.getcapacitor.JSArray results = new com.getcapacitor.JSArray();
            if (zCursor != null) {
                while (zCursor.moveToNext()) {
                    long dId = zCursor.getLong(0);
                    String displayName = zCursor.getString(1);
                    String data3 = zCursor.getString(2);
                    String photo = zCursor.getString(3);
                    String data1 = zCursor.getString(4);

                    if (displayName == null) continue;

                    String cleanPhone = "";
                    if (data3 != null) {
                        int start = data3.indexOf('(');
                        int end = data3.indexOf(')', start);
                        if (start != -1 && end != -1) {
                            cleanPhone = data3.substring(start + 1, end).replaceAll("[\\s.-]", "");
                        }
                    }
                    if (cleanPhone.startsWith("+84")) cleanPhone = "0" + cleanPhone.substring(3);
                    else if (cleanPhone.startsWith("84") && cleanPhone.length() >= 11) cleanPhone = "0" + cleanPhone.substring(2);

                    if (cleanPhone.isEmpty() && data1 != null) cleanPhone = data1;

                    JSObject item = new JSObject();
                    item.put("name", displayName);
                    item.put("phoneNumber", cleanPhone);
                    item.put("photo", (photo != null) ? photo : "");
                    item.put("zaloDataId", String.valueOf(dId));
                    item.put("isZaloFriend", true);
                    results.put(item);
                }
                zCursor.close();
            }

            JSObject ret = new JSObject();
            ret.put("contacts", results);
            ret.put("count", results.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi quét danh bạ Zalo trên máy: " + e.getMessage());
        }
    }

    /**
     * Lấy toàn bộ danh sách ứng dụng đã cài đặt trên điện thoại (Tên hiển thị + Package)
     */
    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        try {
            Context context = getContext();
            PackageManager pm = context.getPackageManager();
            Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
            mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);

            java.util.List<android.content.pm.ResolveInfo> resolveInfos = pm.queryIntentActivities(mainIntent, 0);
            com.getcapacitor.JSArray appList = new com.getcapacitor.JSArray();
            java.util.Set<String> addedPackages = new java.util.HashSet<>();

            for (android.content.pm.ResolveInfo info : resolveInfos) {
                try {
                    String pkg = info.activityInfo.packageName;
                    if (pkg == null || addedPackages.contains(pkg)) continue;
                    addedPackages.add(pkg);

                    String label = info.loadLabel(pm).toString();
                    JSObject app = new JSObject();
                    app.put("appName", label);
                    app.put("packageName", pkg);
                    app.put("activityName", info.activityInfo.name);
                    appList.put(app);
                } catch (Exception ignored) {}
            }

            JSObject ret = new JSObject();
            ret.put("apps", appList);
            ret.put("count", appList.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi lấy danh sách ứng dụng: " + e.getMessage());
        }
    }

    /**
     * Mở bất kỳ ứng dụng, game, camera, ghi chú nào trên điện thoại
     */
    @PluginMethod
    public void openApp(PluginCall call) {
        String packageName = call.getString("packageName");
        String appName = call.getString("appName");
        Context context = getContext();
        PackageManager pm = context.getPackageManager();

        try {
            // 1. Mở trực tiếp bằng Package Name nếu có
            if (packageName != null && !packageName.isEmpty()) {
                Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(launchIntent);

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("packageName", packageName);
                    ret.put("appName", appName != null ? appName : packageName);
                    ret.put("message", "Đã mở ứng dụng " + (appName != null ? appName : packageName) + " thành công! 🚀");
                    call.resolve(ret);
                    return;
                }
            }

            // 2. Tìm kiếm thông minh theo tên ứng dụng trong toàn bộ máy
            if (appName != null && !appName.isEmpty()) {
                Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
                mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                java.util.List<android.content.pm.ResolveInfo> resolveInfos = pm.queryIntentActivities(mainIntent, 0);

                String normTarget = removeAccents(appName.toLowerCase().trim());
                android.content.pm.ResolveInfo bestMatch = null;
                int bestScore = 0;

                for (android.content.pm.ResolveInfo info : resolveInfos) {
                    String label = info.loadLabel(pm).toString();
                    String normLabel = removeAccents(label.toLowerCase().trim());
                    String pkg = info.activityInfo.packageName.toLowerCase();

                    int score = 0;
                    if (normLabel.equals(normTarget)) {
                        score = 120;
                    } else if (normLabel.startsWith(normTarget)) {
                        score = 100;
                    } else if (normLabel.contains(normTarget)) {
                        score = 80;
                    } else if (pkg.contains(normTarget)) {
                        score = 60;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = info;
                    }
                }

                if (bestMatch != null) {
                    String pkg = bestMatch.activityInfo.packageName;
                    Intent launchIntent = pm.getLaunchIntentForPackage(pkg);
                    if (launchIntent != null) {
                        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(launchIntent);

                        String openedName = bestMatch.loadLabel(pm).toString();
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("packageName", pkg);
                        ret.put("appName", openedName);
                        ret.put("message", "Đã mở ứng dụng " + openedName + " thành công! 🚀");
                        call.resolve(ret);
                        return;
                    }
                }
            }

            // 3. Fallback cho các ứng dụng hệ thống phổ biến
            if (appName != null) {
                String norm = removeAccents(appName.toLowerCase());

                // A. Máy ảnh / Camera
                if (norm.contains("camera") || norm.contains("may anh") || norm.contains("chup anh") || norm.contains("chup hinh") || norm.contains("quay phim") || norm.contains("quay video")) {
                    Intent cameraIntent = new Intent(android.provider.MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);
                    cameraIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(cameraIntent);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("appName", "Máy ảnh (Camera)");
                    ret.put("message", "Đã mở Camera máy ảnh cho anh rồi ạ! 📸");
                    call.resolve(ret);
                    return;
                }

                // B. Ghi chú (Notes / Keep / Sổ tay)
                if (norm.contains("ghi chu") || norm.contains("note") || norm.contains("so tay")) {
                    String[] notePackages = {"com.miui.notes", "com.google.android.keep", "com.samsung.android.app.notes", "com.coloros.note", "com.vivo.notes", "com.huawei.notepad"};
                    for (String np : notePackages) {
                        Intent nIntent = pm.getLaunchIntentForPackage(np);
                        if (nIntent != null) {
                            nIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            context.startActivity(nIntent);
                            JSObject ret = new JSObject();
                            ret.put("success", true);
                            ret.put("appName", "Ghi chú");
                            ret.put("message", "Đã mở ứng dụng Ghi chú cho anh rồi ạ! 📝");
                            call.resolve(ret);
                            return;
                        }
                    }
                }

                // C. Cài đặt hệ thống
                if (norm.contains("cai dat") || norm.contains("setting")) {
                    Intent setIntent = new Intent(android.provider.Settings.ACTION_SETTINGS);
                    setIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(setIntent);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("appName", "Cài đặt");
                    ret.put("message", "Đã mở Cài đặt hệ thống cho anh rồi ạ! ⚙️");
                    call.resolve(ret);
                    return;
                }

                // D. Bộ sưu tập / Thư viện ảnh
                if (norm.contains("bo suu tap") || norm.contains("thu vien") || norm.contains("gallery") || norm.contains("photos")) {
                    Intent galleryIntent = new Intent(Intent.ACTION_VIEW);
                    galleryIntent.setType("image/*");
                    galleryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(galleryIntent);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("appName", "Bộ sưu tập");
                    ret.put("message", "Đã mở Bộ sưu tập ảnh cho anh rồi ạ! 🖼️");
                    call.resolve(ret);
                    return;
                }
            }

            call.reject("Không tìm thấy ứng dụng \"" + (appName != null ? appName : packageName) + "\" trên điện thoại của anh.");
        } catch (Exception e) {
            call.reject("Lỗi mở ứng dụng: " + e.getMessage());
        }
    }

    private String removeAccents(String str) {
        if (str == null) return "";
        String nfd = java.text.Normalizer.normalize(str, java.text.Normalizer.Form.NFD);
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("\\p{InCombiningDiacriticalMarks}+");
        return pattern.matcher(nfd).replaceAll("").replace('đ', 'd').replace('Đ', 'D').trim();
    }
}

