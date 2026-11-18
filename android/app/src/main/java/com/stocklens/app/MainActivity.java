package com.stocklens.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.window.OnBackInvokedDispatcher;

import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

/**
 * Stock Lens on the phone: the same Python server as the PC version runs inside this app
 * (on 127.0.0.1, reachable only from this phone), and a full-screen WebView shows its pages.
 */
public class MainActivity extends Activity {
    private static final String HOST = "127.0.0.1";
    private static String serverUrl; // survives activity re-creation; the server lives as long as the process

    private FrameLayout root;
    private WebView web;
    private TextView status;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFFF5F5F7);

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true); // watchlist, portfolio, notes live in localStorage
        ws.setTextZoom(100);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.addJavascriptInterface(new Bar(), "AndroidBar");
        web.addJavascriptInterface(new Bridge(), "StockLensApp"); // watchlist price targets → notifications
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // News articles, Screener pages, filings: open in the phone's browser.
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                // Keep the status-bar strip the same colour as the page (light or dark appearance).
                v.evaluateJavascript("(function(){function s(){try{AndroidBar.set(getComputedStyle(document.body).backgroundColor)}catch(e){}}"
                        + "s();new MutationObserver(s).observe(document.documentElement,{attributes:true});"
                        + "matchMedia('(prefers-color-scheme: dark)').addEventListener('change',s)})()", null);
            }
        });

        status = new TextView(this);
        status.setText("Starting Stock Lens…");
        status.setTextSize(16);
        status.setTextColor(0xFF6E6E73);
        status.setGravity(Gravity.CENTER);
        status.setPadding(48, 48, 48, 48);

        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.addView(status, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        // Draw edge to edge, but keep the page clear of the status bar, gesture bar and keyboard.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsets.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsets.CONSUMED;
        });
        lightBars(true); // only after setContentView (Android 17 crashes otherwise)

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }

        if (saved != null) web.restoreState(saved);
        startServer(saved == null);
    }

    private void startServer(boolean load) {
        if (serverUrl != null) { ready(load); return; }
        new Thread(() -> {
            try {
                // One start at a time: opening the app twice quickly must not start two servers.
                synchronized (MainActivity.class) {
                    if (serverUrl == null) {
                        if (!Python.isStarted()) Python.start(new AndroidPlatform(getApplicationContext()));
                        serverUrl = Python.getInstance().getModule("android_main")
                                .callAttr("start", getFilesDir().getAbsolutePath()).toString();
                    }
                }
                runOnUiThread(() -> ready(true));
            } catch (Throwable t) {
                runOnUiThread(() -> status.setText("Stock Lens could not start.\n\n" + t));
            }
        }, "stock-lens-start").start();
    }

    private void ready(boolean load) {
        status.setVisibility(View.GONE);
        String path = getIntent().getStringExtra("path"); // opened from a target notification
        if (path != null && !path.isEmpty()) { getIntent().removeExtra("path"); web.loadUrl(serverUrl + "/#/c" + path); }
        else if (load || web.getUrl() == null) web.loadUrl(serverUrl + "/");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String path = intent.getStringExtra("path");
        if (serverUrl != null && path != null && !path.isEmpty()) { intent.removeExtra("path"); web.loadUrl(serverUrl + "/#/c" + path); }
    }

    /** Called from watch.js. Everything here stays on the phone. */
    private class Bridge {
        @JavascriptInterface public void setTargets(String json) { Targets.save(getApplicationContext(), json); }
        @JavascriptInterface public String getTargets() { return Targets.load(getApplicationContext()); }
        @JavascriptInterface public void notify(String title, String body, String path) { Targets.notify(getApplicationContext(), title, body, path); }
        @JavascriptInterface public void askNotify() {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                runOnUiThread(() -> requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1));
        }
    }

    /** Back: close the details panel or chat first, then go back a page, then leave the app. */
    private void goBack() {
        web.evaluateJavascript("(function(){var s=document.getElementById('sheet');"
                + "if(s&&s.getAttribute('aria-hidden')==='false'){document.getElementById('sheet-close').click();return 1}"
                + "var p=document.getElementById('askp');if(p&&!p.classList.contains('hidden')&&p.offsetParent){var c=p.querySelector('[data-collapse],.askp-min,#askp-min');if(c){c.click();return 1}}"
                + "return 0})()", r -> {
            if ("1".equals(r)) return;
            if (web.canGoBack()) web.goBack(); else finish();
        });
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() { goBack(); } // Android 12 and older

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    private void lightBars(boolean light) {
        WindowInsetsController c = getWindow().getInsetsController();
        if (c == null) return;
        int f = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        c.setSystemBarsAppearance(light ? f : 0, f);
    }

    /** Called from the page with its background colour, e.g. "rgb(245, 245, 247)". */
    private class Bar {
        @JavascriptInterface
        public void set(String css) {
            try {
                String[] p = css.replaceAll("[^0-9,.]", "").split(",");
                int r = Math.round(Float.parseFloat(p[0])), g = Math.round(Float.parseFloat(p[1])), b = Math.round(Float.parseFloat(p[2]));
                boolean light = (r * 299 + g * 587 + b * 114) / 1000 > 140;
                runOnUiThread(() -> { root.setBackgroundColor(Color.rgb(r, g, b)); lightBars(light); });
            } catch (Exception ignored) { }
        }
    }
}
