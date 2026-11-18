"""Phone start-up: point Stock Lens at the app's own folders, then start the local server."""
import os


def start(files_dir, port=8770):
    import slweb

    cache = os.path.join(files_dir, "cache")
    os.makedirs(cache, exist_ok=True)
    # Must be set before app.cache / app.server are imported: they read these once.
    os.environ["STOCK_LENS_STATIC"] = os.path.join(os.path.dirname(slweb.__file__), "static")
    os.environ["STOCK_LENS_CACHE"] = cache
    os.environ["STOCK_LENS_DATA"] = files_dir

    from app import server
    return server.start_background(port)
