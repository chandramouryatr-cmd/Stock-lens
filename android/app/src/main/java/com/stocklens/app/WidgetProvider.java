package com.stocklens.app;

import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Home-screen widget: Nifty 50 plus the first 5 watchlist stocks with live price and today's change.
 * The watchlist comes from the page (MainActivity bridge → SharedPreferences "watch"); prices come straight
 * from Yahoo Finance, so the widget works even when the app is closed.
 */
public class WidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.stocklens.app.WIDGET_REFRESH";
    private static final int JOB_ID = 8771;
    private static final int[] ROW = {R.id.w_row1, R.id.w_row2, R.id.w_row3, R.id.w_row4, R.id.w_row5};
    private static final int[] NAME = {R.id.w_name1, R.id.w_name2, R.id.w_name3, R.id.w_name4, R.id.w_name5};
    private static final int[] PRICE = {R.id.w_price1, R.id.w_price2, R.id.w_price3, R.id.w_price4, R.id.w_price5};
    private static final int[] CHG = {R.id.w_chg1, R.id.w_chg2, R.id.w_chg3, R.id.w_chg4, R.id.w_chg5};

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        refreshAsync(c, goAsync());
    }

    @Override
    public void onReceive(Context c, Intent i) {
        if (ACTION_REFRESH.equals(i.getAction())) refreshAsync(c, goAsync());
        else super.onReceive(c, i);
    }

    @Override
    public void onEnabled(Context c) { schedule(c, true); }

    @Override
    public void onDisabled(Context c) { schedule(c, false); }

    /** Background refresh about every 15 minutes while at least one widget is on the home screen. */
    static void schedule(Context c, boolean on) {
        // Never let a scheduling problem close the app or break the widget: the refresh button and
        // Android's own 30-minute update still work without this job.
        try {
            JobScheduler js = c.getSystemService(JobScheduler.class);
            if (js == null) return;
            if (!on) { js.cancel(JOB_ID); return; }
            if (js.getPendingJob(JOB_ID) != null) return;
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, WidgetJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(15 * 60 * 1000L)
                    .setPersisted(true)
                    .build());
        } catch (Exception e) {
            android.util.Log.w("StockLens", "widget job not scheduled", e);
        }
    }

    static boolean hasWidgets(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, WidgetProvider.class)).length > 0;
    }

    private static void refreshAsync(Context c, PendingResult pr) {
        Context app = c.getApplicationContext();
        new Thread(() -> {
            try { refresh(app); }
            catch (Exception e) { android.util.Log.w("StockLens", "widget refresh failed", e); }
            finally { if (pr != null) pr.finish(); }
        }, "stock-lens-widget").start();
    }

    /** Fetch prices and redraw every widget. Runs off the main thread. */
    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, WidgetProvider.class));
        if (ids.length == 0) return;
        schedule(c, true);

        JSONArray watch;
        try { watch = new JSONArray(c.getSharedPreferences("stocklens", Context.MODE_PRIVATE).getString("watch", "[]")); }
        catch (Exception e) { watch = new JSONArray(); }
        int n = Math.min(5, watch.length());

        // Fetch Nifty + up to 5 stocks in parallel.
        ExecutorService ex = Executors.newFixedThreadPool(4);
        Future<double[]> nifty = ex.submit(() -> quote("^NSEI"));
        @SuppressWarnings("unchecked") Future<double[]>[] q = new Future[n];
        for (int i = 0; i < n; i++) {
            String sym = watch.optJSONObject(i).optString("sym", "");
            q[i] = sym.isEmpty() || "null".equals(sym) ? null : ex.submit(() -> quote(sym));
        }

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        double[] nf = get(nifty);
        v.setTextViewText(R.id.w_nifty, nf == null ? "Nifty 50" : String.format(Locale.ENGLISH, "Nifty %s  %s", money(nf[0], 0), pct(nf[1])));
        v.setTextColor(R.id.w_nifty, c.getColor(nf == null ? R.color.w_sub : nf[1] > 0 ? R.color.w_up : nf[1] < 0 ? R.color.w_down : R.color.w_sub));
        v.setTextViewText(R.id.w_updated, "Updated " + new SimpleDateFormat("h:mm a", Locale.ENGLISH).format(new Date()));
        v.setViewVisibility(R.id.w_empty, n == 0 ? View.VISIBLE : View.GONE);

        for (int i = 0; i < 5; i++) {
            if (i >= n) { v.setViewVisibility(ROW[i], View.GONE); continue; }
            JSONObject w = watch.optJSONObject(i);
            double[] p = q[i] == null ? null : get(q[i]);
            v.setViewVisibility(ROW[i], View.VISIBLE);
            v.setTextViewText(NAME[i], w.optString("name"));
            v.setTextViewText(PRICE[i], p == null ? "—" : "₹" + money(p[0], p[0] < 100 ? 2 : p[0] < 1000 ? 1 : 0));
            v.setTextViewText(CHG[i], p == null ? "—" : pct(p[1]));
            v.setInt(CHG[i], "setBackgroundResource", p == null || p[1] == 0 ? R.drawable.chip_flat : p[1] > 0 ? R.drawable.chip_up : R.drawable.chip_down);
            // Tap a row → that stock's page.
            v.setOnClickPendingIntent(ROW[i], open(c, 100 + i, w.optString("path"), null));
        }
        ex.shutdown();

        // Tap the header → Watchlist; tap the refresh arrow → refresh now.
        v.setOnClickPendingIntent(R.id.w_header, open(c, 90, null, "/watchlist"));
        v.setOnClickPendingIntent(R.id.w_empty, open(c, 91, null, "/watchlist"));
        Intent r = new Intent(c, WidgetProvider.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.w_refresh, PendingIntent.getBroadcast(c, 92, r, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        m.updateAppWidget(ids, v);
    }

    private static PendingIntent open(Context c, int code, String path, String hash) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (path != null) i.putExtra("path", path);
        if (hash != null) i.putExtra("hash", hash);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static double[] get(Future<double[]> f) {
        try { return f.get(20, java.util.concurrent.TimeUnit.SECONDS); } catch (Exception e) { return null; }
    }

    /** {price, change % today} from Yahoo Finance, or null. */
    static double[] quote(String sym) {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL("https://query1.finance.yahoo.com/v8/finance/chart/"
                    + java.net.URLEncoder.encode(sym, "UTF-8") + "?range=1d&interval=5m").openConnection();
            h.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
            h.setConnectTimeout(12000); h.setReadTimeout(12000);
            if (h.getResponseCode() != 200) return null;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader rd = new BufferedReader(new InputStreamReader(h.getInputStream(), "UTF-8"))) {
                String line; while ((line = rd.readLine()) != null) sb.append(line);
            }
            JSONObject meta = new JSONObject(sb.toString()).getJSONObject("chart").getJSONArray("result").getJSONObject(0).getJSONObject("meta");
            double last = meta.getDouble("regularMarketPrice");
            double prev = meta.optDouble("chartPreviousClose", meta.optDouble("previousClose", Double.NaN));
            return new double[]{last, Double.isNaN(prev) || prev == 0 ? 0 : (last / prev - 1) * 100};
        } catch (Exception e) {
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    private static String money(double v, int d) {
        // Indian grouping (12,34,567) like the rest of the app.
        java.text.NumberFormat f = java.text.NumberFormat.getNumberInstance(new Locale("en", "IN"));
        f.setMinimumFractionDigits(d); f.setMaximumFractionDigits(d);
        return f.format(v);
    }

    private static String pct(double v) {
        return String.format(Locale.ENGLISH, "%s%.2f%%", v > 0 ? "+" : v < 0 ? "−" : "", Math.abs(v));
    }
}
