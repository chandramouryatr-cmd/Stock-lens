package com.stocklens.app;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Background price check for watchlist targets (scheduled by Targets.schedule, about every 15 minutes). */
public class TargetJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            Targets.check(getApplicationContext());
            jobFinished(params, false);
        }, "stock-lens-targets").start();
        return true; // work continues on the thread above
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true; // try again later if Android stopped it early
    }
}
