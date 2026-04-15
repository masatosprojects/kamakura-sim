/**
 * Horizontal Scroll Glitch Portal Logic
 * Requires GSAP, GSAP ScrollTrigger, Lenis
 */

// ==========================================
// 1. Custom Cursor
// ==========================================
const cursor = document.createElement('div');
cursor.classList.add('custom-cursor');
document.body.appendChild(cursor);

window.addEventListener('mousemove', (e) => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});

// Hover effect for interactive elements
const interactives = document.querySelectorAll('a, button, .clickable');
interactives.forEach(el => {
  el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
  el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
});

// ==========================================
// 1.5 Global Hamburger Nav Logic (Safe from CDN failures)
// ==========================================
const hamburger = document.getElementById('hamburger');
const overlayNav = document.getElementById('overlay-nav');
const navLinks = document.querySelectorAll('.nav-link');

if(hamburger && overlayNav) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    overlayNav.classList.toggle('active');
    document.body.classList.toggle('no-scroll');
  });

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      
      if(targetId && targetId.startsWith('#')) {
        e.preventDefault();
        hamburger.classList.remove('open');
        overlayNav.classList.remove('active');
        document.body.classList.remove('no-scroll');
        
        const targetEl = document.querySelector(targetId);
        if(targetEl) {
          if (window.lenis) {
            const isMobile = window.innerWidth <= 900;
            if(!isMobile) {
              const scrollXOffset = targetEl.offsetLeft;
              window.lenis.scrollTo(scrollXOffset);
            } else {
              window.lenis.scrollTo(targetEl);
            }
          } else {
            // Fallback if lenis is not ready
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    });
    link.addEventListener('mouseenter', () => cursor.classList.add('hover'));
    link.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
  });
}

// ==========================================
// 2. Scene 0: Ritual
//    Phase 1 (0–3.5s): Coordinate flood — canvas fills with lat/lon
//    Phase 2 (4–11s):  Evacuation sign appears; green particles expand to white-out
// ==========================================
const ritualScreen = document.getElementById('ritual-screen');
const progressBar  = document.getElementById('ritual-progress');
const skipBtn      = document.getElementById('skip-btn');
const ritualCanvas = document.getElementById('ritual-canvas');
const ritualImgEl  = document.getElementById('ritual-img');
let ritualComplete = false;
let ritualPhase    = 1; // 1 = coord flood, 2 = particles

const FLASH_DURATION   = 3500;
const BREATHE_DURATION = 7500;
const TOTAL_DURATION   = FLASH_DURATION + BREATHE_DURATION;

// SessionStorage: skip if seen this session
if (sessionStorage.getItem('KAMAKURA_RITUAL_DONE') === 'true') {
  ritualComplete = true;
  if (ritualScreen) ritualScreen.style.display = 'none';
  const video = document.querySelector('.hero-video-bg');
  if(video) video.play().catch(e => console.log('Autoplay blocked:', e));
  setTimeout(initExperience, 50);
}

// Canvas setup
const ctx = ritualCanvas ? ritualCanvas.getContext('2d') : null;
let w, h;
function resizeCanvas() {
  if (!ritualCanvas) return;
  w = ritualCanvas.width  = window.innerWidth;
  h = ritualCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---- Phase 1: Coordinate Flood ----
function drawPhase1() {
  if (ritualComplete || ritualPhase !== 1 || !ctx) return;

  // Slow decay → coordinates linger as ghostly trails
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(0, 0, w, h);

  // Draw 60–90 coordinate pairs per frame at random positions/sizes
  const count = 60 + Math.floor(Math.random() * 35);
  for (let i = 0; i < count; i++) {
    const x   = Math.random() * (w - 140);
    const y   = 24 + Math.random() * (h - 48);
    const lat = (35.26 + Math.random() * 0.10).toFixed(4);
    const lon = (139.46 + Math.random() * 0.13).toFixed(4);
    const sz  = Math.floor(7 + Math.random() * 30); // varied sizes for depth
    const a   = 0.10 + Math.random() * 0.90;

    ctx.font = `900 ${sz}px monospace`;
    ctx.fillStyle = `rgba(255,77,0,${a})`;
    ctx.fillText(lat, x, y);
    ctx.fillStyle = `rgba(210,210,210,${a * 0.55})`;
    ctx.fillText(lon, x, y + sz * 1.25);
  }
  requestAnimationFrame(drawPhase1);
}

// ---- Transition: flash-to-black ----
function fadeToBlack(ms, cb) {
  const steps = Math.round(ms / 16);
  let i = 0;
  (function step() {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, i / steps * 1.8)})`;
    ctx.fillRect(0, 0, w, h);
    if (++i <= steps) requestAnimationFrame(step);
    else { ctx.clearRect(0, 0, w, h); cb && cb(); }
  })();
}

// ---- Phase 2: Accelerating Breath ----
let p2Start = 0;

function startPhase2() {
  ritualPhase = 2;
  p2Start = Date.now();
  // Clear canvas — black background only
  if (ctx) ctx.clearRect(0, 0, w, h);
  // Hand off opacity/filter control to JS (remove CSS animation)
  if (ritualImgEl) {
    ritualImgEl.style.animation = 'none';
    ritualImgEl.style.opacity   = '0';
  }
  loopPhase2();
}

function loopPhase2() {
  if (ritualComplete) return;

  const elapsed = Date.now() - p2Start;
  const prog    = Math.min(1, elapsed / BREATHE_DURATION);

  // Frequency accelerates: 0.35 Hz → 3.5 Hz (quadratic ramp)
  const freq  = 0.35 + prog * prog * 3.15;
  // Accumulate total phase (integral of freq over time)
  // Approximate: phase ≈ 2π * ∫freq dt
  const phase = 2 * Math.PI * (0.35 * elapsed / 1000 + prog * prog * prog * 3.15 / 3);

  const sine = Math.sin(phase);

  // Base brightness rises over time; amplitude stays strong
  const base  = 0.08 + prog * 0.55;
  const amp   = 0.22 + prog * 0.18;
  const opac  = Math.max(0, Math.min(1, base + amp * sine));
  const bri   = 0.3 + prog * 1.3 + 0.35 * Math.max(0, sine);
  const blur  = Math.max(0, 3 * (1 - prog) + 1.5 * Math.max(0, -sine));
  const scale = 1 + 0.025 * sine;

  if (ritualImgEl) {
    ritualImgEl.style.opacity   = opac.toFixed(3);
    ritualImgEl.style.filter    = `brightness(${bri.toFixed(2)}) blur(${blur.toFixed(1)}px)`;
    ritualImgEl.style.transform = `translate(-50%,-52%) scale(${scale.toFixed(3)})`;
  }

  requestAnimationFrame(loopPhase2);
}

// Kick off Phase 1, schedule transition
if (!ritualComplete) {
  drawPhase1();
  setTimeout(() => {
    ritualPhase = 0; // stop phase1 loop
    fadeToBlack(480, startPhase2);
  }, FLASH_DURATION);
}

// ---- Timer + Skip ----
const ritualStart = Date.now();

function endRitual() {
  if (ritualComplete) return;
  ritualComplete = true;
  sessionStorage.setItem('KAMAKURA_RITUAL_DONE', 'true');
  
  const video = document.querySelector('.hero-video-bg');
  if(video) video.play().catch(e => console.log('Autoplay blocked:', e));

  if (ritualScreen) gsap.to(ritualScreen, {
    opacity: 0, duration: 1.2, ease: 'power2.in',
    onComplete: () => ritualScreen.remove()
  });
  initExperience();
}

if (skipBtn && !ritualComplete) skipBtn.addEventListener('click', endRitual);

function updateRitual() {
  if (ritualComplete) return;
  const elapsed = Date.now() - ritualStart;
  if (progressBar) progressBar.style.width = Math.min((elapsed / TOTAL_DURATION) * 100, 100) + '%';
  if (elapsed >= TOTAL_DURATION) endRitual();
  else requestAnimationFrame(updateRitual);
}
if (!ritualComplete) requestAnimationFrame(updateRitual);

// ==========================================
// 3. Main Experience (Lenis + GSAP)
// ==========================================
function initExperience() {
  // Lenis Smooth Scroll — vertical only; GSAP maps vertical → horizontal translateX
  window.lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smooth: true,
    mouseMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
    infinite: false,
  });

  // Keep GSAP ScrollTrigger in sync with Lenis scroll position
  lenis.on('scroll', ScrollTrigger.update);

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  gsap.registerPlugin(ScrollTrigger);

  // Map vertical scrolling to horizontal translating of .scroll-container (for desktop)
  const isMobile = window.innerWidth <= 900;
  const scrollContainer = document.querySelector('.scroll-container');
  
  if(!isMobile && scrollContainer) {
    // Horizontal scroll setup
    let totalWidth = scrollContainer.offsetWidth;
    
    gsap.to(scrollContainer, {
      x: () => -(totalWidth - window.innerWidth),
      ease: "none",
      scrollTrigger: {
        trigger: scrollContainer,
        pin: true,
        scrub: 1,
        end: () => "+=" + (totalWidth - window.innerWidth)
      }
    });
  }

  // Progress Bar mapping
  gsap.to('.progress-bar', {
    width: "100%",
    ease: "none",
    scrollTrigger: { scrub: 0.1 } // Global progress
  });

  // Scene 1: Hero Glitch text reveal
  const glitchChars = document.querySelectorAll('.glitch-char');
  if(glitchChars.length > 0) {
    gsap.to(glitchChars, {
      opacity: 1,
      y: 0,
      skewY: 0,
      filter: "blur(0px)",
      duration: 1,
      stagger: 0.1,
      ease: "power4.out"
    });
  }

  // Scene 2: 89,000 Parallax and loop
  const mainHugeNum = document.getElementById('main-huge-num');
  if(mainHugeNum) {
    // Loop digits
    setInterval(() => {
      const num = Math.floor(Math.random() * 999).toString().padStart(3, '0');
      mainHugeNum.innerText = `89,${num}`;
    }, 70);

    // Parallax
    gsap.to(mainHugeNum, {
      scale: isMobile ? 1.2 : 1.5,
      x: isMobile ? 50 : 200,
      scrollTrigger: {
        trigger: mainHugeNum.parentElement,
        containerAnimation: !isMobile ? ScrollTrigger.getAll()[0] : null,
        start: isMobile ? "top center" : "left center",
        end: isMobile ? "bottom top" : "right left",
        scrub: 1
      }
    });
  }

  // Scene 3: Manifesto Text assembly
  const manifestoLines = document.querySelectorAll('.manifesto-p');
  manifestoLines.forEach(line => {
    gsap.from(line, {
      opacity: 0,
      y: 100,
      rotationX: 90,
      transformOrigin: "0% 50% -50",
      ease: "back.out(1.7)",
      scrollTrigger: {
        trigger: line,
        containerAnimation: !isMobile ? ScrollTrigger.getAll()[0] : null,
        start: isMobile ? "top 90%" : "left 90%",
        end: isMobile ? "top 40%" : "left 40%",
        scrub: 1
      }
    });
  });

  // Scene 4 & Profile animations
  const techCards = document.querySelectorAll('.tech-card');
  techCards.forEach((card, i) => {
    gsap.from(card, {
      y: 100 + (i * 50),
      opacity: 0,
      scrollTrigger: {
        trigger: card,
        containerAnimation: !isMobile ? ScrollTrigger.getAll()[0] : null,
        start: isMobile ? "top 95%" : "left 90%",
        end: isMobile ? "top 60%" : "left 50%",
        scrub: 1
      }
    });
  });

  const techStreamSpans = document.querySelectorAll('.tech-stream span');
  if (techStreamSpans.length > 0) {
    gsap.to(techStreamSpans, {
      opacity: 1,
      x: 0,
      stagger: 0.2,
      scrollTrigger: {
        trigger: '.tech-stream',
        containerAnimation: !isMobile ? ScrollTrigger.getAll()[0] : null,
        start: isMobile ? "top 80%" : "left 80%",
      }
    });
  }

  // Final Gate Reverse background
  const gateBtn = document.getElementById('gate-btn');
  if(gateBtn) {
    gateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.add('glitch-flash');
      setTimeout(() => {
        window.location.href = 'https://masatosprojects.github.io/kamakura-sim/simulator/portal.html';
      }, 500);
    });
  }

  // Timeline Progress GSAP
  const tlFill = document.querySelector('.tl-line-fill');
  const tlWrap = document.querySelector('.timeline-wrap');
  if(tlFill && tlWrap) {
    gsap.to(tlFill, {
      width: "100%",
      ease: "none",
      scrollTrigger: {
        trigger: tlWrap,
        containerAnimation: !isMobile ? ScrollTrigger.getAll()[0] : null,
        start: "left left",
        end: "right right",
        scrub: 1
      }
    });
  }
}

// Global Panel Logic
window.openPanel = function(id) {
  const panel = document.getElementById(id);
  if(panel) panel.classList.add('open');
  
  // Start canvas animations if applicable
  if(id === 'panel-klupfel' && window.startKlupfel) window.startKlupfel();
  if(id === 'panel-tobler' && window.startTobler) window.startTobler();
  if(id === 'panel-herd' && window.startHerd) window.startHerd();
};
window.closePanel = function(id) {
  const panel = document.getElementById(id);
  if(panel) panel.classList.remove('open');
};

// --- GHOST CURSOR ANIMATION ---
function initGhostCursor() {
  const gateBtn = document.getElementById('gate-btn');
  if (!gateBtn) return;

  const ghost = document.createElement('div');
  ghost.className = 'ghost-cursor';
  gateBtn.parentElement.appendChild(ghost);

  function runAnimation() {
    // Reset position
    gsap.set(ghost, { opacity: 0, x: -100, y: 100 });

    const tl = gsap.timeline({
      repeat: -1,
      repeatDelay: 5,
      delay: 2
    });

    tl.to(ghost, {
      opacity: 1,
      duration: 0.5
    })
    .to(ghost, {
      x: gateBtn.offsetLeft + gateBtn.offsetWidth / 2,
      y: gateBtn.offsetTop + gateBtn.offsetHeight / 2,
      duration: 1.5,
      ease: "power2.inOut"
    })
    .add(() => {
      ghost.classList.add('clicking');
      // Trigger the CSS animation
      ghost.style.animation = 'ghost-click 1s ease-in-out';
    })
    .to(ghost, {
      duration: 1
    })
    .to(ghost, {
      opacity: 0,
      duration: 0.5,
      onComplete: () => {
        ghost.style.animation = 'none';
      }
    });
  }

  // Only run if the gate is in view or after a delay
  runAnimation();
}

// Ensure initGhostCursor is called after everything is ready
window.addEventListener('load', () => {
  initGhostCursor();
});
