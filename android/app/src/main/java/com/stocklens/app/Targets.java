package com.stocklens.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

/**
 * Price targets set in the watchlist. The page hands them over (setTargets), they are kept in
 * SharedPreferences, and a JobScheduler job checks Yahoo Finance about every 15 minutes, even when
 * the app is closed. When a price reaches its target, a notification is shown once.
 */
final class Targets {
    static final String CHANNEL = "targets";
    private static final int JOB_ID = 8770;
    private static final String PREFS = "stocklens", KEY = "targets";

    private Targets() { }

    static String load(Context c) {
        return prefs(c).getString(KEY, "[]");
    }

    /** Called from the page. Keeps "hit" flags the background job already set for the same target. */
    static synchronized void save(Context c, String json) {
        try {
            JSONArray incoming = new JSONArray(json), old = new JSONArray(load(c));
            for (int i = 0; i < incoming.length(); i++) {
                JSONObject n = incoming.getJSONObject(i);
                for (int j = 0; j < old.length(); j++) {
                    JSONObject o = old.getJSONObject(j);
                    if (o.optString("path").equals(n.optString("path")) && o.optDouble("target") == n.optDouble("target") && o.optBoolean("hit") && !n.optBoolean("hit")) {
                        n.put("hit", true); n.put("hitAt", o.optLong("hitAt")); n.put("hitPrice", o.optDouble("hitPrice"));
                    }
                }
            }
            prefs(c).edit().putString(KEY, incoming.toString()).apply();
            schedule(c, pending(incoming) > 0);
        } catch (Exception ignored) { }
    }

    private static int pending(JSONArray a) {
        int n = 0;
        for (int i = 0; i < a.length(); i++) if (!a.optJSONObject(i).optBoolean("hit")) n++;
        return n;
    }

    static void schedule(Context c, boolean on) {
        try { // a scheduling problem must never close the app
            JobScheduler js = c.getSystemService(JobScheduler.class);
            if (js == null) return;
            if (!on) { js.cancel(JOB_ID); return; }
            if (js.getPendingJob(JOB_ID) != null) return;
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, TargetJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(15 * 60 * 1000L)
                    .setPersisted(true) // survives a phone restart
                    .build());
        } catch (Exception e) {
            android.util.Log.w("StockLens", "target job not scheduled", e);
        }
    }

    /** One pass: fetch each pending target's price and notify on a hit. Runs off the main thread. */
    static synchronized void check(Context c) {
        try {
            JSONArray a = new JSONArray(load(c));
            boolean changed = false;
            for (int i = 0; i < a.length(); i++) {
                JSONObject t = a.getJSONObject(i);
                String sym = t.optString("sym", "");
                if (t.optBoolean("hit") || sym.isEmpty() || "null".equals(sym)) continue;
                double price = price(sym), target = t.optDouble("target");
                if (Double.isNaN(price)) continue;
                boolean up = "up".equals(t.optString("dir"));
                if (up ? price >= target : price <= target) {
                    t.put("hit", true); t.put("hitAt", System.currentTimeMillis()); t.put("hitPrice", price);
                    changed = true;
                    notify(c, t.optString("name") + " reached your target",
                            String.format(Locale.ENGLISH, "Now ₹%,.2f. Your target was ₹%,.2f (%s).", price, target, up ? "rise to" : "fall to"),
                            t.optString("path"));
                }
            }
            if (changed) prefs(c).edit().putString(KEY, a.toString()).apply();
            if (pending(a) == 0) schedule(c, false);
        } catch (Exception ignored) { }
    }

    static double price(String sym) {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL("https://query1.finance.yahoo.com/v8/finance/chart/" + sym + "?range=1d&interval=5m").openConnection();
            h.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
            h.setConnectTimeout(15000); h.setReadTimeout(15000);
            if (h.getResponseCode() != 200) return Double.NaN;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(h.getInputStream(), "UTF-8"))) {
                String line; while ((line = r.readLine()) != null) sb.append(line);
            }
            return new JSONObject(sb.toString()).getJSONObject("chart").getJSONArray("result")
                    .getJSONObject(0).getJSONObject("meta").getDouble("regularMarketPrice");
        } catch (Exception e) {
            return Double.NaN;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    static void notify(Context c, String title, String body, String path) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Price targets", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(c, MainActivity.class).putExtra("path", path).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, path.hashCode(), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        android.app.Notification n = new android.app.Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(path.hashCode(), n);
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
