"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Play, X } from "lucide-react";

const CHAPTERS = [
  { time: 0, stamp: "0:00", label: "Overview" },
  { time: 12, stamp: "0:12", label: "Impostazioni e Fatturazione B2B" },
  { time: 50, stamp: "0:50", label: "Clienti e Catalogo" },
  { time: 61, stamp: "1:01", label: "Template" },
  { time: 84, stamp: "1:24", label: "Nuovo preventivo" },
  { time: 113, stamp: "1:53", label: "Editor del PDF e grafici" },
  { time: 184, stamp: "3:04", label: "Anteprima e invio" },
  { time: 197, stamp: "3:17", label: "Firma e dati di fatturazione" },
  { time: 231, stamp: "3:51", label: "Fattura e pagamento" },
  { time: 273, stamp: "4:33", label: "Piani e abbonamento" },
  { time: 311, stamp: "5:11", label: "Workspace e Aiuto" },
] as const;

const POSTER = "/videos/ctrl-quotes-tutorial-poster.webp";
const SRC = "/videos/ctrl-quotes-tutorial.mp4";

function chapterIndexAt(seconds: number): number {
  let index = 0;
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (seconds + 0.05 >= CHAPTERS[i].time) index = i;
  }
  return index;
}

function stopPlayback(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  video.currentTime = 0;
}

/** Compact /app/help trigger card; the player opens in a contained lightbox. */
export function HelpTutorialCard() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const scroller = document.querySelector("main.page") as HTMLElement | null;
    const prevBody = document.body.style.overflow;
    const prevPage = scroller?.style.overflow ?? "";
    document.body.style.overflow = "hidden";
    if (scroller) scroller.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      if (scroller) scroller.style.overflow = prevPage;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setActive(chapterIndexAt(video.currentTime));
    video.addEventListener("timeupdate", sync);
    video.addEventListener("seeked", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("seeked", sync);
    };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!dialog.open) return;
      const bounds = dialog.getBoundingClientRect();
      const outside =
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom;
      if (outside) dialog.close();
    };
    dialog.addEventListener("pointerdown", onPointerDown);
    return () => dialog.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function close() {
    stopPlayback(videoRef.current);
    setActive(0);
    setOpen(false);
  }

  function jump(index: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = CHAPTERS[index].time;
    setActive(index);
    void video.play();
  }

  return (
    <>
      <button
        type="button"
        className="hp-quick-card hp-quick-lime"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="hp-tutorial-thumb">
          <img src={POSTER} alt="" width={74} height={42} />
          <span className="hp-tutorial-play" aria-hidden="true">
            <span>
              <Play size={11} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        </span>
        <span className="hp-quick-body">
          <strong>
            Video tutorial <span className="hp-tutorial-dur">5:25</span>
          </strong>
          <span>Guarda il video tutorial</span>
        </span>
        <span className="hp-quick-arrow" aria-hidden="true">
          <ArrowRight size={16} />
        </span>
      </button>

      <dialog
        ref={dialogRef}
        className="hp-tutorial-dialog"
        aria-labelledby={titleId}
        closedby="any"
        onClose={close}
      >
        <div className="hp-tutorial-panel">
          <div className="hp-tutorial-dialog-head">
            <h2 id={titleId}>Video tutorial</h2>
            <button type="button" className="hp-tutorial-close" aria-label="Chiudi" onClick={close}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="hp-tutorial-frame">
            {open ? (
              <video
                ref={videoRef}
                controls
                autoPlay
                playsInline
                preload="metadata"
                poster={POSTER}
                src={SRC}
                aria-label="Video tutorial di CTRL Quotes"
              >
                Il tuo browser non supporta la riproduzione video.
              </video>
            ) : null}
          </div>
          <ol className="hp-tutorial-chapters">
            {CHAPTERS.map((chapter, index) => {
              const current = index === active;
              return (
                <li key={chapter.stamp}>
                  <button
                    type="button"
                    className={current ? "is-active" : undefined}
                    aria-current={current ? "true" : undefined}
                    aria-label={`Vai a ${chapter.stamp} ${chapter.label}`}
                    onClick={() => jump(index)}
                  >
                    <span className="hp-tutorial-stamp">{chapter.stamp}</span>
                    <span>{chapter.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </dialog>
    </>
  );
}
