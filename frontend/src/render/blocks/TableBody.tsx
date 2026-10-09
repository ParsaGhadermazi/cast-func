import { clamp } from "../../model/geometry";
import type { Block } from "../../model/types";
import { useAssetSource, useAssetVersion, useLoaded } from "../assets";
import type { RenderMode } from "../SlideView";

export function tableRowLimit(block: Block): number {
  return clamp(Number(block.style.rowLimit) || 200, 1, 1000);
}

export function TableBody({ block, mode }: { block: Block; mode: RenderMode }) {
  const source = useAssetSource();
  const { style } = block;
  const version = useAssetVersion("table", block.table || null);
  const limit = tableRowLimit(block);
  const request = block.table && mode !== "thumb" ? `table:${block.table}:${limit}` : null;
  const state = useLoaded(request, String(version), () => source.loadTable(block.table!, limit));

  const frame = {
    background: style.bg || "#ffffff",
    borderColor: style.borderColor || "rgba(31,41,55,.16)",
    fontSize: `${style.fontSize || 12}px`,
  };
  const header = { background: style.headerBg || undefined, color: style.headerColor || undefined };

  if (mode === "thumb") {
    const title = (block.table && source.title("table", block.table)) || block.table || "Table";
    return (
      <div className="body table thumb-table" style={frame}>
        <div className="table-meta" style={header}><strong>{title}</strong></div>
        <div className="thumb-table-grid" />
      </div>
    );
  }
  if (!block.table) return <div className="body table" style={frame}><div className="err">No data assigned.</div></div>;
  if (state.status === "loading") return <div className="body table" style={frame}><div className="table-empty">Loading data…</div></div>;
  if (!state.result.ok) return <div className="body table" style={frame}><div className="err">{state.result.error}</div></div>;

  const data = state.result.value;
  const showIndex = style.showIndex !== false;
  const tableClass = `data-table${style.compact ? " compact" : ""}${style.striped === false ? " no-stripes" : ""}`;
  return (
    <div className="body table" style={frame}>
      <div className="table-meta" style={{ background: style.headerBg || undefined }}>
        <strong>{data.title || block.table}</strong>
        <span>{data.rows.length}{data.truncated ? "+" : ""} rows</span>
      </div>
      <div className="table-scroll">
        <table className={tableClass} style={{ fontSize: `${style.fontSize || 12}px` }}>
          <thead>
            <tr>
              {showIndex && <th className="row-index">#</th>}
              {data.columns.map((column) => (
                <th key={column.name} className={column.numeric ? "numeric" : undefined} title={`${column.name} (${column.dtype})`} style={header}>
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {showIndex && <td className="row-index">{rowIndex + 1}</td>}
                {row.map((value, index) => (
                  <td key={index} className={data.columns[index]?.numeric ? "numeric" : undefined} title={value}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
