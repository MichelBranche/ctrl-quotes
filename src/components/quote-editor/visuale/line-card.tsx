"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatEuro } from "@/domain/money";
import { lineNetCents, type QuoteLine } from "@/domain/quote-document";
import type { TaxProfile } from "@/domain/pricing";
import { MoneyInput, PercentInput, QuantityInput } from "../inputs";
import { revealInCanvas } from "./geometry";

export type LineFocus = "quantityMilli" | "unitPriceCents" | "discountBp";
const order: LineFocus[] = ["quantityMilli", "unitPriceCents", "discountBp"];

/**
 * Numbers of one line, opened from its cell on the sheet: quantity, price and discount with the
 * same Italian parsing as Modulo. The cell stays highlighted; totals come back from the server.
 */
export function LineCard({
  line,
  focus,
  position,
  taxProfile,
  showQuantity,
  onPatch,
  onRemove,
  onClose,
}: {
  line: QuoteLine;
  focus: LineFocus;
  position: { x: number; y: number };
  taxProfile: TaxProfile;
  showQuantity: boolean;
  onPatch: (patch: Partial<QuoteLine>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const inputs = card.current?.querySelectorAll<HTMLInputElement>("input");
    const fields = order.filter((key) => showQuantity || key !== "quantityMilli");
    const input = inputs?.[Math.max(0, fields.indexOf(focus))];
    input?.focus({ preventScroll: true });
    input?.select();
    requestAnimationFrame(() => revealInCanvas(card.current, Boolean(reduced)));
    // Focus once, when the card opens on a cell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (card.current && event.target instanceof Node && card.current.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [onClose]);

  return (
    <motion.div
      ref={card}
      className="ve-line-card"
      data-ve-ui=""
      role="dialog"
      aria-label={`Importi della voce ${line.name || "senza nome"}`}
      style={{ left: position.x, top: position.y }}
      initial={reduced ? false : { opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="ve-line-head">
        <strong className="clamp-1">{line.name || "Voce senza nome"}</strong>
        <button type="button" className="icon-btn" aria-label="Chiudi" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="ve-line-grid">
        {showQuantity ? <QuantityInput label="Quantità" milli={line.quantityMilli} onMilli={(quantityMilli) => onPatch({ quantityMilli })} /> : null}
        <MoneyInput label={line.priceMode === "gross" ? "Prezzo IVA incl." : "Prezzo unitario"} cents={line.unitPriceCents} onCents={(unitPriceCents) => onPatch({ unitPriceCents })} />
        <PercentInput label="Sconto" bp={line.discountBp} onBp={(discountBp) => onPatch({ discountBp })} />
      </div>
      <div className="ve-line-foot">
        <span className="muted small">
          Imponibile <strong>{formatEuro(lineNetCents(line, taxProfile))}</strong>
        </span>
        <Button variant="ghost" className="btn-sm danger-text" onClick={onRemove}>
          <Trash2 size={14} aria-hidden="true" /> Rimuovi
        </Button>
      </div>
    </motion.div>
  );
}
