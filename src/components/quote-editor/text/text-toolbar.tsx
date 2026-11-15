"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  HighlighterIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  TextAlignCenterIcon,
  TextAlignJustifyCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextAllCapsIcon,
  TextBoldIcon,
  TextClearIcon,
  TextColorIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextTrackingIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import { ChevronDown, Minus, Plus } from "lucide-react";
import type { FontRef } from "@/domain/fonts";
import { linkSchema, markKeys, markValueIn, type MarkAttrs, type TextFormat } from "@/domain/text-format";
import { cn } from "@/lib/cn";
import type { SessionApi } from "../visuale/text-session";
import { ColorField } from "./color-field";
import { FontPicker, useCatalog } from "./font-picker";

/**
 * Floating text toolbar of the visual editor. It sits above the text being edited (below it when
 * there is no room), never past the edges of the canvas. With words selected it formats those
 * words; with only the caret it formats the whole element. Quick edits only: the side panel
 * keeps the full style of the block.
 */

type Pop = "font" | "size" | "color" | "highlight" | "align" | "spacing" | "link" | null;
const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72, 96];
const alignIcon: Record<NonNullable<TextFormat["align"]>, IconSvgElement> = {
  left: TextAlignLeftIcon,
  center: TextAlignCenterIcon,
  right: TextAlignRightIcon,
  justify: TextAlignJustifyCenterIcon,
};
const alignLabel = { left: "A sinistra", center: "Al centro", right: "A destra", justify: "Giustificato" } as const;

export type ToolbarBrand = { colors: Array<{ color: string; label: string }>; fonts: Array<{ ref: FontRef; role: string }> };

function Icon({ icon }: { icon: IconSvgElement }) {
  return <HugeiconsIcon icon={icon} size={16} strokeWidth={1.8} />;
}

function normalizeLink(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^(https:|mailto:|tel:)/i.test(value) ? value : /^http:\/\//i.test(value) ? value.replace(/^http:/i, "https:") : value.includes("@") && !value.includes("/") ? `mailto:${value}` : `https://${value}`;
  return linkSchema.safeParse(candidate).success ? candidate : null;
}

export function TextToolbar({
  api,
  selection,
  format,
  multiline,
  label,
  brand,
  bounds,
  onFormat,
  onClear,
}: {
  api: RefObject<SessionApi | null>;
  selection: { s: number; e: number } | null;
  format: TextFormat | undefined;
  multiline: boolean;
  /** "Titolo · Servizi": what the toolbar is formatting. */
  label: string;
  brand: ToolbarBrand;
  /** The visible canvas: the toolbar never leaves it. */
  bounds: () => DOMRect | null;
  onFormat: (patch: Partial<TextFormat>, live?: boolean) => void;
  onClear: () => void;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [tick, setTick] = useState(0);
  const [place, setPlace] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const catalog = useCatalog();
  const hasSel = Boolean(selection && selection.e > selection.s);
  const marks = api.current?.marks() ?? [];
  void tick;

  // Follow the text: re-placed on every frame while open (scroll, zoom, panel, typing).
  useLayoutEffect(() => {
    let frame = 0;
    const step = () => {
      const box = api.current?.box();
      const bar = ref.current;
      if (box && bar) {
        const rect = box.getBoundingClientRect();
        const area = bounds() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
        // A narrow canvas (both side panels open) wraps the bar onto two rows instead of covering the panel.
        const room = `${Math.max(240, Math.min(area.right, window.innerWidth) - Math.max(area.left, 0) - 16)}px`;
        if (bar.style.maxWidth !== room) bar.style.maxWidth = room;
        const width = bar.offsetWidth;
        const height = bar.offsetHeight;
        const top = Math.max(area.top, 0) + 8;
        let below = rect.top - height - 12 < top;
        let y = below ? rect.bottom + 40 : rect.top - height - 12;
        if (below && y + height > Math.min(area.bottom, window.innerHeight) - 8) {
          below = false;
          y = Math.max(top, rect.top - height - 12);
        }
        const left = Math.max(area.left + 8, 8);
        const right = Math.min(area.right, window.innerWidth) - 8;
        const x = Math.min(Math.max(rect.left, left), Math.max(left, right - width));
        setPlace((current) => (current && Math.abs(current.x - x) < 0.5 && Math.abs(current.y - y) < 0.5 && current.below === below ? current : { x, y, below }));
      }
      frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [api, bounds]);

  useEffect(() => {
    if (!pop) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setPop(null);
        api.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pop, api]);

  const field = api.current?.field() ?? null;
  const computed = field ? getComputedStyle(field) : null;
  const baseSize = computed ? Math.round(parseFloat(computed.fontSize) * 0.75 * 10) / 10 : 10;
  const baseBold = computed ? Number(computed.fontWeight) >= 600 : false;
  const baseItalic = computed?.fontStyle === "italic";
  const deco = computed?.textDecorationLine ?? "";
  const elementAlign = format?.align ?? ((computed?.textAlign === "center" ? "center" : computed?.textAlign === "right" || computed?.textAlign === "end" ? "right" : computed?.textAlign === "justify" ? "justify" : "left") as NonNullable<TextFormat["align"]>);
  const upper = (format?.case ?? (computed?.textTransform === "uppercase" ? "upper" : "none")) === "upper";

  const inline = <K extends keyof MarkAttrs>(key: K) => (selection && hasSel ? markValueIn(marks, selection.s, selection.e, key) : undefined);
  const state = {
    b: hasSel ? Boolean(inline("b")) || (format?.bold ?? baseBold) : (format?.bold ?? baseBold),
    i: hasSel ? Boolean(inline("i")) || (format?.italic ?? baseItalic) : (format?.italic ?? baseItalic),
    u: hasSel ? Boolean(inline("u")) || (format?.underline ?? deco.includes("underline")) : (format?.underline ?? deco.includes("underline")),
    x: hasSel ? Boolean(inline("x")) || (format?.strike ?? deco.includes("line-through")) : (format?.strike ?? deco.includes("line-through")),
  };
  const font = ((hasSel ? inline("f") : undefined) ?? format?.font ?? null) as FontRef | null;
  const size = (hasSel ? inline("z") : undefined) ?? format?.size ?? baseSize;
  const color = (hasSel ? inline("c") : undefined) ?? format?.color ?? null;
  const highlight = (hasSel ? inline("h") : undefined) ?? format?.highlight ?? null;
  const fontName = font ? (catalog?.find((entry) => entry.ref === font)?.name ?? font.slice(font.indexOf(":") + 1)) : "Font del template";

  const refresh = () => setTick((value) => value + 1);
  const toggle = (key: "b" | "i" | "u" | "x") => {
    const elementKey = { b: "bold", i: "italic", u: "underline", x: "strike" } as const;
    if (hasSel && selection) api.current?.mark({ [key]: !inline(key) }, selection);
    else onFormat(key === "b" ? { bold: !state.b, weight: undefined } : { [elementKey[key]]: !state[key] });
    refresh();
  };
  const setSize = (next: number) => {
    const value = Math.max(4, Math.min(200, Math.round(next * 2) / 2));
    if (hasSel && selection) api.current?.mark({ z: value }, selection);
    else onFormat({ size: value });
    refresh();
  };
  const whole = () => ({ s: 0, e: api.current?.text().length ?? 0 });

  const button = (props: { label: string; keys?: string; pressed?: boolean; onClick: () => void; children: ReactNode; popKey?: Pop; className?: string }) => (
    <button
      type="button"
      className={cn("tt-btn", props.pressed && "is-on", props.popKey && pop === props.popKey && "is-open", props.className)}
      aria-label={props.label}
      aria-pressed={props.popKey ? undefined : props.pressed}
      aria-expanded={props.popKey ? pop === props.popKey : undefined}
      title={props.keys ? `${props.label} (${props.keys})` : props.label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
  const openPop = (key: Pop) => setPop((current) => (current === key ? null : key));

  const panel = (key: Pop, body: ReactNode, wide = false) =>
    pop === key ? (
      <motion.div
        className={cn("tt-pop", wide && "is-wide", place?.below === false && place.y > window.innerHeight / 2 ? "is-up" : "")}
        data-ve-text-ui=""
        initial={reduced ? false : { opacity: 0, y: -4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {body}
      </motion.div>
    ) : null;

  const node = (
    <motion.div
      ref={ref}
      className="tt"
      role="toolbar"
      aria-label={`Formattazione: ${label}`}
      data-ve-text-ui=""
      data-testid="text-toolbar"
      style={{ left: place?.x ?? -9999, top: place?.y ?? -9999 }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: place ? 1 : 0, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <span className={cn("tt-scope", hasSel && "is-sel")} title={hasSel ? "Le modifiche valgono per le parole selezionate" : "Le modifiche valgono per tutto il testo"}>
        {hasSel ? "Selezione" : "Tutto il testo"}
      </span>
      <span className="tt-sep" aria-hidden="true" />
      <button type="button" className={cn("tt-font", pop === "font" && "is-open")} aria-haspopup="listbox" aria-expanded={pop === "font"} title="Font" onMouseDown={(event) => event.preventDefault()} onClick={() => openPop("font")}>
        <span className="clamp-1">{fontName}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <span className="tt-size" role="group" aria-label="Dimensione">
        {button({ label: "Riduci dimensione", onClick: () => setSize(size - 1), children: <Minus size={13} aria-hidden="true" />, className: "is-step" })}
        <input
          className="tt-size-input"
          aria-label="Dimensione in punti"
          inputMode="decimal"
          key={`${size}`}
          defaultValue={String(size).replace(".", ",")}
          onFocus={() => setPop("size")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const value = Number(event.currentTarget.value.replace(",", "."));
              if (Number.isFinite(value) && value > 0) setSize(value);
              setPop(null);
              api.current?.focus();
            }
          }}
          onBlur={(event) => {
            const value = Number(event.currentTarget.value.replace(",", "."));
            if (Number.isFinite(value) && value > 0 && value !== size) setSize(value);
          }}
        />
        {button({ label: "Aumenta dimensione", onClick: () => setSize(size + 1), children: <Plus size={13} aria-hidden="true" />, className: "is-step" })}
      </span>
      <span className="tt-sep" aria-hidden="true" />
      {button({ label: "Grassetto", keys: "Ctrl+B", pressed: state.b, onClick: () => toggle("b"), children: <Icon icon={TextBoldIcon} /> })}
      {button({ label: "Corsivo", keys: "Ctrl+I", pressed: state.i, onClick: () => toggle("i"), children: <Icon icon={TextItalicIcon} /> })}
      {button({ label: "Sottolineato", keys: "Ctrl+U", pressed: state.u, onClick: () => toggle("u"), children: <Icon icon={TextUnderlineIcon} /> })}
      {button({ label: "Barrato", pressed: state.x, onClick: () => toggle("x"), children: <Icon icon={TextStrikethroughIcon} /> })}
      <span className="tt-sep" aria-hidden="true" />
      {button({
        label: "Colore del testo",
        popKey: "color",
        onClick: () => openPop("color"),
        children: (
          <span className="tt-color">
            <Icon icon={TextColorIcon} />
            <i style={{ background: color ?? computed?.color ?? "#000" }} />
          </span>
        ),
      })}
      {button({
        label: "Evidenziatore",
        popKey: "highlight",
        onClick: () => openPop("highlight"),
        children: (
          <span className="tt-color">
            <Icon icon={HighlighterIcon} />
            <i style={{ background: highlight ?? "transparent", boxShadow: highlight ? undefined : "inset 0 0 0 1px var(--cq-border-strong)" }} />
          </span>
        ),
      })}
      <span className="tt-sep" aria-hidden="true" />
      {button({ label: `Allineamento: ${alignLabel[elementAlign].toLowerCase()}`, popKey: "align", onClick: () => openPop("align"), children: <Icon icon={alignIcon[elementAlign]} /> })}
      {button({ label: "Interlinea e spaziatura", popKey: "spacing", onClick: () => openPop("spacing"), children: <Icon icon={TextTrackingIcon} /> })}
      {button({ label: upper ? "Testo normale" : "Tutto maiuscolo", pressed: upper, onClick: () => onFormat({ case: upper ? "none" : "upper" }), children: <Icon icon={TextAllCapsIcon} /> })}
      {multiline ? (
        <>
          {button({ label: "Elenco puntato", onClick: () => (api.current?.list("bullet"), refresh()), children: <Icon icon={LeftToRightListBulletIcon} /> })}
          {button({ label: "Elenco numerato", onClick: () => (api.current?.list("number"), refresh()), children: <Icon icon={LeftToRightListNumberIcon} /> })}
        </>
      ) : null}
      {button({
        label: "Link",
        pressed: Boolean(inline("href")),
        popKey: "link",
        onClick: () => {
          const range = hasSel && selection ? selection : whole();
          setLink(markValueIn(marks, range.s, range.e, "href") ?? "");
          setLinkError(null);
          openPop("link");
        },
        children: <Icon icon={Link01Icon} />,
      })}
      {button({
        label: hasSel ? "Togli la formattazione dalla selezione" : "Togli tutta la formattazione",
        onClick: () => {
          if (hasSel && selection) api.current?.mark(Object.fromEntries(markKeys.map((key) => [key, undefined])), selection);
          else onClear();
          refresh();
        },
        children: <Icon icon={TextClearIcon} />,
      })}

      {panel(
        "font",
        <FontPicker
          value={font}
          brand={brand.fonts}
          onPick={(next) => {
            if (hasSel && selection) api.current?.mark({ f: next ?? undefined }, selection);
            else onFormat({ font: next ?? undefined });
            setPop(null);
            refresh();
            api.current?.focus();
          }}
        />,
        true,
      )}
      {panel(
        "size",
        <div className="tt-sizes" role="listbox" aria-label="Dimensioni">
          {sizes.map((value) => (
            <button key={value} type="button" role="option" aria-selected={value === size} className={cn("tt-chip", value === size && "is-on")} onMouseDown={(event) => event.preventDefault()} onClick={() => (setSize(value), setPop(null))}>
              {value}
            </button>
          ))}
          {format?.size !== undefined && !hasSel ? (
            <button type="button" className="tt-reset" onMouseDown={(event) => event.preventDefault()} onClick={() => (onFormat({ size: undefined }), setPop(null))}>
              Dimensione del template
            </button>
          ) : null}
        </div>,
      )}
      {panel(
        "color",
        <ColorField
          value={color}
          brand={brand.colors}
          resetLabel="Colore del template"
          onPick={(next, live) => {
            if (hasSel && selection) api.current?.mark({ c: next ?? undefined }, selection);
            else onFormat({ color: next ?? undefined }, live);
            refresh();
          }}
        />,
      )}
      {panel(
        "highlight",
        <ColorField
          value={highlight}
          brand={brand.colors}
          resetLabel="Nessuna evidenziazione"
          onPick={(next, live) => {
            if (hasSel && selection) api.current?.mark({ h: next ?? undefined }, selection);
            else onFormat({ highlight: next ?? undefined }, live);
            refresh();
          }}
        />,
      )}
      {panel(
        "align",
        <div className="tt-row" role="group" aria-label="Allineamento">
          {(["left", "center", "right", "justify"] as const).map((key) => (
            <button key={key} type="button" className={cn("tt-btn", elementAlign === key && "is-on")} aria-pressed={elementAlign === key} aria-label={alignLabel[key]} title={alignLabel[key]} onMouseDown={(event) => event.preventDefault()} onClick={() => (onFormat({ align: key }), setPop(null))}>
              <Icon icon={alignIcon[key]} />
            </button>
          ))}
        </div>,
      )}
      {panel(
        "spacing",
        <div className="tt-spacing">
          <label>
            <span>
              Interlinea <b>{(format?.lineHeight ?? 1.3).toFixed(2).replace(".", ",")}</b>
            </span>
            <input type="range" min={0.8} max={2.4} step={0.05} value={format?.lineHeight ?? 1.3} onChange={(event) => onFormat({ lineHeight: Number(event.target.value) }, true)} />
          </label>
          <label>
            <span>
              Spaziatura lettere <b>{Math.round((format?.tracking ?? 0) * 1000)}</b>
            </span>
            <input type="range" min={-0.05} max={0.4} step={0.005} value={format?.tracking ?? 0} onChange={(event) => onFormat({ tracking: Number(event.target.value) }, true)} />
          </label>
          <button type="button" className="tt-reset" onMouseDown={(event) => event.preventDefault()} onClick={() => onFormat({ lineHeight: undefined, tracking: undefined })}>
            Spaziatura del template
          </button>
        </div>,
      )}
      {panel(
        "link",
        <form
          className="tt-link"
          onSubmit={(event) => {
            event.preventDefault();
            const href = normalizeLink(link);
            if (!href) {
              setLinkError("Link non valido: usa un indirizzo web, una email o un telefono.");
              return;
            }
            api.current?.mark({ href }, hasSel && selection ? selection : whole());
            setPop(null);
            refresh();
          }}
        >
          <label className="tt-link-label" htmlFor="tt-link">
            {hasSel ? "Link sulle parole selezionate" : "Link su tutto il testo"}
          </label>
          <input id="tt-link" autoFocus value={link} placeholder="www.sito.it, nome@email.it" onChange={(event) => setLink(event.target.value)} aria-invalid={linkError ? true : undefined} />
          {linkError ? <p className="tt-link-error">{linkError}</p> : null}
          <div className="tt-link-actions">
            <button type="button" className="tt-reset" onClick={() => (api.current?.mark({ href: undefined }, hasSel && selection ? selection : whole()), setPop(null), refresh())}>
              Togli link
            </button>
            <button type="submit" className="tt-apply">
              Applica
            </button>
          </div>
        </form>,
      )}
    </motion.div>
  );
  return createPortal(node, document.body);
}
