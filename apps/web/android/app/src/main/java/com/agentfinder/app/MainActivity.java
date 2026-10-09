package com.agentfinder.app;

import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * The hardware back key walks the app's own history (host home → Agent Finder → results →
     * agent) instead of closing the app, which is what Android does by default for a WebView
     * activity. Only with nothing left to go back to does it leave the app.
     */
    @Override
    public void onBackPressed() {
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
