#!/usr/bin/env python3
"""Siteyi başlatır ve preview.html'i güncel tutar.

    python3 run.py              siteyi aç (http://localhost:5173) + preview.html'i her kayıtta yenile
    python3 run.py --no-open    tarayıcıyı otomatik açma
    python3 run.py --once       sadece preview.html'i bir kere üret ve çık

Gerekenler: Node.js 18.11+  (https://nodejs.org)
content/ veya src/ içindeki herhangi bir dosyayı kaydettiğinde hem site hem preview.html yenilenir.
"""
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = "http://localhost:5173"


def run(cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, **kw)


def main():
    args = set(sys.argv[1:])
    node, npm = shutil.which("node"), shutil.which("npm")
    if not node or not npm:
        sys.exit("Node.js bulunamadı. https://nodejs.org adresinden kurup tekrar dene.")

    if not (ROOT / "node_modules" / "katex").exists():
        print("→ Paketler kuruluyor (npm install)…")
        if run([npm, "install"]).returncode != 0:
            sys.exit("npm install başarısız oldu.")

    if "--once" in args:
        sys.exit(run([node, "scripts/preview.js"]).returncode)

    if "--no-open" not in args:
        def open_when_ready():
            for _ in range(60):
                try:
                    urllib.request.urlopen(URL, timeout=1)
                    webbrowser.open(URL)
                    return
                except Exception:
                    time.sleep(0.5)
        threading.Thread(target=open_when_ready, daemon=True).start()

    print(f"→ Site: {URL}   |   preview.html her kayıtta otomatik güncellenir   |   Durdurmak için Ctrl+C\n")
    try:
        sys.exit(run([node, "scripts/dev.js"]).returncode)
    except KeyboardInterrupt:
        print("\nDurduruldu.")


if __name__ == "__main__":
    main()
