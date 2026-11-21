package com.stocklens.app;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Refreshes the home-screen widget about every 15 minutes (scheduled by WidgetProvider.schedule). */
public class WidgetJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        if (!WidgetProvider.hasWidgets(this)) { WidgetProvider.schedule(this, false); return false; }
        new Thread(() -> {
            try { WidgetProvider.refresh(getApplicationContext()); }
            catch (Exception e) { android.util.Log.w("StockLens", "widget job failed", e); }
            jobFinished(params, false);
        }, "stock-lens-widget-job").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }
}
