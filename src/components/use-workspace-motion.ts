"use client";

import { useEffect, useRef, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function useWorkspaceMotion(root: RefObject<HTMLDivElement | null>, totalsKey: string, sectionKey: string) {
  const previousTotals = useRef<string | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      const header = element.querySelector<HTMLElement>(".workspace-header");
      const intro = element.querySelectorAll<HTMLElement>(".workspace-intro .section-kicker, .workspace-intro h1, .workspace-intro p:last-child");
      const progress = element.querySelector<HTMLElement>(".scroll-progress");

      if (header && intro.length) {
        gsap.timeline({ defaults: { ease: "power2.out" } })
          .from(header, { autoAlpha: 0, y: -12, duration: 0.55 })
          .from(intro, { autoAlpha: 0, y: 24, duration: 0.72, stagger: 0.1 }, "-=0.25");
      }

      for (const section of element.querySelectorAll<HTMLElement>(".money-dashboard, .workspace-grid, .secondary-section, .workspace-footer")) {
        gsap.from(section, {
          y: 26,
          duration: 0.7,
          ease: "power2.out",
          clearProps: "transform",
          scrollTrigger: { trigger: section, start: "top 92%", once: true },
        });
      }

      if (progress) {
        gsap.fromTo(progress, { scaleX: 0, transformOrigin: "left center" }, {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: document.documentElement, start: "top top", end: "bottom bottom", scrub: 0.35 },
        });
      }
    });

    return () => media.revert();
  }, [root]);

  useEffect(() => {
    const element = root.current;
    if (!element || !sectionKey) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      for (const section of element.querySelectorAll<HTMLElement>(".destination-section, .receipt-summary")) {
        gsap.from(section, {
          y: 22,
          duration: 0.65,
          ease: "power2.out",
          clearProps: "transform",
          scrollTrigger: { trigger: section, start: "top 92%", once: true },
        });
      }
      ScrollTrigger.refresh();
    });

    return () => media.revert();
  }, [root, sectionKey]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (previousTotals.current === null) {
      previousTotals.current = totalsKey;
      return;
    }
    if (previousTotals.current === totalsKey) return;
    previousTotals.current = totalsKey;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const metrics = element.querySelectorAll<HTMLElement>(".money-proceeds strong, .money-flow-grid strong");
    const tween = gsap.fromTo(metrics, { autoAlpha: 0.55, y: 8 }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.42,
      ease: "power2.out",
      stagger: 0.055,
      overwrite: "auto",
      clearProps: "transform,opacity,visibility",
    });
    return () => { tween.kill(); };
  }, [root, totalsKey]);
}
