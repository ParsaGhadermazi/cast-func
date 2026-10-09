import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { SessionContext } from "./app/SessionContext";
import "./app/app.css";
import { startSession } from "./store/session";

const root = createRoot(document.getElementById("root")!);

startSession()
  .then((session) => {
    // A debugging and test handle; the editor itself never reads it.
    (window as unknown as { __castSession: unknown }).__castSession = session;
    root.render(
      <StrictMode>
        <SessionContext.Provider value={session}>
          <App />
        </SessionContext.Provider>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    root.render(<pre className="boot-error">Could not start the editor: {String(error)}</pre>);
  });
