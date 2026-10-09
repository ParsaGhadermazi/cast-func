import { useSession, useDoc, useUi } from "../app/SessionContext";
import type { Slide } from "../model/types";
import { resolveSlideIndex } from "./uiStore";

/** The slide open in the editor, tracked by id. */
export function useCurrentSlide(): { slide: Slide | undefined; index: number; count: number } {
  const slides = useDoc((state) => state.doc.slides);
  const id = useUi((state) => state.currentSlideId);
  const hint = useUi((state) => state.currentIndexHint);
  const index = resolveSlideIndex(slides, id, hint);
  return { slide: index >= 0 ? slides[index] : undefined, index, count: slides.length };
}

/** Navigation helpers bound to the live document. */
export function useSlideNavigation() {
  const session = useSession();
  return {
    goTo(index: number) {
      session.ui.getState().goToSlide(session.doc.getState().doc.slides, index);
    },
    step(delta: number) {
      const { doc } = session.doc.getState();
      const { currentSlideId, currentIndexHint } = session.ui.getState();
      const index = resolveSlideIndex(doc.slides, currentSlideId, currentIndexHint);
      session.ui.getState().goToSlide(doc.slides, index + delta);
    },
  };
}

/** True when keyboard focus is in a field that should keep its own keys. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
