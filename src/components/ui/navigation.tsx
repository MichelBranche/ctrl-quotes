"use client";

import { useState } from "react";

export function Tabs({ tabs }: { tabs: Array<{ id: string; label: string; panel: string }> }) {
  const [current, setCurrent] = useState(tabs[0]?.id ?? "");
  const selected = tabs.find((tab) => tab.id === current) ?? tabs[0];
  return (
    <div>
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="tab"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === selected?.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === selected?.id ? 0 : -1}
            onClick={() => setCurrent(tab.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((item) => item.id === current);
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next = event.key === "ArrowRight" ? index + 1 : index - 1;
                const wrapped = tabs[(next + tabs.length) % tabs.length];
                if (wrapped) setCurrent(wrapped.id);
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {selected ? (
        <div role="tabpanel" id={`panel-${selected.id}`} aria-labelledby={`tab-${selected.id}`} style={{ marginTop: 12 }}>
          {selected.panel}
        </div>
      ) : null}
    </div>
  );
}

export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
