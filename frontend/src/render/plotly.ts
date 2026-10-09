/** Plotly is large (~4.5 MB), so it loads on first use as its own chunk. */

type PlotlyModule = typeof import("plotly.js-dist-min");

let loading: Promise<PlotlyModule> | null = null;

export function loadPlotly(): Promise<PlotlyModule> {
  loading ??= import("plotly.js-dist-min").then((module) => ((module as { default?: PlotlyModule }).default ?? module));
  return loading;
}
