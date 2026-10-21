#!/usr/bin/env python3
"""Inline sources and the built-in GIFs into one standalone HTML file."""
import base64
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
ASSETS = ROOT / "assets"
OUT = ROOT / "dist" / "fireworks-studio.html"

def main():
    index = json.loads((ASSETS / "index.json").read_text())
    gifs = []
    for entry in index:
        data = (ASSETS / f"{entry['id']}.gif").read_bytes()
        gifs.append({
            "id": entry["id"],
            "name": entry["name"],
            "src": "data:image/gif;base64," + base64.b64encode(data).decode("ascii"),
        })
    builtins = "const BUILTIN_GIFS = " + json.dumps(gifs, separators=(",", ":")) + ";\n"
    parts = [(SRC / name).read_text() for name in ("codecs.js", "engine.js", "core.js", "ui.js")]
    js = "(() => {\n'use strict';\n" + builtins + "\n".join(parts) + "\nboot();\n})();\n"
    js = js.replace("</script", "<\\/script")
    html = (SRC / "index.html").read_text()
    css = (SRC / "styles.css").read_text()
    html = html.replace("/*__CSS__*/", css, 1).replace("/*__JS__*/", js, 1)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")

if __name__ == "__main__":
    main()
