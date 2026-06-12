"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const IMAGES = [
  "/carousel/Breathtaking-Cosmic-Nebula.png",
  "/carousel/Celestial-Nebula.png",
  "/carousel/Majestic-Space-Nebula.png",
  "/carousel/Starry-Night-Sky-with%20the-Milky-Way.png",
  "/carousel/Serene-Night-Sky.png",
];

const HOLD_SECONDS = 8;
const FADE_SECONDS = 2.2;

export function AuthBackgroundCarousel() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const slides = gsap.utils.toArray<HTMLElement>(".carousel-slide");
      if (slides.length === 0) return;

      // Start: first slide visible, rest hidden.
      gsap.set(slides, { autoAlpha: 0, scale: 1, filter: "blur(14px)" });
      gsap.set(slides[0], { autoAlpha: 1, scale: 1.06, filter: "blur(0px)" });

      const tl = gsap.timeline({ repeat: -1 });

      slides.forEach((_, index) => {
        const current = slides[index];
        const next = slides[(index + 1) % slides.length];

        // Slow Ken Burns drift on the visible slide during its hold.
        tl.to(
          current,
          { scale: 1.12, duration: HOLD_SECONDS + FADE_SECONDS, ease: "none" },
          "+=0",
        );

        // Crossfade: next blurs in + scales up while current blurs out.
        const fadeAt = `-=${FADE_SECONDS}`;
        tl.set(next, { scale: 1.02 }, fadeAt);
        tl.to(
          next,
          {
            autoAlpha: 1,
            scale: 1.06,
            filter: "blur(0px)",
            duration: FADE_SECONDS,
            ease: "power2.inOut",
          },
          fadeAt,
        );
        tl.to(
          current,
          {
            autoAlpha: 0,
            filter: "blur(14px)",
            duration: FADE_SECONDS,
            ease: "power2.inOut",
          },
          fadeAt,
        );
      });
    },
    { scope: containerRef },
  );

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 -z-10 overflow-hidden bg-black"
    >
      {IMAGES.map((src, index) => (
        <div
          key={src}
          aria-hidden
          className="carousel-slide absolute inset-0 will-change-[opacity,transform] [backface-visibility:hidden] [transform:translateZ(0)]"
        >
          <Image
            src={src}
            alt=""
            fill
            priority={index === 0}
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ))}

      {/* Legibility overlays: darken + subtle vignette so the glass card reads on any frame. */}
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
    </div>
  );
}
