"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/cn";

/** Builds a URL that keeps the current query and applies the given changes. Null removes a key. */
export function useHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
}

export function SearchBox({ label, placeholder, param = "q" }: { label: string; placeholder: string; param?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const href = useHref();
  const [value, setValue] = useState(params.get(param) ?? "");
  const inputId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = params.get(param) ?? "";

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="search-box">
      <label htmlFor={inputId} className="visually-hidden">
        {label}
      </label>
      <Search size={16} aria-hidden="true" />
      <input
        id={inputId}
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            if (next.trim() !== current) router.replace(href({ [param]: next.trim() || null, page: null }), { scroll: false });
          }, 250);
        }}
      />
    </div>
  );
}

export function FilterTabs({
  label,
  options,
  param,
  current,
}: {
  label: string;
  options: Array<{ value: string; label: string; count?: number; icon?: ReactNode }>;
  param: string;
  current: string;
}) {
  const href = useHref();
  return (
    <nav className="filter-tabs" aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.value}
          href={href({ [param]: option.value === "all" ? null : option.value, page: null, id: null })}
          aria-current={option.value === current ? "page" : undefined}
          scroll={false}
          replace
        >
          {option.icon}
          {option.label}
          {option.count !== undefined ? <span className="count">{option.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({ page, pageSize, total, noun }: { page: number; pageSize: number; total: number; noun: string }) {
  const href = useHref();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <span className="muted">
        {from}-{to} di {total} {noun}
      </span>
      <div className="pagination-buttons">
        {page > 1 ? (
          <Link className="icon-btn" href={href({ page: String(page - 1) })} aria-label="Pagina precedente" scroll={false}>
            <ChevronLeft size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span className="icon-btn is-disabled" aria-hidden="true">
            <ChevronLeft size={16} />
          </span>
        )}
        <span className="muted" aria-live="polite">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link className="icon-btn" href={href({ page: String(page + 1) })} aria-label="Pagina successiva" scroll={false}>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span className="icon-btn is-disabled" aria-hidden="true">
            <ChevronRight size={16} />
          </span>
        )}
      </div>
    </div>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
  disabled,
  name,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  name?: string;
}) {
  const id = useId();
  return (
    <div className={cn("switch-row", disabled && "is-disabled")}>
      <button
        id={id}
        type="button"
        role="switch"
        name={name}
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span aria-hidden="true" />
      </button>
      <label htmlFor={id}>
        <strong>{label}</strong>
        {hint ? (
          <span id={`${id}-hint`} className="field-hint">
            {hint}
          </span>
        ) : null}
      </label>
    </div>
  );
}

export function SectionTitle({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}
