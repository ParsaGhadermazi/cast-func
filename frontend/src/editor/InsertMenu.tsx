import { ChartNoAxesCombined, Code, Image as ImageIcon, Plus, Table2, Upload } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { useAssets, useSession } from "../app/SessionContext";
import { api } from "../api/client";
import { Popover } from "../ui/Popover";
import { useCurrentSlide } from "./hooks";
import { figurePayload, htmlPayload, imagePayload, insertImageFiles, insertPayloads, tablePayload } from "./insert";

function Section({ icon, title, empty, children }: { icon: ReactNode; title: string; empty: string; children: ReactNode[] }) {
  return (
    <section className="insert-section">
      <h4>{icon} {title}</h4>
      {children.length ? <div className="insert-items">{children}</div> : <p className="hint">{empty}</p>}
    </section>
  );
}

export function InsertMenu() {
  const session = useSession();
  const assets = useAssets((state) => state);
  const { slide } = useCurrentSlide();
  const [figureData, setFigureData] = useState<string>("");
  const upload = useRef<HTMLInputElement>(null);
  const data = figureData && assets.tables.some((table) => table.name === figureData) ? figureData : assets.tables[0]?.name ?? "";

  return (
    <Popover label="Insert" title="Insert notebook figures, tables, HTML and images" width={340} disabled={!slide}
      buttonClassName="toggle" button={<><Plus size={16} /> <span>Insert</span></>}>
      {(close) => (
        <div className="insert-menu">
          <Section icon={<ChartNoAxesCombined size={14} />} title="Figures" empty="Decorate a function with @deck.figure to add figures.">
            {assets.figures.map((figure) => (
              <button key={figure.name} type="button" onClick={() => {
                insertPayloads(session, [figurePayload(figure.name, data || null)], "Add figure");
                close();
              }}>{figure.title}</button>
            ))}
          </Section>
          {assets.figures.length > 0 && assets.tables.length > 0 && (
            <label className="insert-data">
              <span>Data for new figures</span>
              <select value={data} onChange={(event) => setFigureData(event.target.value)}>
                <option value="">No data</option>
                {assets.tables.map((table) => <option key={table.name} value={table.name}>{table.title}</option>)}
              </select>
            </label>
          )}
          <Section icon={<Table2 size={14} />} title="Tables" empty="Decorate a function with @deck.data to add tables.">
            {assets.tables.map((table) => (
              <button key={table.name} type="button" onClick={() => {
                insertPayloads(session, [tablePayload(table.name)], "Add table");
                close();
              }}>{table.title}</button>
            ))}
          </Section>
          <Section icon={<Code size={14} />} title="HTML" empty="Decorate a function with @deck.html to add widgets.">
            {assets.htmls.map((html) => (
              <button key={html.name} type="button" onClick={() => {
                insertPayloads(session, [htmlPayload(html.name)], "Add HTML");
                close();
              }}>{html.title}</button>
            ))}
          </Section>
          <Section icon={<ImageIcon size={14} />} title="Images" empty="Decorate a function with @deck.image, or upload a file below.">
            {assets.images.map((image) => (
              <button key={image.name} type="button" onClick={async () => {
                close();
                const payload = await imagePayload({ image: image.name, src: api.imageUrl(image.name, image.version) }, image.alt || image.title);
                insertPayloads(session, [payload], "Add image");
              }}>{image.title}</button>
            ))}
          </Section>
          <button type="button" className="upload" onClick={() => upload.current?.click()}>
            <Upload size={14} /> Upload image…
          </button>
          <input ref={upload} type="file" accept="image/*" multiple hidden onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            close();
            void insertImageFiles(session, files);
          }} />
          <p className="hint">You can also drop or paste image files onto the slide.</p>
        </div>
      )}
    </Popover>
  );
}
