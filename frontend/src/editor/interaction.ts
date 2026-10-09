/**
 * Pointer interaction on the canvas: one explicit gesture at a time.
 *
 *   idle ─ pointerdown on object ──▶ pressing ── moved > 3 px ──▶ move
 *        ─ pointerdown on handle ──▶ resize
 *        ─ pointerdown on rotate ──▶ rotate
 *        ─ pointerdown on empty  ──▶ pressing ── moved ──────────▶ marquee
 *
 * Gestures preview through `beginGesture/updateGesture` on the document
 * store and commit once on release (one undo step). Escape cancels.
 * Coordinates are converted to slide pixels using the canvas viewport's
 * screen rectangle and the zoom, so handles keep their screen size.
 */

import type { Session } from "../store/session";
import { resolveSlideIndex } from "./uiStore";
import { allBlockIds, insertBlocks, nextIds, setBoxes, slideById, stackOrder, toPayload } from "./operations";
import {
  boundsOf,
  boxOf,
  centerOf,
  clampTranslation,
  guidesFor,
  rectFromPoints,
  rectsIntersect,
  resizeBox,
  rotateBoxes,
  rotationDelta,
  scaleBoxesInto,
  selectionFrame,
  snapAngle,
  snapMove,
  snapResize,
  snapTargetsFor,
  translateBox,
  type Box,
  type Handle,
  type Point,
  type SnapTargets,
} from "./transform";

export type PointerTarget =
  | { kind: "block"; id: string }
  | { kind: "handle"; handle: Handle }
  | { kind: "rotate" }
  | { kind: "background" };

const DRAG_THRESHOLD = 3; // screen pixels
const SNAP_DISTANCE = 6; // screen pixels

interface Pressing {
  kind: "pressing";
  start: Point;
  startScreen: Point;
  target: PointerTarget;
  /** What a click without movement does on release. */
  onClick: (() => void) | null;
  alt: boolean;
  shift: boolean;
}

type Active =
  | Pressing
  | { kind: "move"; start: Point; boxes: Map<string, Box>; frame: Box; targets: SnapTargets; duplicateOf: string[] | null }
  | { kind: "resize"; start: Point; handle: Handle; boxes: Map<string, Box>; frame: Box; targets: SnapTargets }
  | { kind: "rotate"; start: Point; boxes: Map<string, Box>; frame: Box; pivot: Point }
  | { kind: "marquee"; start: Point; base: string[] };

export class CanvasInteraction {
  private active: Active | null = null;
  private pointerId: number | null = null;

  constructor(
    private readonly session: Session,
    private readonly viewport: () => HTMLElement | null,
  ) {}

  get busy(): boolean {
    return this.active !== null;
  }

  // ---------------------------------------------------------------- helpers

  private zoom(): number {
    return this.session.ui.getState().zoom;
  }

  private toSlide(event: { clientX: number; clientY: number }): Point {
    const rect = this.viewport()?.getBoundingClientRect();
    const zoom = this.zoom();
    if (!rect) return { x: 0, y: 0 };
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  }

  private slide() {
    const { doc } = this.session.doc.getState();
    const { currentSlideId, currentIndexHint } = this.session.ui.getState();
    return doc.slides[resolveSlideIndex(doc.slides, currentSlideId, currentIndexHint)];
  }

  private selectedBoxes(ids = this.session.ui.getState().selection): Map<string, Box> {
    const boxes = new Map<string, Box>();
    for (const block of this.slide()?.blocks ?? []) if (ids.includes(block.id)) boxes.set(block.id, boxOf(block));
    return boxes;
  }

  private targetsExcluding(ids: string[]): SnapTargets {
    const others = (this.slide()?.blocks ?? []).filter((block) => !ids.includes(block.id)).map((block) => boundsOf(boxOf(block)));
    return snapTargetsFor(others);
  }

  private snapping(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
    return this.session.ui.getState().snap && !(event.metaKey || event.ctrlKey);
  }

  /** Blocks under a screen point, topmost first, using the hit layer. */
  private stackAt(event: { clientX: number; clientY: number }): string[] {
    return document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => (element as HTMLElement).dataset?.hit)
      .filter((id): id is string => !!id);
  }

  // ----------------------------------------------------------- pointer down

  pointerDown(event: PointerEvent, target: PointerTarget): void {
    if (event.button !== 0 || this.active) return;
    const slide = this.slide();
    if (!slide) return;
    const ui = this.session.ui.getState();
    const start = this.toSlide(event);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    this.pointerId = event.pointerId;

    if (target.kind === "handle" || target.kind === "rotate") {
      const boxes = this.selectedBoxes();
      const frame = selectionFrame([...boxes.values()]);
      if (!frame) return;
      if (target.kind === "handle") {
        this.active = { kind: "resize", start, handle: target.handle, boxes, frame, targets: this.targetsExcluding([...boxes.keys()]) };
      } else {
        this.active = { kind: "rotate", start, boxes, frame, pivot: centerOf(frame) };
      }
      this.beginGesture(target.kind === "handle" ? "resize" : "rotate");
      return;
    }

    let onClick: (() => void) | null = null;
    if (target.kind === "block") {
      const selected = ui.selection.includes(target.id);
      if (event.altKey && !additive) {
        // Alt+click cycles through the objects stacked under the pointer
        // (topmost first); Alt+drag duplicates (decided once the pointer
        // moves). Selection waits for release so the cycle has a fixed start.
        const stack = this.stackAt(event);
        onClick = () => {
          const current = stack.indexOf(this.session.ui.getState().primary ?? "");
          const next = current >= 0 ? stack[(current + 1) % stack.length]! : stack[0] ?? target.id;
          this.session.ui.getState().select([next]);
        };
      } else if (additive) {
        if (selected) onClick = () => this.session.ui.getState().toggleSelected(target.id);
        else ui.select([...ui.selection, target.id], target.id);
      } else if (selected) {
        // Keep the group so it can be dragged; a plain click narrows to this object.
        ui.select(ui.selection, target.id);
        onClick = () => this.session.ui.getState().select([target.id]);
      } else {
        ui.select([target.id]);
      }
    } else if (!additive) {
      ui.clearSelection();
    }

    this.active = {
      kind: "pressing",
      start,
      startScreen: { x: event.clientX, y: event.clientY },
      target,
      onClick,
      alt: event.altKey,
      shift: additive,
    };
  }

  // ----------------------------------------------------------- pointer move

  pointerMove(event: PointerEvent): void {
    const active = this.active;
    if (!active || (this.pointerId !== null && event.pointerId !== this.pointerId)) return;
    const point = this.toSlide(event);

    if (active.kind === "pressing") {
      const moved = Math.hypot(event.clientX - active.startScreen.x, event.clientY - active.startScreen.y);
      if (moved < DRAG_THRESHOLD) return;
      if (active.target.kind === "block") this.startMove(active);
      else this.startMarquee(active);
      this.pointerMove(event);
      return;
    }

    const doc = this.session.doc.getState();
    const slideId = this.slide()?.id;
    if (!slideId) return;

    if (active.kind === "move") {
      let dx = point.x - active.start.x;
      let dy = point.y - active.start.y;
      if (event.shiftKey) {
        // Shift locks the move to the dominant axis.
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const bounds = boundsOf(active.frame);
      const snapping = this.snapping(event);
      if (snapping) ({ x: dx, y: dy } = snapMove(bounds, dx, dy, active.targets, SNAP_DISTANCE / this.zoom()));
      ({ x: dx, y: dy } = clampTranslation([...active.boxes.values()], dx, dy));
      const moved = new Map([...active.boxes].map(([id, box]) => [id, translateBox(box, dx, dy)]));
      const duplicateOf = active.duplicateOf;
      doc.updateGesture((draft) => {
        if (duplicateOf) {
          const source = slideById(draft, slideId);
          const blocks = duplicateOf.map((id) => source!.blocks.find((block) => block.id === id)!);
          insertBlocks(draft, slideId, blocks.map(toPayload), 0);
        }
        setBoxes(draft, slideId, moved);
      });
      this.session.ui.setState({
        guides: snapping ? guidesFor({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }, active.targets) : null,
      });
      return;
    }

    if (active.kind === "resize") {
      const starts = [...active.boxes.values()];
      const single = starts.length === 1;
      const oblique = starts.some((box) => box.rotation % 90 !== 0);
      const keepAspect = event.shiftKey || (!single && oblique);
      let next = resizeBox(active.frame, active.handle, point, {
        keepAspect,
        fromCenter: event.altKey,
        ...(single ? {} : { minW: 1, minH: 1 }),
      });
      const snapping = this.snapping(event) && !keepAspect && !event.altKey;
      if (snapping) next = snapResize(next, active.handle, active.targets, SNAP_DISTANCE / this.zoom());
      const boxes = single
        ? new Map([[[...active.boxes.keys()][0]!, next]])
        : new Map(scaleBoxesInto(starts, active.frame, next).map((box, i) => [[...active.boxes.keys()][i]!, box]));
      doc.updateGesture((draft) => setBoxes(draft, slideId, boxes));
      this.session.ui.setState({ guides: snapping ? guidesFor(boundsOf(next), active.targets) : null });
      return;
    }

    if (active.kind === "rotate") {
      let delta = rotationDelta(active.pivot, active.start, point);
      const starts = [...active.boxes.values()];
      if (starts.length === 1) {
        const base = starts[0]!.rotation;
        if (event.shiftKey) delta = snapAngle(base + delta) - base;
      } else if (event.shiftKey) {
        delta = snapAngle(delta);
      }
      const rotated = rotateBoxes(starts, active.pivot, delta);
      const boxes = new Map(rotated.map((box, i) => [[...active.boxes.keys()][i]!, box]));
      doc.updateGesture((draft) => setBoxes(draft, slideId, boxes));
      if (starts.length > 1) {
        this.session.ui.setState({ gestureFrame: { ...active.frame, rotation: active.frame.rotation + delta } });
      }
      return;
    }

    if (active.kind === "marquee") {
      const rect = rectFromPoints(active.start, point);
      const hits = (this.slide()?.blocks ?? []).filter((block) => rectsIntersect(boundsOf(boxOf(block)), rect)).map((block) => block.id);
      const order = stackOrder(this.slide()!);
      const selection = [...new Set([...active.base, ...hits])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      this.session.ui.getState().select(selection);
      this.session.ui.setState({ marquee: rect });
    }
  }

  private beginGesture(kind: "move" | "resize" | "rotate" | "marquee"): void {
    if (kind !== "marquee") this.session.doc.getState().beginGesture();
    this.session.ui.setState({ activeGesture: kind });
  }

  private startMove(pressing: Pressing): void {
    const ui = this.session.ui.getState();
    const slide = this.slide()!;
    let ids = ui.selection;
    let duplicateOf: string[] | null = null;
    if (pressing.alt && !pressing.shift && pressing.target.kind === "block" && !ids.includes(pressing.target.id)) {
      ids = [pressing.target.id];
      ui.select(ids);
    }
    if (pressing.alt && !pressing.shift) {
      // Alt+drag: move copies and leave the originals in place.
      duplicateOf = stackOrder(slide).filter((id) => ids.includes(id));
      // The ids `insertBlocks` will assign inside the gesture recipe.
      ids = nextIds(allBlockIds(this.session.doc.getState().doc), "b", duplicateOf.length);
    }
    const boxes = duplicateOf
      ? new Map(duplicateOf.map((id, i) => [ids[i]!, boxOf(slide.blocks.find((block) => block.id === id)!)]))
      : this.selectedBoxes(ids);
    const frame = selectionFrame([...boxes.values()]);
    if (!frame) return;
    this.active = {
      kind: "move",
      start: pressing.start,
      boxes,
      frame,
      targets: this.targetsExcluding(duplicateOf ?? ids),
      duplicateOf,
    };
    this.beginGesture("move");
    if (duplicateOf) this.session.ui.getState().select(ids);
  }

  private startMarquee(pressing: Pressing): void {
    this.active = { kind: "marquee", start: pressing.start, base: pressing.shift ? this.session.ui.getState().selection : [] };
    this.session.ui.setState({ activeGesture: "marquee" });
  }

  // ------------------------------------------------------------- pointer up

  pointerUp(event: PointerEvent): void {
    const active = this.active;
    if (!active || (this.pointerId !== null && event.pointerId !== this.pointerId)) return;
    this.active = null;
    this.pointerId = null;
    const labels = { move: "Move", resize: "Resize", rotate: "Rotate" } as const;
    if (active.kind === "pressing") active.onClick?.();
    else if (active.kind === "move" && active.duplicateOf) this.session.doc.getState().commitGesture("Duplicate");
    else if (active.kind === "move" || active.kind === "resize" || active.kind === "rotate") {
      this.session.doc.getState().commitGesture(labels[active.kind]);
    }
    this.clearOverlay();
  }

  /** Escape: abandon the gesture and restore the document. */
  cancel(): boolean {
    const active = this.active;
    if (!active) return false;
    this.active = null;
    this.pointerId = null;
    if (active.kind === "move" || active.kind === "resize" || active.kind === "rotate") {
      this.session.doc.getState().cancelGesture();
      if (active.kind === "move" && active.duplicateOf) this.session.ui.getState().select(active.duplicateOf);
    }
    if (active.kind === "marquee") this.session.ui.getState().select(active.base);
    this.clearOverlay();
    return true;
  }

  private clearOverlay(): void {
    this.session.ui.setState({ guides: null, marquee: null, gestureFrame: null, activeGesture: null });
  }
}
