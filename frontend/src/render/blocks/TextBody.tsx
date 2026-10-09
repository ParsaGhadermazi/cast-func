import { useLayoutEffect, useRef } from "react";

import type { Block } from "../../model/types";
import { isCodeText, richStyle, syncListMarkers, textBackground } from "../text";

/**
 * Slide-native rich text. `content` is sanitised whenever it enters the
 * document (load, paste, editing), so it is rendered as HTML here.
 */
export function TextBody({ block }: { block: Block }) {
  const rich = useRef<HTMLDivElement>(null);
  const { style } = block;
  useLayoutEffect(() => {
    if (rich.current) syncListMarkers(rich.current);
  });
  return (
    <div className={`body text${isCodeText(style) ? " code-text" : ""}`} style={{ background: textBackground(style) }}>
      <div
        ref={rich}
        className="rich"
        style={richStyle(style)}
        dangerouslySetInnerHTML={{ __html: block.content ?? "" }}
      />
    </div>
  );
}
