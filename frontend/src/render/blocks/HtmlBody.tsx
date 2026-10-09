import type { Block } from "../../model/types";
import { useAssetSource, useAssetTitle, useAssetVersion, useHtmlReload, useLoaded } from "../assets";
import type { RenderMode } from "../SlideView";

/** Custom notebook HTML in a sandboxed iframe (no same-origin access). */
export function HtmlBody({ block, mode }: { block: Block; mode: RenderMode }) {
  const reloadKey = useHtmlReload(block.id);
  const source = useAssetSource();
  const version = useAssetVersion("html", block.html);
  const title = useAssetTitle("html", block.html);
  const request = block.html && mode !== "thumb" ? `html:${block.html}` : null;
  const state = useLoaded(request, `${version}:${reloadKey}`, () => source.loadHtml(block.html!));

  if (mode === "thumb") return <div className="body thumb-html"><span>HTML</span><i /></div>;
  if (!block.html) return <div className="body"><div className="err">No HTML object assigned.</div></div>;
  if (state.status === "loading") return <div className="body"><div className="loading">Loading…</div></div>;
  if (!state.result.ok) return <div className="body"><div className="err">{state.result.error}</div></div>;
  return (
    <div className="body html">
      <iframe
        // A new key per load restarts the iframe, which is what "Reload" means.
        key={`${version}:${reloadKey}`}
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        title={title || block.html}
        srcDoc={state.result.value}
      />
    </div>
  );
}
