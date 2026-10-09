/**
 * Pointer interaction on the canvas: one explicit gesture at a time.
 *
 *   idle ─ pointerdown on object ──▶ pressing ── moved > 3 px ──▶ move
 *        ─ pointerdown on handle ──▶ resize
 *        ─ pointerdown on rotate ──▶ rotate
 *        ─ pointerdown on empty  ──▶ pressing ── moved ──────────▶ marquee
 *        ─ shape tool, anywhere  ──▶ pressing ── moved ──────────▶ draw
 *                                             └─ click ─────────▶ default-size shape
 *        ─ pointerdown on vertex ──▶ vertex (drag a point of a line or outline)
 *        ─ pointerdown on "+"    ──▶ vertex (insert a point, then drag it)
 *
 * Gestures preview through `beginGesture/updateGesture` on the document
 * store and commit once on release (one undo step). Escape cancels.
 * Coordinates are converted to slide pixels using the canvas viewport's
 * screen rectangle and the zoom, so handles keep their screen size.
 */

import { SLIDE_HEIGHT, SLIDE_WIDTH, type CropBox, type ShapeKind, type ShapePoint } from "../model/types";
import { normalizedCrop } from "../render/crop";
import { editableShapePoints, isLineShape } from "../render/shapes";
import type { Session } from "../store/session";
import { resolveSlideIndex } from "./uiStore";
import {
  allBlockIds,
  defaultShapeSize,
  textPayload,
  insertBlocks,
  nextIds,
  setBoxes,
  shapePayload,
  slideById,
  stackOrder,
  toPayload,
} from "./operations";
import { insertVertex, lineBetween, moveVertex, pointsToSlide, snapToAngle } from "./shapeEdit";
import {
  applyBox,
  boundsOf,
  boxOf,
  centerOf,
  clampTranslation,
  guidesFor,
  handleSides,
  MIN_H,
  MIN_W,
  rotate,
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
  | { kind: "vertex"; index: number }
  | { kind: "insert"; index: number }
  | { kind: "crop"; handle: Handle }
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
  /** Set when the shape or text tool is active: dragging draws this. */
  draw: ShapeKind | "text" | null;
}

interface VertexDrag {
  kind: "vertex";
  id: string;
  index: number;
  box: Box;
  points: ShapePoint[];
  /** Where the vertex started on the slide (for Shift axis lock). */
  origin: Point;
  startScreen: Point;
  moved: boolean;
  label: string;
  targets: SnapTargets;
}

type Active =
  | Pressing
  | { kind: "move"; start: Point; boxes: Map<string, Box>; frame: Box; targets: SnapTargets; duplicateOf: string[] | null }
  | { kind: "resize"; start: Point; handle: Handle; boxes: Map<string, Box>; frame: Box; targets: SnapTargets }
  | { kind: "rotate"; start: Point; boxes: Map<string, Box>; frame: Box; pivot: Point }
  | { kind: "marquee"; start: Point; base: string[] }
  | { kind: "draw"; start: Point; shape: ShapeKind | "text"; id: string; targets: SnapTargets }
  | { kind: "crop"; id: string; handle: Handle; start: Point; box: Box; crop: CropBox }
  | VertexDrag;

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

  /** Snap a point's x and y independently to the nearest targets. */
  private snapPoint(point: Point, targets: SnapTargets): Point {
    const threshold = SNAP_DISTANCE / this.zoom();
    const pick = (value: number, candidates: number[]) => {
      let best = value;
      let distance = threshold;
      for (const candidate of candidates) {
        if (Math.abs(candidate - value) <= distance) {
          distance = Math.abs(candidate - value);
          best = candidate;
        }
      }
      return best;
    };
    return { x: pick(point.x, targets.xs), y: pick(point.y, targets.ys) };
  }

  /** The shape whose points are on screen: the one in point editing, or a selected line. */
  private outlineBlock() {
    const ui = this.session.ui.getState();
    const id = ui.editing?.kind === "points" ? ui.editing.id : ui.selection.length === 1 ? ui.selection[0] : null;
    const block = this.slide()?.blocks.find((candidate) => candidate.id === id);
    if (!block || block.type !== "shape") return null;
    if (ui.editing?.kind !== "points" && !isLineShape(block.style.shape)) return null;
    return block;
  }

  /** Blocks under a screen point, topmost first, using the hit layer. */
  private stackAt(event: { clientX: number; clientY: number }): string[] {
    const ids = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>("[data-hit]")?.dataset.hit)
      .filter((id): id is string => !!id);
    return [...new Set(ids)];
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

    if (target.kind === "crop") {
      const editing = ui.editing;
      const block = editing?.kind === "crop" ? slide.blocks.find((candidate) => candidate.id === editing.id) : undefined;
      if (!block) return;
      this.active = { kind: "crop", id: block.id, handle: target.handle, start, box: boxOf(block), crop: normalizedCrop(block.style) };
      this.beginGesture("resize");
      return;
    }

    if (target.kind === "vertex" || target.kind === "insert") {
      const block = this.outlineBlock();
      if (!block) return;
      const box = boxOf(block);
      let points = editableShapePoints(block.style);
      let index = target.index;
      if (target.kind === "insert") {
        points = insertVertex(points, index);
        index += 1;
      }
      const origin = pointsToSlide(box, points)[index]!;
      this.active = {
        kind: "vertex", id: block.id, index, box, points, origin,
        startScreen: { x: event.clientX, y: event.clientY }, moved: false,
        label: target.kind === "insert" ? "Add point" : "Move point",
        targets: this.targetsExcluding([block.id]),
      };
      if (target.kind === "insert") {
        // The new point exists from the first press; dragging then moves it.
        this.beginGesture("resize");
        const inserted = points;
        const slideId = slide.id;
        this.session.doc.getState().updateGesture((draft) => {
          const draftBlock = slideById(draft, slideId)?.blocks.find((candidate) => candidate.id === block.id);
          if (draftBlock) draftBlock.style.points = inserted;
        });
      }
      ui.selectPoint(index);
      return;
    }

    if (ui.tool.kind !== "select" && target.kind !== "handle" && target.kind !== "rotate") {
      const targets = this.targetsExcluding([]);
      this.active = {
        kind: "pressing",
        start: ui.snap ? this.snapPoint(start, targets) : start,
        startScreen: { x: event.clientX, y: event.clientY },
        target,
        onClick: null,
        alt: event.altKey,
        shift: event.shiftKey,
        draw: ui.tool.kind === "shape" ? ui.tool.shape : "text",
      };
      return;
    }

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
      draw: null,
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
      if (active.draw) this.startDraw(active, active.draw);
      else if (active.target.kind === "block") this.startMove(active);
      else this.startMarquee(active);
      this.pointerMove(event);
      return;
    }

    const doc = this.session.doc.getState();
    const slideId = this.slide()?.id;
    if (!slideId) return;

    if (active.kind === "crop") {
      // Crop like a mask: the dragged edge follows the pointer and the picture
      // stays where it is, so the box shrinks (or grows back) with the crop.
      const box = active.box;
      const center = centerOf(box);
      const local = rotate(point, -box.rotation, center);
      const startLocal = rotate(active.start, -box.rotation, center);
      const [hx, hy] = handleSides(active.handle);
      const c = active.crop;
      const perX = (1 - c.left - c.right) / box.w; // crop fraction per slide pixel
      const perY = (1 - c.top - c.bottom) / box.h;
      let w = box.w + hx * (local.x - startLocal.x);
      let h = box.h + hy * (local.y - startLocal.y);
      // Never uncrop past the image edge, never collapse the box.
      const maxW = box.w + (hx > 0 ? c.right : c.left) / perX;
      const maxH = box.h + (hy > 0 ? c.bottom : c.top) / perY;
      w = hx ? Math.max(MIN_W, Math.min(w, maxW)) : box.w;
      h = hy ? Math.max(MIN_H, Math.min(h, maxH)) : box.h;
      const next = { ...c };
      if (hx > 0) next.right = c.right - (w - box.w) * perX;
      if (hx < 0) next.left = c.left - (w - box.w) * perX;
      if (hy > 0) next.bottom = c.bottom - (h - box.h) * perY;
      if (hy < 0) next.top = c.top - (h - box.h) * perY;
      const clean = normalizedCrop({ crop: { left: Math.max(0, next.left), top: Math.max(0, next.top), right: Math.max(0, next.right), bottom: Math.max(0, next.bottom) } });
      // Keep the opposite edges fixed on screen.
      const cx = hx ? -hx * (box.w / 2) + hx * (w / 2) : 0;
      const cy = hy ? -hy * (box.h / 2) + hy * (h / 2) : 0;
      const world = rotate({ x: center.x + cx, y: center.y + cy }, box.rotation, center);
      const nextBox = { x: world.x - w / 2, y: world.y - h / 2, w, h, rotation: box.rotation };
      const id = active.id;
      doc.updateGesture((draft) => {
        const block = slideById(draft, slideId)?.blocks.find((candidate) => candidate.id === id);
        if (!block) return;
        applyBox(block, nextBox);
        block.style.crop = clean;
      });
      return;
    }

    if (active.kind === "vertex") {
      if (!active.moved) {
        if (Math.hypot(event.clientX - active.startScreen.x, event.clientY - active.startScreen.y) < DRAG_THRESHOLD) return;
        active.moved = true;
        if (!this.session.doc.getState().gestureActive) this.beginGesture("resize");
      }
      let to = point;
      const snapping = this.snapping(event);
      if (event.shiftKey) {
        const slidePoints = pointsToSlide(active.box, active.points);
        if (slidePoints.length === 2) to = snapToAngle(slidePoints[1 - active.index]!, point);
        else if (Math.abs(point.x - active.origin.x) >= Math.abs(point.y - active.origin.y)) to = { x: point.x, y: active.origin.y };
        else to = { x: active.origin.x, y: point.y };
      } else if (snapping) {
        to = this.snapPoint(point, active.targets);
      }
      const result = moveVertex(active.box, active.points, active.index, to);
      const id = active.id;
      doc.updateGesture((draft) => {
        const block = slideById(draft, slideId)?.blocks.find((candidate) => candidate.id === id);
        if (!block) return;
        applyBox(block, result.box);
        block.style.points = result.points;
      });
      this.session.ui.setState({
        guides: snapping && !event.shiftKey ? { xs: active.targets.xs.filter((x) => Math.abs(x - to.x) < 0.5), ys: active.targets.ys.filter((y) => Math.abs(y - to.y) < 0.5) } : null,
      });
      return;
    }

    if (active.kind === "draw") {
      const snapping = this.snapping(event);
      let end = snapping ? this.snapPoint(point, active.targets) : point;
      const accent = this.session.doc.getState().doc.theme.accent;
      let payload;
      if (active.shape === "text") {
        payload = textPayload(normalized({ ...rectFromPoints(active.start, end), rotation: 0 }));
      } else if (isLineShape(active.shape)) {
        if (event.shiftKey) end = snapToAngle(active.start, end);
        const { box, points } = lineBetween(active.start, end);
        payload = shapePayload(active.shape, accent, normalized(box), points);
      } else {
        let dx = end.x - active.start.x;
        let dy = end.y - active.start.y;
        if (event.shiftKey) {
          // Square / circle: the larger side wins, keeping the drag direction.
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          dx = Math.sign(dx || 1) * side;
          dy = Math.sign(dy || 1) * side;
        }
        const rect = event.altKey
          ? { x: active.start.x - Math.abs(dx), y: active.start.y - Math.abs(dy), w: 2 * Math.abs(dx), h: 2 * Math.abs(dy) }
          : rectFromPoints(active.start, { x: active.start.x + dx, y: active.start.y + dy });
        payload = shapePayload(active.shape, accent, normalized({ ...rect, rotation: 0 }));
      }
      doc.updateGesture((draft) => {
        insertBlocks(draft, slideId, [payload], 0);
      });
      this.session.ui.setState({
        guides: snapping ? { xs: active.targets.xs.filter((x) => Math.abs(x - end.x) < 0.5), ys: active.targets.ys.filter((y) => Math.abs(y - end.y) < 0.5) } : null,
      });
      return;
    }

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

  private startDraw(pressing: Pressing, shape: ShapeKind | "text"): void {
    const id = nextIds(allBlockIds(this.session.doc.getState().doc), "b", 1)[0]!;
    this.active = { kind: "draw", start: pressing.start, shape, id, targets: this.targetsExcluding([]) };
    this.beginGesture("resize");
  }

  /** A click with the shape tool drops a default-size shape centred on the click. */
  private placeShape(at: Point, shape: ShapeKind): void {
    const slide = this.slide();
    if (!slide) return;
    const size = defaultShapeSize(shape);
    const rect = {
      x: Math.min(Math.max(at.x / SLIDE_WIDTH - size.w / 2, 0), 1 - size.w),
      y: Math.min(Math.max(at.y / SLIDE_HEIGHT - size.h / 2, 0), 1 - size.h),
      ...size,
    };
    const payload = shapePayload(shape, this.session.doc.getState().doc.theme.accent, rect);
    let created: string[] = [];
    this.session.doc.getState().transact("Add shape", (draft) => {
      created = insertBlocks(draft, slide.id, [payload], 0);
    });
    this.finishCreate(created[0]);
  }

  /** A click with the text tool places a text box there and starts typing. */
  private placeText(at: Point): void {
    const slide = this.slide();
    if (!slide) return;
    const w = 0.33;
    const h = 0.12;
    // The click marks where the first line starts (inside the box padding).
    const rect = {
      x: Math.min(Math.max((at.x - 14) / SLIDE_WIDTH, 0), 1 - w),
      y: Math.min(Math.max((at.y - 22) / SLIDE_HEIGHT, 0), 1 - h),
      w,
      h,
    };
    let created: string[] = [];
    this.session.doc.getState().transact("Add text", (draft) => {
      created = insertBlocks(draft, slide.id, [textPayload(rect)], 0);
    });
    if (created[0]) this.session.ui.getState().startEditing({ kind: "text", id: created[0] });
  }

  private finishCreate(id: string | undefined): void {
    const ui = this.session.ui.getState();
    ui.setTool({ kind: "select" });
    if (id) ui.select([id]);
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
    if (active.kind === "pressing" && active.draw === "text") this.placeText(active.start);
    else if (active.kind === "pressing" && active.draw && active.draw !== "text") this.placeShape(active.start, active.draw);
    else if (active.kind === "pressing") active.onClick?.();
    else if (active.kind === "draw" && active.shape === "text") {
      this.session.doc.getState().commitGesture("Add text");
      this.session.ui.getState().startEditing({ kind: "text", id: active.id });
    } else if (active.kind === "draw") {
      this.session.doc.getState().commitGesture("Add shape");
      this.finishCreate(active.id);
    } else if (active.kind === "vertex") {
      if (this.session.doc.getState().gestureActive) this.session.doc.getState().commitGesture(active.label);
    } else if (active.kind === "crop") {
      this.session.doc.getState().commitGesture("Crop image");
    } else if (active.kind === "move" && active.duplicateOf) this.session.doc.getState().commitGesture("Duplicate");
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
    if (active.kind === "move" || active.kind === "resize" || active.kind === "rotate" || active.kind === "draw" || active.kind === "vertex" || active.kind === "crop") {
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

const normalized = (box: Box) => ({
  x: box.x / SLIDE_WIDTH,
  y: box.y / SLIDE_HEIGHT,
  w: box.w / SLIDE_WIDTH,
  h: box.h / SLIDE_HEIGHT,
});
