"use client";

import { useEffect, useRef, useState } from "react";

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

function chapterIndexAt(seconds: number): number {
  let index = 0;
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (seconds + 0.05 >= CHAPTERS[i].time) index = i;
  }
  return index;
}

/** Native HTML5 player with chapter jump buttons for the CTRL Quotes tutorial. */
export function HelpTutorialPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setActive(chapterIndexAt(video.currentTime));
    video.addEventListener("timeupdate", sync);
    video.addEventListener("seeked", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("seeked", sync);
    };
  }, []);

  function jump(index: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = CHAPTERS[index].time;
    setActive(index);
    void video.play();
  }

  return (
    <section className="hp-tutorial card" id="video-tutorial" aria-labelledby="hp-tutorial-title">
      <div className="hp-tutorial-head">
        <h2 id="hp-tutorial-title">Video tutorial</h2>
        <p>Il tour completo di CTRL® Quotes: impostazioni, editor del PDF, fatturazione B2B e piani.</p>
      </div>
      <div className="hp-tutorial-frame">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          poster="/videos/ctrl-quotes-tutorial-poster.webp"
          src="/videos/ctrl-quotes-tutorial.mp4"
          aria-label="Video tutorial di CTRL Quotes"
        >
          Il tuo browser non supporta la riproduzione video.
        </video>
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
    </section>
  );
}
