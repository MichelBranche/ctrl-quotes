"use client";

import { Children, Fragment, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { AuthSessionForm, type AuthTab, type AuthUi } from "@/components/auth/auth-forms";
import { messages } from "@/i18n/it";

type Tab = AuthTab;

const tabs: { key: Tab; label: string; href: string; title: string }[] = [
  { key: "login", label: messages.auth.loginLink, href: "/login", title: "Accedi" },
  { key: "register", label: messages.auth.registerLink, href: "/register", title: "Registrati" },
];

const EASE = [0.16, 1, 0.3, 1] as const;
const EXIT_DURATION = 0.16;
const HEIGHT_DURATION = 0.4;
const ENTER_DURATION = 0.3;

/**
 * Accedi / Registrati on one card. The card resizes smoothly after the old fields
 * fade out; the new ones then enter with a short stagger. Turnstile lives outside
 * this swap so the widget is not remounted.
 */
export function AuthTabs({ initial, ui, notice }: { initial: Tab; ui: AuthUi; notice?: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const fromPath: Tab | null = pathname === "/register" ? "register" : pathname === "/login" ? "login" : null;
  const [tab, setTab] = useState<Tab>(fromPath ?? initial);

  const select = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    const entry = tabs.find((item) => item.key === next)!;
    window.history.pushState(null, "", entry.href);
  };

  useEffect(() => {
    if (fromPath && fromPath !== tab) setTab(fromPath);
    // pathname updates (Next navigation) win; pushState is handled locally in select.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync from the router, not from local tab
  }, [fromPath]);

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      setTab(path === "/register" ? "register" : "login");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const entry = tabs.find((item) => item.key === tab);
    if (entry) document.title = `${entry.title} · CTRL Quotes`;
  }, [tab]);

  return (
    <>
      <div className="auth-tabs" role="tablist" aria-label="Accesso">
        {tabs.map((item) => (
          <a
            key={item.key}
            href={item.href}
            role="tab"
            id={`auth-tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls="auth-tabpanel"
            className="auth-tab"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              select(item.key);
            }}
          >
            {item.label}
            {tab === item.key ? <motion.span layoutId="auth-tab-line" className="auth-tab-line" transition={{ type: "spring", stiffness: 520, damping: 40 }} /> : null}
          </a>
        ))}
      </div>
      <div id="auth-tabpanel" role="tabpanel" aria-labelledby={`auth-tab-${tab}`}>
        <AuthSessionForm
          tab={tab}
          ui={ui}
          notice={notice}
          swap={(login, register) => (
            <AuthSwap tab={tab} reduce={Boolean(reduce)} login={login} register={register} />
          )}
        />
      </div>
    </>
  );
}

function AuthSwap({ tab, reduce, login, register }: { tab: Tab; reduce: boolean; login: ReactNode; register: ReactNode }) {
  const [displayed, setDisplayed] = useState(tab);
  const [phase, setPhase] = useState<"idle" | "out" | "resize" | "in">("idle");
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  const pendingRef = useRef(tab);

  useEffect(() => {
    pendingRef.current = tab;
    if (reduce) {
      setDisplayed(tab);
      setHeight("auto");
      setPhase("idle");
      return;
    }
    if (tab === displayed) return;
    const current = boxRef.current?.offsetHeight;
    if (current) setHeight(current);
    setPhase("out");
  }, [tab, reduce, displayed]);

  useLayoutEffect(() => {
    if (phase !== "resize") return;
    const next = innerRef.current?.offsetHeight;
    if (typeof next === "number") setHeight(next);
  }, [phase, displayed]);

  const content = displayed === "login" ? login : register;

  if (reduce) {
    return <div className="auth-swap">{content}</div>;
  }

  return (
    <motion.div
      ref={boxRef}
      className="auth-swap"
      animate={{ height: height === "auto" ? "auto" : height }}
      transition={{ duration: phase === "resize" ? HEIGHT_DURATION : 0, ease: EASE }}
      onAnimationComplete={() => {
        if (phase === "resize") setPhase("in");
      }}
      style={{ overflow: phase === "idle" ? "visible" : "hidden" }}
    >
      <motion.div
        ref={innerRef}
        key={displayed}
        className="auth-swap-inner"
        initial={false}
        animate={phase === "out" ? "exit" : phase === "resize" ? "hidden" : "show"}
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: { staggerChildren: 0.045, delayChildren: 0.02, duration: ENTER_DURATION, ease: EASE },
          },
          exit: { opacity: 0, transition: { duration: EXIT_DURATION, ease: EASE } },
        }}
        onAnimationComplete={(definition) => {
          if (definition === "exit" && phase === "out") {
            setDisplayed(pendingRef.current);
            setPhase("resize");
          } else if (definition === "show" && phase === "in") {
            setHeight("auto");
            setPhase("idle");
          }
        }}
      >
        {toStaggerItems(content)}
      </motion.div>
    </motion.div>
  );
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: ENTER_DURATION, ease: EASE } },
  exit: { opacity: 0, y: 0, transition: { duration: 0 } },
};

/** Wrap each top-level field so the enter animation can stagger them. */
function toStaggerItems(node: ReactNode): ReactNode {
  return flatten(node).map((child, index) => (
    <motion.div key={index} variants={itemVariants}>
      {child}
    </motion.div>
  ));
}

function flatten(node: ReactNode): ReactNode[] {
  const items: ReactNode[] = [];
  Children.forEach(node, (child) => {
    if (isValidElement(child) && child.type === Fragment) {
      items.push(...flatten((child.props as { children?: ReactNode }).children));
    } else if (child != null && child !== false) {
      items.push(child);
    }
  });
  return items;
}
