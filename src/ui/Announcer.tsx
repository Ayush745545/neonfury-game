import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { bus } from '../game/eventBus';
import { useSettings } from '../config/settings';

/* Cinematic announcer typography (ROUND X / FIGHT! / K.O. / move names)
   and the full-screen impact flash. Driven by engine events + GSAP. */

export function Announcer() {
  const textRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const off = bus.on((e) => {
      if (e.type === 'announce') {
        const el = textRef.current;
        if (!el) return;
        tlRef.current?.kill();
        const style = e.style ?? 'round';
        const sideCls = style === 'big' && e.side !== undefined ? (e.side === 0 ? ' side-left' : ' side-right') : '';
        el.className = `announce-text announce-${style}${sideCls}`;
        el.textContent = e.text;
        if (style === 'big' && e.color) {
          el.style.color = '#fff';
          el.style.textShadow = `0 0 14px ${e.color}, 0 0 40px ${e.color}, 0 2px 0 rgba(0,0,0,0.6)`;
        } else {
          el.style.textShadow = '';
        }
        const tl = gsap.timeline();
        if (style === 'ko') {
          tl.fromTo(el,
            { opacity: 0, scale: 4.5, rotate: -6, filter: 'blur(14px)' },
            { opacity: 1, scale: 1, rotate: 0, filter: 'blur(0px)', duration: 0.42, ease: 'power4.out' })
            .to(el, { scale: 1.06, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: 1 })
            .to(el, { opacity: 0, scale: 1.35, filter: 'blur(8px)', duration: 0.5, ease: 'power2.in' });
        } else if (style === 'fight') {
          tl.fromTo(el,
            { opacity: 0, scale: 0.2, x: -140, filter: 'blur(10px)' },
            { opacity: 1, scale: 1, x: 0, filter: 'blur(0px)', duration: 0.3, ease: 'back.out(2)' })
            .to(el, { opacity: 0, scale: 2.1, filter: 'blur(10px)', duration: 0.45, delay: 0.35, ease: 'power2.in' });
        } else if (style === 'big') {
          tl.fromTo(el,
            { opacity: 0, y: 46, scale: 1.25, filter: 'blur(8px)' },
            { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.24, ease: 'power3.out' })
            .to(el, { opacity: 0, y: -30, duration: 0.4, delay: 0.5, ease: 'power2.in' });
        } else {
          tl.fromTo(el,
            { opacity: 0, scale: 1.7, letterSpacing: '26px', filter: 'blur(8px)' },
            { opacity: 1, scale: 1, letterSpacing: '10px', filter: 'blur(0px)', duration: 0.4, ease: 'power3.out' })
            .to(el, { opacity: 0, y: -26, duration: 0.45, delay: 0.7, ease: 'power2.in' });
        }
        tlRef.current = tl;
      } else if (e.type === 'flash') {
        const f = flashRef.current;
        if (!f) return;
        gsap.killTweensOf(f);
        f.style.background = e.color ?? '#ffffff';
        const cap = useSettings.getState().reduceFlashes ? 0.22 : 0.92;
        gsap.fromTo(f, { opacity: Math.min(cap, e.intensity) }, { opacity: 0, duration: 0.38 + e.intensity * 0.3, ease: 'power2.out' });
      }
    });
    return () => { off(); tlRef.current?.kill(); };
  }, []);

  return (
    <>
      <div className="announcer">
        <div ref={textRef} className="announce-text" />
      </div>
      <div ref={flashRef} className="flash-overlay" />
    </>
  );
}
