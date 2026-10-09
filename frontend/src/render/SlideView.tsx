/**
 * The one slide renderer. The editor canvas, slide thumbnails, present mode
 * and (later) frozen exports all draw slides through this component, at the
 * logical slide size; callers scale it with CSS `zoom`.
 */

import { memo, type CSSProperties, type ReactNode } from "react";

import { SLIDE_HEIGHT, SLIDE_WIDTH, type Block, type Slide, type Theme } from "../model/types";
import { FigureBody } from "./blocks/FigureBody";
import { HtmlBody } from "./blocks/HtmlBody";
import { ImageBody } from "./blocks/ImageBody";
import { ShapeBody } from "./blocks/ShapeBody";
import { TableBody } from "./blocks/TableBody";
import { TextBody } from "./blocks/TextBody";

/**
 * - `edit`: the editor canvas. Embedded content is inert (no Plotly hover,
 *   no iframe clicks) so the selection layer owns the pointer.
 * - `present`: everything is interactive.
 * - `thumb`: heavy content (figures, tables, HTML) is drawn as a light placeholder.
 */
export type RenderMode = "edit" | "present" | "thumb";

export function blockFrameStyle(block: Block): CSSProperties {
  return {
    left: `${block.x * 100}%`,
    top: `${block.y * 100}%`,
    width: `${block.w * 100}%`,
    height: `${block.h * 100}%`,
    zIndex: block.z,
    transform: block.style.rotate ? `rotate(${block.style.rotate}deg)` : undefined,
    opacity: block.style.opacity ?? undefined,
  };
}

function BlockBody({ block, mode }: { block: Block; mode: RenderMode }) {
  switch (block.type) {
    case "text":
      return <TextBody block={block} />;
    case "image":
      return <ImageBody block={block} />;
    case "shape":
      return <ShapeBody style={block.style} />;
    case "figure":
      return <FigureBody block={block} mode={mode} />;
    case "table":
      return <TableBody block={block} mode={mode} />;
    case "html":
      return <HtmlBody block={block} mode={mode} />;
  }
}

export const BlockView = memo(function BlockView({ block, mode }: { block: Block; mode: RenderMode }) {
  return (
    <div className={`block ${block.type}`} data-bid={block.id} style={blockFrameStyle(block)}>
      <BlockBody block={block} mode={mode} />
    </div>
  );
});

export interface SlideViewProps {
  slide: Slide;
  theme: Theme;
  mode: RenderMode;
  /** Extra layers drawn above the blocks (selection chrome, guides). */
  children?: ReactNode;
  className?: string;
}

export function slideSurfaceStyle(slide: Slide, theme: Theme): CSSProperties {
  return {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    background: slide.background || theme.bg || "#ffffff",
    color: theme.fg || "#1a1d24",
    fontFamily: theme.font || undefined,
    ["--accent" as string]: theme.accent,
  };
}

export const SlideView = memo(function SlideView({ slide, theme, mode, children, className }: SlideViewProps) {
  return (
    <div className={`slide-surface mode-${mode}${className ? ` ${className}` : ""}`} style={slideSurfaceStyle(slide, theme)}>
      {slide.blocks.map((block) => (
        <BlockView key={block.id} block={block} mode={mode} />
      ))}
      {children}
    </div>
  );
});
