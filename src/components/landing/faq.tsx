"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className="lp-faq-list">
      {items.map((item, index) => {
        const isOpen = open === index;
        const id = `${base}-${index}`;
        return (
          <div key={item.q} className={cn("lp-faq-item", isOpen && "is-open")} data-reveal="">
            <h3>
              <button type="button" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : index)}>
                <span>{item.q}</span>
                <span className="lp-faq-icon" aria-hidden="true">
                  <Plus size={20} strokeWidth={2.6} />
                </span>
              </button>
            </h3>
            <div id={id} className="lp-faq-body" role="region" aria-hidden={!isOpen}>
              <div>
                <p>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
