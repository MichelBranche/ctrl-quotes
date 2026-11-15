"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, useGSAP);

declare global {
  interface Window {
    __lpReady?: boolean;
  }
}

/**
 * All landing motion lives here: smooth scroll (Lenis), the hero entrance, scroll reveals, parallax,
 * the template fan, scrubbed words and the exit curtain before leaving for the app.
 * Markup is fully visible without JS; the hero is hidden only while `html.lp-motion` is set by the
 * inline boot script (which also bails out for prefers-reduced-motion and after a failsafe timeout).
 */
export function LandingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      window.__lpReady = true;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const html = document.documentElement;
      const q = gsap.utils.selector(el);

      // Exit curtain: same timing in every direction, also used with reduced motion (instant).
      const curtain = el.querySelector<HTMLElement>(".lp-curtain");
      const onLeave = (event: MouseEvent) => {
        const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[data-lp-leave]");
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (reduce || !curtain) return;
        event.preventDefault();
        gsap
          .timeline({ onComplete: () => window.location.assign(link.href) })
          .to(q(".lp-page"), { y: -60, duration: 0.6, ease: "power3.inOut" }, 0)
          .fromTo(curtain, { y: 0, yPercent: 100, visibility: "visible" }, { yPercent: 0, duration: 0.6, ease: "power3.inOut" }, 0);
      };
      el.addEventListener("click", onLeave);
      // Back/forward cache: never come back to a covered page.
      const onShow = (e: PageTransitionEvent) => {
        if (!e.persisted) return;
        gsap.set(q(".lp-page"), { clearProps: "all" });
        if (curtain) gsap.set(curtain, { yPercent: 100, visibility: "hidden" });
      };
      window.addEventListener("pageshow", onShow);

      if (reduce) {
        html.classList.remove("lp-motion");
        return () => {
          el.removeEventListener("click", onLeave);
          window.removeEventListener("pageshow", onShow);
        };
      }

      // Smooth scroll, driven by the GSAP ticker so ScrollTrigger stays in sync.
      const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 });
      lenis.on("scroll", ScrollTrigger.update);
      const raf = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
      const onAnchor = (event: MouseEvent) => {
        const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
        if (!link) return;
        const target = link.getAttribute("href");
        if (!target || target === "#") return;
        const node = document.querySelector(target);
        if (!node) return;
        event.preventDefault();
        lenis.scrollTo(node as HTMLElement, { offset: -12, duration: 1.2 });
        history.replaceState(null, "", target);
      };
      el.addEventListener("click", onAnchor);

      /* Hero entrance */
      const intro = gsap.timeline({ defaults: { ease: "expo.out" }, onStart: () => html.classList.remove("lp-motion") });
      intro
        .from(q(".lp-nav"), { y: -40, opacity: 0, duration: 0.9 }, 0)
        .from(q(".lp-hero-kicker"), { y: 20, opacity: 0, duration: 0.8 }, 0.1)
        .from(q(".lp-hero h1 .lp-line > span"), { yPercent: 110, duration: 1.1, stagger: 0.08 }, 0.12)
        .from(q(".lp-hero h1 .lp-mark"), { scale: 0.6, rotate: -10, opacity: 0, duration: 0.9, ease: "back.out(2)" }, 0.55)
        .from(q(".lp-hero-sub, .lp-hero-actions, .lp-hero-proof"), { y: 24, opacity: 0, duration: 0.9, stagger: 0.07 }, 0.45)
        .from(q(".lp-float"), { y: 120, opacity: 0, rotate: (i) => (i % 2 ? 14 : -14), duration: 1.3, stagger: 0.09 }, 0.3)
        .from(q(".lp-hero .lp-sticker, .lp-hero .lp-squiggle, .lp-hero .lp-badge"), { scale: 0, opacity: 0, duration: 0.8, stagger: 0.08, ease: "back.out(2.2)" }, 0.9);

      const mm = gsap.matchMedia();
      mm.add("(min-width: 900px)", () => {
        // Pointer parallax on the floating hero cards.
        const floats = q<HTMLElement>(".lp-float");
        const movers = floats.map((node) => {
          const depth = Number(node.dataset.depth ?? 1);
          return { x: gsap.quickTo(node, "x", { duration: 0.9, ease: "power3" }), y: gsap.quickTo(node, "y", { duration: 0.9, ease: "power3" }), depth };
        });
        const hero = el.querySelector<HTMLElement>(".lp-hero");
        const onMove = (e: PointerEvent) => {
          const nx = e.clientX / window.innerWidth - 0.5;
          const ny = e.clientY / window.innerHeight - 0.5;
          movers.forEach((m) => {
            m.x(nx * 26 * m.depth);
            m.y(ny * 20 * m.depth);
          });
        };
        hero?.addEventListener("pointermove", onMove);

        // Scroll: hero type sinks, cards drift apart.
        gsap.to(q(".lp-hero-copy"), { yPercent: 18, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".lp-hero", start: "top top", end: "bottom top", scrub: true } });
        gsap.to(q(".lp-hero-stage"), { yPercent: -10, ease: "none", scrollTrigger: { trigger: ".lp-hero", start: "top top", end: "bottom top", scrub: true } });

        // Template fan: covers spread out while the section is pinned.
        const covers = q<HTMLElement>(".lp-tpl-card");
        if (covers.length) {
          const mid = (covers.length - 1) / 2;
          gsap
            .timeline({ scrollTrigger: { trigger: ".lp-tpl", start: "top top", end: "+=900", scrub: 0.6, pin: true, anticipatePin: 1 } })
            .fromTo(
              covers,
              { xPercent: (i) => (mid - i) * 92, rotate: (i) => (i - mid) * 4, y: (i) => Math.abs(i - mid) * 18, scale: 0.86 },
              { xPercent: 0, rotate: (i) => (i - mid) * 2.5, y: (i) => Math.abs(i - mid) * 26, scale: 1, ease: "power2.out" },
              0,
            )
            .from(q(".lp-tpl-card figcaption"), { opacity: 0, y: 16, stagger: 0.05 }, 0.45);
        }
        return () => hero?.removeEventListener("pointermove", onMove);
      });

      /* Scroll reveals, batched so a row lands together. */
      const reveals = q<HTMLElement>("[data-reveal]");
      gsap.set(reveals, { y: 48, opacity: 0 });
      ScrollTrigger.batch(reveals, {
        start: "top 88%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 1, ease: "expo.out", stagger: 0.08, overwrite: true }),
      });

      // Big headings: line masks rise in.
      q<HTMLElement>("[data-split]").forEach((heading) => {
        gsap.from(heading.querySelectorAll(".lp-line > span"), {
          yPercent: 110,
          duration: 1.1,
          ease: "expo.out",
          stagger: 0.08,
          scrollTrigger: { trigger: heading, start: "top 85%", once: true },
        });
      });

      // Manifesto: words light up with the scroll.
      const words = q<HTMLElement>(".lp-manifesto .lp-word");
      if (words.length) {
        gsap.fromTo(
          words,
          { opacity: 0.14 },
          { opacity: 1, stagger: 0.05, ease: "none", scrollTrigger: { trigger: ".lp-manifesto", start: "top 75%", end: "bottom 55%", scrub: true } },
        );
      }

      // Hand-drawn strokes draw themselves.
      q<SVGPathElement>(".lp-draw path").forEach((path) => {
        const length = path.getTotalLength();
        gsap.fromTo(
          path,
          { strokeDasharray: length, strokeDashoffset: length },
          { strokeDashoffset: 0, duration: 1.4, ease: "power2.out", scrollTrigger: { trigger: path, start: "top 85%", once: true } },
        );
      });

      // Chart bars grow from the baseline.
      gsap.from(q(".lp-chart-bar"), {
        scaleY: 0,
        transformOrigin: "50% 100%",
        duration: 1.1,
        ease: "expo.out",
        stagger: 0.05,
        scrollTrigger: { trigger: ".lp-chart", start: "top 85%", once: true },
      });

      // Generic parallax helpers.
      q<HTMLElement>("[data-speed]").forEach((node) => {
        const speed = Number(node.dataset.speed);
        gsap.to(node, { yPercent: speed * -30, ease: "none", scrollTrigger: { trigger: node.parentElement ?? node, start: "top bottom", end: "bottom top", scrub: true } });
      });

      // Marquee: scroll velocity briefly skews the bands.
      const bands = q<HTMLElement>(".lp-band-track");
      const skew = gsap.quickTo(bands, "skewX", { duration: 0.5, ease: "power3" });
      ScrollTrigger.create({
        onUpdate: (self) => skew(gsap.utils.clamp(-8, 8, self.getVelocity() / -260)),
      });

      requestAnimationFrame(() => ScrollTrigger.refresh());

      return () => {
        el.removeEventListener("click", onLeave);
        el.removeEventListener("click", onAnchor);
        window.removeEventListener("pageshow", onShow);
        gsap.ticker.remove(raf);
        lenis.destroy();
        mm.revert();
        html.classList.remove("lp-motion");
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} className="lp">
      {children}
      <div className="lp-curtain" aria-hidden="true">
        <span>CTRL® Quotes</span>
      </div>
    </div>
  );
}

/** Runs before paint: hides the hero for its entrance, unless reduced motion. Failsafe after 3 s. */
export const landingBootScript = `(function(){try{var d=document.documentElement;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.classList.add('lp-motion');setTimeout(function(){if(!window.__lpReady)d.classList.remove('lp-motion')},3000)}catch(e){}})();`;
