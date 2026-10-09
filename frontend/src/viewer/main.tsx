import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { decodeDeck } from "../model/normalize";
import { AssetSourceContext } from "../render/assets";
import "../render/render.css";
import { frozenAssetSource, type FrozenAssets } from "./frozenAssets";
import { Viewer } from "./Viewer";
import "./viewer.css";

const root = createRoot(document.getElementById("root")!);
try {
  const payload = JSON.parse(document.getElementById("cast-deck")!.textContent ?? "{}") as { deck: unknown; assets?: FrozenAssets };
  // Decoding migrates legacy text and sanitises every text block, so an
  // exported file is as safe to open as the editor.
  const { deck } = decodeDeck(payload.deck);
  root.render(
    <StrictMode>
      <AssetSourceContext.Provider value={frozenAssetSource(payload.assets ?? {})}>
        <Viewer deck={deck} />
      </AssetSourceContext.Provider>
    </StrictMode>,
  );
} catch (error) {
  root.render(<pre style={{ color: "#ff6b6b", padding: 24 }}>Could not open this presentation: {String(error)}</pre>);
}
