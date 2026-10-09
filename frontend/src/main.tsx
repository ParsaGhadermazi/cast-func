import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { SessionContext } from "./app/SessionContext";
import { Editor } from "./editor/Editor";
import "./editor/editor.css";
import { AssetSourceContext, liveAssetSource } from "./render/assets";
import "./render/render.css";
import { startSession } from "./store/session";

const root = createRoot(document.getElementById("root")!);

startSession()
  .then((session) => {
    // A debugging and test handle; the editor itself never reads it.
    (window as unknown as { __castSession: unknown }).__castSession = session;
    root.render(
      <StrictMode>
        <SessionContext.Provider value={session}>
          <AssetSourceContext.Provider value={liveAssetSource(session.assets)}>
            <Editor />
          </AssetSourceContext.Provider>
        </SessionContext.Provider>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    root.render(<pre className="boot-error">Could not start the editor: {String(error)}</pre>);
  });
