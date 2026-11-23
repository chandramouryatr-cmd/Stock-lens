"""Stock Lens on iPhone.

Same idea as the Android app (android/python/android_main.py + MainActivity.java):
1. Start the normal Stock Lens server inside the app, on 127.0.0.1 (reachable only from this phone).
2. Show its pages in a full-screen web view (Toga WebView = Apple's WKWebView).
3. Open news articles, filings and other outside links in Safari instead of inside the app.

Not in this first iPhone version (Android-only for now): the home-screen widget and price-target
notifications when the app is closed. Both need extra Apple code (WidgetKit, UserNotifications).
"""
import os

import toga
from toga.style import Pack

PORT = 8770


def start_server(data_dir, cache_dir):
    """Point Stock Lens at this app's own folders, then start its server in a background thread."""
    import slweb

    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)
    # Must be set before app.cache / app.server are imported: they read these once.
    os.environ["STOCK_LENS_STATIC"] = os.path.join(os.path.dirname(slweb.__file__), "static")
    os.environ["STOCK_LENS_CACHE"] = cache_dir
    os.environ["STOCK_LENS_DATA"] = data_dir

    from app import server  # the shared Stock Lens server (copied in by sync.py)
    return server.start_background(PORT)


class StockLens(toga.App):
    def startup(self):
        data_dir = str(self.paths.data)
        cache_dir = os.path.join(str(self.paths.cache), "stocklens")
        try:
            url = start_server(data_dir, cache_dir)
            content = toga.WebView(url=url + "/", style=Pack(flex=1))
            self.web = content
            self._open_outside_links_in_safari(content)
        except Exception as e:  # show the reason instead of a blank screen
            content = toga.Box(
                children=[toga.Label(f"Stock Lens could not start.\n\n{e}", style=Pack(margin=24))],
                style=Pack(direction="column", flex=1),
            )
        self.main_window = toga.MainWindow(title=self.formal_name)
        self.main_window.content = content
        self.main_window.show()

    def _open_outside_links_in_safari(self, webview):
        """News links open with target="_blank". WKWebView ignores those unless the app handles them,
        so hand them to Safari (the same as the Android app does with the phone's browser)."""
        try:
            from rubicon.objc import NSObject, ObjCClass, objc_method
        except ImportError:
            return

        UIApplication = ObjCClass("UIApplication")
        NSDictionary = ObjCClass("NSDictionary")

        class LinkDelegate(NSObject):
            # WKUIDelegate: webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:
            @objc_method
            def webView_createWebViewWithConfiguration_forNavigationAction_windowFeatures_(
                self, web_view, configuration, navigation_action, window_features
            ):
                url = navigation_action.request.URL
                if url is not None:
                    UIApplication.sharedApplication.openURL_options_completionHandler_(url, NSDictionary.dictionary, None)
                return None  # don't open a second web view inside the app

        native = getattr(getattr(webview, "_impl", None), "native", None)
        if native is None:
            return
        self._link_delegate = LinkDelegate.alloc().init()  # keep a reference, or it gets freed
        native.UIDelegate = self._link_delegate


def main():
    return StockLens("Stock Lens", "com.stocklens.stocklens")
