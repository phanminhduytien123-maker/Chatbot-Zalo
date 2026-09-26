package com.diana.voiceassistant;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DianaNativePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                WebSettings webSettings = this.bridge.getWebView().getSettings();
                webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                webSettings.setDomStorageEnabled(true);
                webSettings.setDatabaseEnabled(true);
            }
        } catch (Exception ignored) {}
    }
}

