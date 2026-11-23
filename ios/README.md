# Stock Lens for iPhone

The iPhone version works like the Android app:
- it runs the normal Stock Lens Python server inside the app, on `127.0.0.1`, so only the phone can reach it;
- it shows the same pages in a full-screen web view.

It's built with **BeeWare**: **Briefcase** packages Python for iPhone and creates the Xcode project, and **Toga** provides the web view.

**Status:** the code is written but not yet built or tested. Apple only lets iPhone apps be built on a Mac, and this project was written on Windows. Expect a few small fixes the first time it is built.

## What's in it

| Path | What it is |
|---|---|
| `pyproject.toml` | App name, bundle id (`com.stocklens.stocklens`), Python packages, iPhone settings (plain `http` allowed to the app's own server only) |
| `src/stocklens_ios/app.py` | Starts the server, shows the pages, opens news and other outside links in Safari |
| `sync.py` | Copies `../app` and `../static` into `src/` (one copy of the code to edit) and draws the app icons into `resources/` |
| `../.github/workflows/ios-build.yml` | Optional: builds it for the iPhone Simulator on a free GitHub cloud Mac |

## Same as Android, and what's missing

**Same as Android:** all pages (Home, Watchlist, Markets, Screener, Portfolio, every stock tab), news search and pins, sectors, commodities, fear gauge, watchlist and price targets while the app is open.

**Not yet on iPhone:**

| Missing | Why |
|---|---|
| Home-screen widget | Needs Apple's WidgetKit, written in Swift. |
| Price-target notifications while the app is closed | Needs Apple's UserNotifications plus a background refresh. |
| Ask Claude | The Anthropic SDK is left out, as on Android; **Meaning** still works. |

## Build it

### Option A: on a Mac

```
pip install briefcase pillow
python ios/sync.py            # run this before every build
cd ios
briefcase create iOS
briefcase run iOS             # opens it in the iPhone Simulator
```

### Option B: no Mac

On GitHub, open the **Actions** tab, choose **iOS build**, then **Run workflow**. It builds for the Simulator only, to check that everything compiles.

## Put it on your iPhone

- **With a Mac and a free Apple ID:**
  1. Run `briefcase open iOS` to open the project in Xcode.
  2. Choose your Apple ID under *Signing & Capabilities*, plug in the iPhone and press Run.
  3. The app stops working after 7 days. Run it from Xcode again to renew it.
- **With an Apple Developer account ($99 / year):** sign the app and upload it with `briefcase package iOS`, then install it through **TestFlight**. Later, publish it on the App Store. This also works from the cloud Mac, once the signing certificates are added as GitHub secrets.

## Before the App Store

- Apple rejects apps that are "just a website in a wrapper". Adding the widget and notifications (above) helps show it is a real app.
- The same points apply as for the Play Store version before charging money:
  - **Data licence:** the free data sources (Screener.in, Yahoo Finance) generally don't allow paid use, so a paid app needs licensed data.
  - **SEBI:** its Research Analyst rules may cover paid stock views.
