"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert, LoaderCircle, PartyPopper, Ticket, X } from "lucide-react";
import { plans } from "@/domain/plans";
import type { RedeemSuccess } from "@/domain/redeem";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "success"; value: RedeemSuccess };

const ease = [0.16, 1, 0.3, 1] as const;
const subscribeNever = () => () => {};

function unlockedText(value: RedeemSuccess): string {
  const name = plans[value.plan].name;
  if (value.kind === "lifetime" || value.until === null) return `Hai sbloccato il ${name} a vita per questo workspace.`;
  const date = new Date(value.until).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  return `Hai sbloccato il ${name} per ${value.days ?? 30} giorni, fino al ${date}.`;
}

/** Secondary hero button + animated modal to redeem a code for the active workspace. */
export function RedeemButton() {
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <motion.button
        ref={trigger}
        type="button"
        className="bl-btn is-ghost"
        onClick={() => setOpen(true)}
        whileHover={reduced ? undefined : { y: -2 }}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        aria-haspopup="dialog"
      >
        <Ticket size={18} aria-hidden="true" className="bl-btn-icon" /> Hai un codice?
      </motion.button>
      <RedeemDialog
        open={open}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
      />
    </>
  );
}

function RedeemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduced = useReducedMotion() ?? false;
  // Portal target exists only in the browser.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="rd-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.22 } }}
          transition={{ duration: reduced ? 0 : 0.25 }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <RedeemPanel onClose={onClose} reduced={reduced} />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function RedeemPanel({ onClose, reduced }: { onClose: () => void; reduced: boolean }) {
  const router = useRouter();
  const titleId = useId();
  const errorId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    input.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (state.kind === "success") done.current?.focus();
  }, [state.kind]);

  // Escape closes; Tab stays inside the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])");
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state.kind === "loading") return;
    if (!code.trim()) {
      setState({ kind: "error", message: "Inserisci il codice." });
      input.current?.focus();
      return;
    }
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const data = (await response.json().catch(() => null)) as (RedeemSuccess & { message?: string }) | null;
      if (!response.ok || !data) {
        setState({ kind: "error", message: data?.message ?? "Qualcosa è andato storto. Riprova." });
        input.current?.focus();
        return;
      }
      setState({ kind: "success", value: data });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Connessione assente. Riprova." });
    }
  };

  const enter = reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.94 };
  const swap = reduced ? { duration: 0 } : { duration: 0.28, ease };

  return (
    <motion.div
      ref={panel}
      className="rd-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={enter}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 24, scale: 0.96, transition: { duration: 0.2, ease: [0.55, 0, 0.75, 0.2] } }}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28 }}
    >
      <button type="button" className="rd-close" onClick={onClose} aria-label="Chiudi">
        <X size={18} aria-hidden="true" />
      </button>
      <AnimatePresence mode="wait" initial={false}>
        {state.kind === "success" ? (
          <motion.div key="ok" className="rd-success" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={swap}>
            <motion.span
              className="rd-badge is-ok"
              initial={reduced ? false : { scale: 0.4, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 16, delay: 0.05 }}
            >
              <PartyPopper size={26} aria-hidden="true" />
            </motion.span>
            <h2 id={titleId}>Codice riscattato</h2>
            <p className="rd-text" role="status">
              {unlockedText(state.value)}
            </p>
            <ul className="rd-list">
              {plans[state.value.plan].includes.slice(0, 5).map((item) => (
                <li key={item.label}>
                  {item.label}
                  {item.soon ? <span className="rd-soon">In arrivo</span> : null}
                </li>
              ))}
            </ul>
            <button ref={done} type="button" className="rd-submit" onClick={onClose}>
              Fatto
            </button>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={submit} noValidate initial={false} exit={reduced ? undefined : { opacity: 0, y: -10, transition: { duration: 0.16 } }}>
            <span className="rd-badge">
              <Ticket size={24} aria-hidden="true" />
            </span>
            <h2 id={titleId}>Hai un codice?</h2>
            <p className="rd-text">Inseriscilo qui per sbloccare un piano sul workspace. Maiuscole e minuscole sono uguali.</p>
            <label className="rd-label" htmlFor="redeem-code">
              Codice
            </label>
            <motion.div
              className="rd-field"
              animate={state.kind === "error" && !reduced ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
              transition={{ duration: 0.4 }}
              key={state.kind === "error" ? state.message : "field"}
            >
              <input
                ref={input}
                id="redeem-code"
                name="code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  if (state.kind === "error") setState({ kind: "idle" });
                }}
                placeholder="Es. CQ-7KD2-M9QX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={48}
                disabled={state.kind === "loading"}
                aria-invalid={state.kind === "error"}
                aria-describedby={state.kind === "error" ? errorId : undefined}
              />
            </motion.div>
            <AnimatePresence initial={false}>
              {state.kind === "error" ? (
                <motion.p
                  id={errorId}
                  className="rd-error"
                  role="alert"
                  initial={reduced ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={reduced ? undefined : { opacity: 0, height: 0 }}
                  transition={swap}
                >
                  <CircleAlert size={16} aria-hidden="true" /> {state.message}
                </motion.p>
              ) : null}
            </AnimatePresence>
            <button type="submit" className="rd-submit" disabled={state.kind === "loading"} aria-busy={state.kind === "loading"}>
              {state.kind === "loading" ? (
                <>
                  <LoaderCircle size={18} aria-hidden="true" className="rd-spin" /> Verifica in corso…
                </>
              ) : (
                "Riscatta"
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
