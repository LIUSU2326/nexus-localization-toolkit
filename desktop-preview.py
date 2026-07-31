"""Standalone desktop test window for TransMate.

This starts a loopback-only web server and loads the existing application in
the Windows WebView2 control.  It is intentionally separate from Tauri so the
latest front-end changes can be tested on machines without system Node.js.
"""

from __future__ import annotations

import argparse
import logging
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen


PROJECT_ROOT = Path(__file__).resolve().parent
LOG_DIR = PROJECT_ROOT / "run-logs"
LOG_FILE = LOG_DIR / "desktop-preview.log"


def configure_logging() -> None:
    LOG_DIR.mkdir(exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(LOG_FILE, encoding="utf-8")],
    )


class ProjectRequestHandler(SimpleHTTPRequestHandler):
    """Serve only this project directory and keep request noise out of stdout."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        logging.info("HTTP %s", format % args)


def start_server() -> tuple[ThreadingHTTPServer, str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), ProjectRequestHandler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, name="transmate-preview-server", daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/index.html"
    logging.info("Desktop preview server started at %s", url)
    return server, url


def run_check() -> int:
    """Verify the local host without opening a window (used by the launcher test)."""
    server, url = start_server()
    try:
        with urlopen(url, timeout=5) as response:
            page = response.read().decode("utf-8", errors="replace")
        required_scripts = ("discount-guard.js", "language-carryover-guard.js")
        if response.status != 200 or any(script_name not in page for script_name in required_scripts):
            raise RuntimeError("应用页面未包含最新版本地质检脚本")
        print("桌面测试启动器检查通过。")
        return 0
    finally:
        server.shutdown()
        server.server_close()


def run_window() -> int:
    try:
        import webview
    except Exception:
        logging.exception("Unable to import the desktop WebView runtime")
        return 1

    server, url = start_server()
    try:
        webview.create_window(
            "TransMate · AI 游戏本地化助手 · 桌面测试",
            url,
            width=1360,
            height=900,
            min_size=(1080, 720),
            background_color="#f6f2eb",
        )
        webview.start(gui="edgechromium", debug=False, private_mode=True)
        return 0
    except Exception:
        logging.exception("Desktop preview window failed to start")
        return 1
    finally:
        server.shutdown()
        server.server_close()
        logging.info("Desktop preview server stopped")


def main() -> int:
    configure_logging()
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--check", action="store_true")
    args, _ = parser.parse_known_args()
    return run_check() if args.check else run_window()


if __name__ == "__main__":
    sys.exit(main())
