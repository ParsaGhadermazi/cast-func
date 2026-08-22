"""Runnable showcase. Run with: python examples/demo.py

Opens or creates ``demo.cast.json``, starts the live page, registers three data
tables, one figure *factory*, one HTML object, and one vector image,
then keeps the server alive. Open http://127.0.0.1:8000 and use the controls to
add the 'trend' figure to the inventory with 'monthly' data, then add it again
with 'daily' data — same factory, two instances. Try the (intentionally)
incompatible 'wide' table to see the inline error. Add the HTML object to try
a custom embedded widget.
"""

import os
import sys
import time

import plotly.express as px
import polars as pl

import cast

deck = cast.Cast(os.environ.get("CAST_FILE", "demo.cast.json"))


@deck.data
def monthly():
    return pl.DataFrame(
        {
            "date": ["2026-01", "2026-02", "2026-03", "2026-04"],
            "value": [120, 150, 90, 200],
        }
    )


@deck.data
def daily():
    return pl.DataFrame(
        {
            "date": ["2026-06-01", "2026-06-02", "2026-06-03"],
            "value": [12, 19, 7],
        }
    )


@deck.data(title="Wide (no date/value)")
def wide():
    return pl.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})


@deck.figure(title="Value over time")
def trend(tbl: pl.DataFrame):
    df = tbl.select(["date", "value"])
    return px.line(df, x="date", y="value", markers=True)


@deck.html(title="HTML callout")
def callout():
    return """
    <html>
      <body style="font-family: system-ui; margin: 0; padding: 24px; background: #f6f8ff;">
        <h2 style="margin-top: 0;">Custom HTML</h2>
        <p>This block came from <code>@deck.html</code>.</p>
        <button onclick="this.textContent = 'Still interactive'">Click me</button>
      </body>
    </html>
    """


@deck.image(title="Vector workflow", alt="A three-step cast workflow diagram")
def workflow_image():
    return """
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 360">
      <rect width="960" height="360" rx="28" fill="#f6f8ff"/>
      <g font-family="Inter, system-ui, sans-serif" text-anchor="middle">
        <g transform="translate(80 90)">
          <rect width="220" height="180" rx="18" fill="#ffffff" stroke="#cad5ff" stroke-width="3"/>
          <text x="110" y="82" font-size="30" font-weight="700" fill="#20242c">Notebook</text>
          <text x="110" y="124" font-size="20" fill="#667085">data + functions</text>
        </g>
        <path d="M325 180 H395" stroke="#5b8cff" stroke-width="8" stroke-linecap="round"/>
        <path d="M380 162 L405 180 L380 198" fill="none" stroke="#5b8cff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        <g transform="translate(410 90)">
          <rect width="220" height="180" rx="18" fill="#5b8cff"/>
          <text x="110" y="82" font-size="34" font-weight="700" fill="#ffffff">cast</text>
          <text x="110" y="124" font-size="20" fill="#e9eeff">compose slides</text>
        </g>
        <path d="M655 180 H725" stroke="#5b8cff" stroke-width="8" stroke-linecap="round"/>
        <path d="M710 162 L735 180 L710 198" fill="none" stroke="#5b8cff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        <g transform="translate(740 90)">
          <rect width="140" height="180" rx="18" fill="#ffffff" stroke="#cad5ff" stroke-width="3"/>
          <text x="70" y="82" font-size="28" font-weight="700" fill="#20242c">Present</text>
          <text x="70" y="124" font-size="20" fill="#667085">live or frozen</text>
        </g>
      </g>
    </svg>
    """


if __name__ == "__main__":
    port = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("CAST_PORT", "8000"))
    deck.serve(port=port)
    # All decorated assets register at definition time. Data functions resolve
    # lazily when a table or figure first uses them.
    print(f"Registered. Open http://127.0.0.1:{port}  (Ctrl-C to stop)")
    while True:
        time.sleep(1)
