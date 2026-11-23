"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bell, FileText, Package, Palette, Send, ShieldCheck, Users } from "lucide-react";
import type { InviteRole } from "@/domain/invites";
import { finishInviteWelcomeAction } from "@/server/actions/invites";

const EASE = [0.16, 1, 0.3, 1] as const;
const STEP_COUNT = 3;

type Props = {
  workspaceId: string;
  workspaceName: string;
  inviterName: string | null;
  role: InviteRole;
  roleLabel: string;
  userName: string;
};

const roleCan: Record<InviteRole, string[]> = {
  member: [
    "Creare, modificare e inviare preventivi.",
    "Gestire clienti e catalogo dei servizi.",
    "Scegliere i template preferiti.",
  ],
  admin: [
    "Tutto quello che fa un membro, più eliminare preventivi, clienti e voci di catalogo.",
    "Modificare brand, template predefinito e impostazioni del workspace.",
    "Invitare e rimuovere persone dal team.",
  ],
};

const roleCannot: Record<InviteRole, string> = {
  member: "Eliminazioni, brand, impostazioni e team restano agli amministratori. Abbonamento e ruoli al titolare.",
  admin: "Abbonamento e cambio dei ruoli restano al titolare del workspace.",
};

export function InviteWelcomeFlow({ workspaceId, workspaceName, inviterName, role, roleLabel, userName }: Props) {
  const reduced = useReducedMotion() ?? false;
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const firstName = userName.split(" ")[0] || userName;

  const finish = (target: "overview" | "quote") => start(() => finishInviteWelcomeAction(workspaceId, target));

  const variants = reduced
    ? { enter: { opacity: 1, y: 0 }, center: { opacity: 1, y: 0 }, exit: { opacity: 1, y: 0 } }
    : {
        enter: { opacity: 0, y: 24 },
        center: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE } },
        exit: { opacity: 0, y: -16, transition: { duration: 0.28, ease: EASE } },
      };

  return (
    <main className="ob-setup ob-invite">
      <header className="ob-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="CTRL Quotes" width={126} height={28} />
        <div
          className="ob-progress ob-progress-3"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEP_COUNT}
          aria-valuenow={step + 1}
          aria-label={`Passo ${step + 1} di ${STEP_COUNT}`}
        >
          {Array.from({ length: STEP_COUNT }, (_, index) => (
            <span key={index} className={index <= step ? "is-on" : undefined} />
          ))}
        </div>
        <p className="ob-step-label">Passo {step + 1} di {STEP_COUNT}</p>
      </header>

      <AnimatePresence mode="wait" initial={!reduced}>
        <motion.section key={step} className="ob-panel" initial="enter" animate="center" exit="exit" variants={variants}>
          <p className="ob-kicker">{workspaceName}</p>

          {step === 0 ? (
            <>
              <h1>Ciao {firstName}, sei nel team</h1>
              <p className="lede">
                {inviterName ? (
                  <>
                    <strong>{inviterName}</strong> ti ha invitato in <strong>{workspaceName}</strong> con il ruolo di{" "}
                    <strong>{roleLabel}</strong>.
                  </>
                ) : (
                  <>
                    Sei entrato in <strong>{workspaceName}</strong> con il ruolo di <strong>{roleLabel}</strong>.
                  </>
                )}{" "}
                Brand, template e impostazioni sono già pronti: non devi configurare niente.
              </p>
              <div className="ob-invite-card">
                <ShieldCheck size={20} aria-hidden="true" />
                <div>
                  <strong>Come {roleLabel.toLowerCase()} puoi</strong>
                  <ul>
                    {roleCan[role].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="field-hint">{roleCannot[role]}</p>
                </div>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h1>Come funziona Quotes</h1>
              <p className="lede">Tutto quello che crei resta nel workspace ed è visibile al resto del team.</p>
              <ul className="ob-invite-grid">
                <li>
                  <FileText size={20} aria-hidden="true" />
                  <strong>Preventivi</strong>
                  <span>Sezioni e righe nell&apos;editor, totali e IVA calcolati da soli, anteprima e PDF.</span>
                </li>
                <li>
                  <Users size={20} aria-hidden="true" />
                  <strong>Clienti</strong>
                  <span>La rubrica del workspace, con contatti e note, pronta da collegare al preventivo.</span>
                </li>
                <li>
                  <Package size={20} aria-hidden="true" />
                  <strong>Catalogo</strong>
                  <span>Servizi e pacchetti con il loro prezzo, da inserire nel preventivo senza riscriverli.</span>
                </li>
                <li>
                  <Palette size={20} aria-hidden="true" />
                  <strong>Template</strong>
                  <span>I preventivi escono già con logo, colori e stile del brand di {workspaceName}.</span>
                </li>
              </ul>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1>Invia e segui le risposte</h1>
              <p className="lede">Quando il preventivo è pronto lo mandi al cliente con un link.</p>
              <ul className="ob-invite-grid ob-invite-grid-2">
                <li>
                  <Send size={20} aria-hidden="true" />
                  <strong>Un link per il cliente</strong>
                  <span>Lo invii da Quotes oppure copi il link e lo mandi come preferisci. Il cliente lo apre dal browser, senza account, e può scaricare il PDF.</span>
                </li>
                <li>
                  <Bell size={20} aria-hidden="true" />
                  <strong>Accettato o rifiutato</strong>
                  <span>Il cliente accetta o rifiuta dalla pagina del preventivo. Nelle notifiche vedi quando lo apre e quando risponde.</span>
                </li>
              </ul>
              <p className="ob-quote-lead">Se hai dubbi, nella barra laterale trovi Aiuto e Supporto con guide e domande frequenti.</p>
            </>
          ) : null}

          <div className="ob-actions">
            {step < STEP_COUNT - 1 ? (
              <>
                <button type="button" className="btn-ghost" disabled={pending} onClick={() => finish("overview")}>
                  Salta e entra
                </button>
                {step > 0 ? (
                  <button type="button" className="btn-secondary" disabled={pending} onClick={() => setStep(step - 1)}>
                    Indietro
                  </button>
                ) : null}
                <button type="button" className="btn-primary" disabled={pending} onClick={() => setStep(step + 1)}>
                  Continua
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" disabled={pending} onClick={() => setStep(step - 1)}>
                  Indietro
                </button>
                <button type="button" className="btn-ghost" disabled={pending} onClick={() => finish("quote")}>
                  Crea un preventivo
                </button>
                <button type="button" className="btn-primary" disabled={pending} onClick={() => finish("overview")}>
                  Entra in {workspaceName}
                </button>
              </>
            )}
          </div>
        </motion.section>
      </AnimatePresence>
    </main>
  );
}
