"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { uploadLogoAction } from "@/server/actions/settings";
import {
  completeOnboardingAction,
  saveOnboardingBrandAction,
  saveOnboardingServiceAction,
  saveOnboardingTemplateAction,
  skipOnboardingStepAction,
  type ReusableBrand,
} from "@/server/actions/onboarding";

const EASE = [0.16, 1, 0.3, 1] as const;
const STEPS = [
  { title: "Crea il tuo brand", hint: "Nome, logo e colore. Puoi riprendere un Brand Kit già salvato." },
  { title: "Personalizza", hint: "Scegli lo stile dei tuoi preventivi. Potrai cambiarlo in qualsiasi momento." },
  { title: "Aggiungi i tuoi servizi", hint: "Un primo servizio nel catalogo, oppure salta e aggiungilo dopo." },
  { title: "Crea il tuo primo preventivo", hint: "Apri l'editor per il primo preventivo, oppure vai alla panoramica." },
];

type Props = {
  step: number;
  workspaceName: string;
  brand: { companyName: string; colorPrimary: string; hasLogo: boolean; logoSrc: string | null };
  reusable: ReusableBrand[];
  templates: Array<{ key: string; name: string; description: string; accent: string }>;
};

export function SetupFlow({ step: initialStep, workspaceName, brand, reusable, templates }: Props) {
  const reduced = useReducedMotion() ?? false;
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [companyName, setCompanyName] = useState(brand.companyName || workspaceName);
  const [colorPrimary, setColorPrimary] = useState(brand.colorPrimary);
  const [logoSrc, setLogoSrc] = useState(brand.logoSrc);
  const [serviceName, setServiceName] = useState("");
  const [priceEuro, setPriceEuro] = useState("");
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "minimal");

  const go = (next: number) => {
    setError(null);
    setStep(next);
  };

  const run = (action: () => Promise<{ ok: true } | { ok: false; message: string }>, next: number) => {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      go(next);
    });
  };

  const skip = () => {
    setError(null);
    start(async () => {
      await skipOnboardingStepAction(step);
      if (step < STEPS.length - 1) go(step + 1);
    });
  };

  const variants = reduced
    ? { enter: { opacity: 1, y: 0 }, center: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 0 } }
    : {
        enter: { opacity: 0, y: 24 },
        center: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE } },
        exit: { opacity: 0, y: -16, transition: { duration: 0.28, ease: EASE } },
      };

  return (
    <main className="ob-setup">
      <header className="ob-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="CTRL Quotes" width={126} height={28} />
        <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Passo ${step + 1} di ${STEPS.length}`}>
          {STEPS.map((item, index) => (
            <span key={item.title} className={index <= step ? "is-on" : undefined} />
          ))}
        </div>
        <p className="ob-step-label">Passo {step + 1} di {STEPS.length}</p>
      </header>

      <AnimatePresence mode="wait">
        <motion.section
          key={step}
          className="ob-panel"
          initial="enter"
          animate="center"
          exit="exit"
          variants={variants}
        >
          <p className="ob-kicker">Benvenuto in {workspaceName}</p>
          <h1>{STEPS[step]?.title}</h1>
          <p className="lede">{STEPS[step]?.hint}</p>
          {error ? <p className="alert" role="alert">{error}</p> : null}

          {step === 0 ? (
            <form
              className="ob-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => saveOnboardingBrandAction({ companyName, colorPrimary }), 1);
              }}
            >
              <label className="field">
                <span className="field-label">Nome del brand</span>
                <input name="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required minLength={2} maxLength={120} />
              </label>
              <label className="field">
                <span className="field-label">Colore principale</span>
                <span className="ob-color">
                  <input type="color" value={colorPrimary} onChange={(e) => setColorPrimary(e.target.value.toUpperCase())} aria-label="Colore principale" />
                  <input
                    value={colorPrimary}
                    onChange={(e) => setColorPrimary(e.target.value.toUpperCase())}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    maxLength={7}
                  />
                </span>
              </label>
              <div className="field">
                <span className="field-label">Logo</span>
                <div className="ob-logo">
                  {logoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoSrc} alt="" width={64} height={64} />
                  ) : (
                    <span className="ob-logo-ph">Nessun logo</span>
                  )}
                  <label className="btn-secondary">
                    {logoSrc ? "Sostituisci logo" : "Carica logo"}
                    <input
                      type="file"
                      name="logo"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const data = new FormData();
                        data.set("logo", file);
                        start(async () => {
                          const result = await uploadLogoAction(data);
                          if (!result.ok) {
                            setError(result.message);
                            return;
                          }
                          setLogoSrc(URL.createObjectURL(file));
                        });
                      }}
                    />
                  </label>
                </div>
              </div>
              {reusable.length > 0 ? (
                <div className="field">
                  <span className="field-label">Usa un Brand Kit esistente</span>
                  <div className="ob-reuse">
                    {reusable.map((item) => (
                      <button
                        key={item.workspaceId}
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => saveOnboardingBrandAction({ companyName, colorPrimary, reuseFromWorkspaceId: item.workspaceId }), 1)}
                      >
                        <span className="ob-swatch" style={{ background: item.colorPrimary }} />
                        {item.companyName || item.workspaceName}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="ob-actions">
                <button type="submit" className="btn-primary" disabled={pending}>
                  Continua
                </button>
              </div>
            </form>
          ) : null}

          {step === 1 ? (
            <form
              className="ob-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => saveOnboardingTemplateAction(templateKey), 2);
              }}
            >
              <div className="ob-templates">
                {templates.map((item) => (
                  <label key={item.key} className={item.key === templateKey ? "is-on" : undefined}>
                    <input type="radio" name="template" value={item.key} checked={item.key === templateKey} onChange={() => setTemplateKey(item.key)} />
                    <span className="ob-swatch" style={{ background: item.accent }} />
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                  </label>
                ))}
              </div>
              <div className="ob-actions">
                <button type="submit" className="btn-primary" disabled={pending}>
                  Continua
                </button>
              </div>
            </form>
          ) : null}

          {step === 2 ? (
            <form
              className="ob-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => saveOnboardingServiceAction({ name: serviceName, priceEuro }), 3);
              }}
            >
              <label className="field">
                <span className="field-label">Nome del servizio</span>
                <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} required minLength={2} maxLength={120} placeholder="Per esempio, Consulenza strategica" />
              </label>
              <label className="field">
                <span className="field-label">Prezzo, in euro</span>
                <input value={priceEuro} onChange={(e) => setPriceEuro(e.target.value)} inputMode="decimal" placeholder="0,00" required />
              </label>
              <div className="ob-actions">
                <button type="button" className="btn-ghost" disabled={pending} onClick={skip}>
                  Salta
                </button>
                <button type="submit" className="btn-primary" disabled={pending}>
                  Continua
                </button>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <div className="ob-form">
              <p className="ob-quote-lead">
                Puoi aprire l&apos;editor e creare il primo preventivo ora, oppure andare alla panoramica e farlo più tardi.
              </p>
              <div className="ob-actions">
                <button type="button" className="btn-ghost" disabled={pending} onClick={() => start(() => completeOnboardingAction("overview"))}>
                  Salta
                </button>
                <button type="button" className="btn-primary" disabled={pending} onClick={() => start(() => completeOnboardingAction("quote"))}>
                  Crea un preventivo
                </button>
              </div>
            </div>
          ) : null}
        </motion.section>
      </AnimatePresence>
    </main>
  );
}
