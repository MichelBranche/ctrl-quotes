"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LoginForm, RegisterForm } from "@/components/auth/auth-forms";
import { messages } from "@/i18n/it";

type Tab = "login" | "register";

const tabs: { key: Tab; label: string; href: string; title: string }[] = [
  { key: "login", label: messages.auth.loginLink, href: "/login", title: "Accedi" },
  { key: "register", label: messages.auth.registerLink, href: "/register", title: "Registrati" },
];

/** Accedi / Registrati on one card. Switching updates the URL (/login, /register) without a reload. */
export function AuthTabs({ initial, googleEnabled, notice }: { initial: Tab; googleEnabled: boolean; notice?: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const tab: Tab = pathname === "/register" ? "register" : pathname === "/login" ? "login" : initial;

  const select = (next: Tab) => {
    if (next === tab) return;
    const entry = tabs.find((item) => item.key === next)!;
    window.history.pushState(null, "", entry.href);
  };

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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={reduce ? false : { opacity: 0, x: tab === "register" ? 18 : -18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: tab === "register" ? -18 : 18 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {tab === "login" ? (
              <>
                {notice}
                <LoginForm googleEnabled={googleEnabled} />
              </>
            ) : (
              <RegisterForm googleEnabled={googleEnabled} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
