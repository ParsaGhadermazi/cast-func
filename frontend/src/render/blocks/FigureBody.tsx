import { useEffect, useRef } from "react";

import type { Block } from "../../model/types";
import { useAssetSource, useAssetVersion, useLoaded, type FigureSpec } from "../assets";
import { loadPlotly } from "../plotly";
import type { RenderMode } from "../SlideView";

const BASE_LAYOUT = {
  autosize: true,
  margin: { l: 48, r: 18, t: 28, b: 40 },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
};

function slideLayout(spec: FigureSpec): Record<string, unknown> {
  const layout: Record<string, unknown> = { ...BASE_LAYOUT, ...spec.layout };
  // Notebook figures often carry fixed pixel sizes; the block owns the size.
  delete layout.width;
  delete layout.height;
  layout.autosize = true;
  return layout;
}

function PlotlyChart({ spec, interactive }: { spec: FigureSpec; interactive: boolean }) {
  const node = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = node.current;
    if (!target) return;
    let live = true;
    let observer: ResizeObserver | null = null;
    loadPlotly().then((Plotly) => {
      if (!live) return;
      void Plotly.react(target, spec.data as Plotly.Data[], slideLayout(spec) as Partial<Plotly.Layout>, {
        responsive: false,
        displaylogo: false,
        displayModeBar: interactive ? "hover" : false,
        staticPlot: !interactive,
      });
      observer = new ResizeObserver(() => Plotly.Plots.resize(target));
      observer.observe(target);
    });
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [spec, interactive]);

  useEffect(() => {
    const target = node.current;
    return () => {
      if (target) void loadPlotly().then((Plotly) => Plotly.purge(target));
    };
  }, []);

  return <div ref={node} className="plotly-host" />;
}

export function FigureBody({ block, mode }: { block: Block; mode: RenderMode }) {
  const source = useAssetSource();
  const figureVersion = useAssetVersion("figure", block.figure);
  const tableVersion = useAssetVersion("table", block.table || null);
  const request = block.figure && mode !== "thumb" ? `figure:${block.figure}:${block.table ?? ""}` : null;
  const state = useLoaded(request, `${figureVersion}:${tableVersion}`, () =>
    source.loadFigure(block.figure!, block.table || null),
  );

  if (mode === "thumb") return <FigurePlaceholder block={block} />;
  if (!block.figure) return <div className="body"><div className="err">No figure assigned.</div></div>;
  if (state.status === "loading") return <div className="body"><div className="loading">Rendering figure…</div></div>;
  if (!state.result.ok) return <div className="body"><div className="err">{state.result.error}</div></div>;
  return (
    <div className="body figure">
      <PlotlyChart spec={state.result.value} interactive={mode === "present"} />
    </div>
  );
}

function FigurePlaceholder({ block }: { block: Block }) {
  const source = useAssetSource();
  const title = (block.figure && source.title("figure", block.figure)) || block.figure || "Figure";
  return (
    <div className="body thumb-figure">
      <div className="thumb-chart">
        {[42, 68, 51, 86, 64, 92].map((height, index) => (
          <i key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <span className="thumb-label">{title}</span>
    </div>
  );
}
