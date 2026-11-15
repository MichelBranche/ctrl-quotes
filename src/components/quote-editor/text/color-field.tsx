"use client";

import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/cn";

const RECENT_KEY = "cq.colors.recent";
const palette = ["#0B0B0F", "#3A3A40", "#6E6E73", "#D1D1D6", "#FFFFFF", "#7C3AED", "#2563EB", "#0EA5E9", "#16A34A", "#EAB308", "#F97316", "#DC2626", "#DB2777"];

function readRecent(): string[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string" && /^#[0-9A-F]{6}$/i.test(item)) : [];
  } catch {
    return [];
  }
}

function remember(color: string) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([color, ...readRecent().filter((item) => item !== color)].slice(0, 8)));
  } catch {
    // Recents are a convenience.
  }
}

/** Swatches of the Brand Kit, a base palette, recent colours and a free picker. */
export function ColorField({
  value,
  brand,
  resetLabel,
  onPick,
}: {
  value: string | null;
  brand: Array<{ color: string; label: string }>;
  resetLabel: string;
  onPick: (color: string | null, live?: boolean) => void;
}) {
  const [recent] = useState(readRecent);
  const [custom, setCustom] = useState(value ?? "#7C3AED");
  const [hex, setHex] = useState(value ?? "");
  const pick = (color: string) => {
    const upper = color.toUpperCase();
    remember(upper);
    onPick(upper);
  };
  const swatch = (color: string, label: string) => (
    <button
      key={`${label}${color}`}
      type="button"
      className={cn("cf-swatch", value?.toUpperCase() === color.toUpperCase() && "is-on")}
      style={{ background: color }}
      aria-label={`${label} ${color}`}
      title={`${label} ${color}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => pick(color)}
    />
  );
  return (
    <div className="cf" data-ve-text-ui="">
      {brand.length ? (
        <>
          <p className="cf-label">Brand Kit</p>
          <div className="cf-row">{brand.map((item) => swatch(item.color, item.label))}</div>
        </>
      ) : null}
      <p className="cf-label">Colori</p>
      <div className="cf-row">{palette.map((color) => swatch(color, "Colore"))}</div>
      {recent.length ? (
        <>
          <p className="cf-label">Recenti</p>
          <div className="cf-row">{recent.map((color) => swatch(color, "Recente"))}</div>
        </>
      ) : null}
      <div className="cf-custom">
        <HexColorPicker
          color={custom}
          onChange={(color) => {
            setCustom(color);
            setHex(color.toUpperCase());
            onPick(color.toUpperCase(), true);
          }}
        />
        <div className="cf-hex">
          <input
            aria-label="Colore esadecimale"
            value={hex}
            maxLength={7}
            placeholder="#7C3AED"
            onChange={(event) => {
              const next = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;
              setHex(next.toUpperCase());
              if (/^#[0-9A-F]{6}$/i.test(next)) {
                setCustom(next);
                onPick(next.toUpperCase(), true);
              }
            }}
            onBlur={() => /^#[0-9A-F]{6}$/i.test(hex) && remember(hex.toUpperCase())}
          />
          <button type="button" className="cf-reset" onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(null)}>
            {resetLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
