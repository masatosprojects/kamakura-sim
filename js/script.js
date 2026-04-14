/* ============================================================
   KAMAKURA SIM — PORTAL JS
   Covers: language toggle, dynamic theme, scroll reveal,
           page transitions, particle canvas, modal system,
           and canvas micro-simulations (klupfel/tobler/herd).
   ============================================================ */

/* ── 0. Custom Cursor (runs on ALL pages) ───────────────────── */
(function () {
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    document.body.appendChild(cursor);
    window.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top  = e.clientY + 'px';
    });
    document.addEventListener('mouseover', (e) => {
        const el = e.target.closest('a, button, [data-clickable]');
        if (el) cursor.classList.add('hover');
        else cursor.classList.remove('hover');
    });
})();

/* ── 1. DOMContentLoaded block ─────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {


    /* Language Toggle — 6 languages */
    const LANGS = ['ja','en','zh','ko','es','fr'];
    window.setLang = window.toggleLang = function(lang) {
        document.body.classList.remove(...LANGS.map(l => 'lang-' + l));
        document.body.classList.add('lang-' + lang);
        
        // Update all .lang-switcher and .lang-toggle-wrap buttons
        document.querySelectorAll('.lang-switcher [data-lang], .lang-toggle[data-lang], .lang-btn-contact [data-lang]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
        });
        
        // Also handle legacy onclick-based toggles
        document.querySelectorAll('.lang-toggle:not([data-lang])').forEach(btn => {
            const onclick = btn.getAttribute('onclick') || '';
            btn.classList.toggle('active', onclick.includes("'" + lang + "'") || onclick.includes('"' + lang + '"'));
        });
        
        try { localStorage.setItem('kamakura_lang', lang); } catch(e) {}
    };

    // Restore saved language
    try {
        const saved = localStorage.getItem('kamakura_lang');
        if (saved && LANGS.includes(saved)) {
            window.setLang(saved);
        } else {
            // Default to Japanese explicitly to sync UI states
            window.setLang('ja');
        }
    } catch(e) {
        window.setLang('ja');
    }

    /* Global Hamburger Nav Logic */
    const hamburger = document.getElementById('hamburger');
    const overlayNav = document.getElementById('overlay-nav');
    if (hamburger && overlayNav) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('open');
            overlayNav.classList.toggle('active');
        });
        // Close menu when clicking links
        overlayNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('open');
                overlayNav.classList.remove('active');
            });
        });
    }

    /* Dynamic Theme via scroll */
    const panels = document.querySelectorAll('.pad-panel');
    const themeObs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const theme = entry.target.getAttribute('data-theme');
                if (theme) {
                    document.body.classList.remove('theme-dark', 'theme-light', 'theme-accent');
                    document.body.classList.add(theme);
                }
            }
        });
    }, { rootMargin: '-40% 0px -60% 0px', threshold: 0 });
    panels.forEach(p => themeObs.observe(p));

    /* Scroll Reveal (.gsap-reveal) */
    const reveals = document.querySelectorAll('.gsap-reveal');
    const revealObs = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });
    reveals.forEach(el => revealObs.observe(el));

    /* Immediately reveal elements already in viewport */
    setTimeout(() => {
        reveals.forEach(el => {
            if (el.getBoundingClientRect().top <= window.innerHeight) {
                el.classList.add('visible');
            }
        });
    }, 100);

    /* Launch button hover class */
    const launchBtn = document.getElementById('launch-btn');
    if (launchBtn) {
        launchBtn.addEventListener('mouseenter', () => document.body.classList.add('btn-hovered'));
        launchBtn.addEventListener('mouseleave', () => document.body.classList.remove('btn-hovered'));
    }

    /* Active nav link */
    const path = window.location.pathname;
    document.querySelectorAll('.navbar .nav-links a, .nav .nav-links a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const aName = href.split('/').pop().replace('.html', '');
        const pName = path.split('/').pop().replace('.html', '');
        if (aName && pName && (aName === pName || href.endsWith(path.split('/').pop()))) {
            a.classList.add('active');
        }
    });

    // Close any open panel on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.overlay-nav.active, .hamburger.open').forEach(el => el.classList.remove('active', 'open'));
            if (window.closePanel) {
                document.querySelectorAll('.slide-panel.open').forEach(p => window.closePanel(p.id));
            }
        }
    });
});


/* ── 2. Page Transition ─────────────────────────────────────── */
(function () {
    'use strict';
    const overlay = document.getElementById('page-transition');

    function navigateTo(url) {
        if (!overlay) { window.location.href = url; return; }
        overlay.classList.remove('entering');
        overlay.classList.add('leaving');
        // Fallback: always navigate after 700ms even if animationend doesn't fire
        const timer = setTimeout(() => { window.location.href = url; }, 700);
        overlay.addEventListener('animationend', () => {
            clearTimeout(timer);
            window.location.href = url;
        }, { once: true });
    }

    document.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('http') ||
            href.startsWith('//') || a.target === '_blank') return;
        e.preventDefault();
        navigateTo(href);
    });

    window.addEventListener('pageshow', (e) => {
        if (!overlay) return;
        if (e.persisted) overlay.classList.remove('leaving');
        overlay.classList.add('entering');
        // Fallback: always remove entering class after 800ms
        const timer = setTimeout(() => overlay.classList.remove('entering'), 800);
        overlay.addEventListener('animationend', () => {
            clearTimeout(timer);
            overlay.classList.remove('entering');
        }, { once: true });
    });
})();


/* ── 3. Particle Canvas ─────────────────────────────────────── */
(function () {
    'use strict';
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles = [];
    const COUNT = 70;
    let mouse = { x: -9999, y: -9999 };

    function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function spawn() {
        return { x: rand(0, W), y: rand(0, H), vx: rand(-0.15, 0.15), vy: rand(-0.18, -0.04),
                 r: rand(0.8, 2.2), a: rand(0.1, 0.5), life: rand(0, 1) };
    }
    function init() { particles = Array.from({ length: COUNT }, spawn); }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        particles.forEach((p, i) => {
            const dx = p.x - mouse.x, dy = p.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 100) { p.vx += (dx / dist) * 0.04; p.vy += (dy / dist) * 0.04; }
            p.x += p.vx; p.y += p.vy; p.life += 0.004;
            const alpha = p.a * Math.sin(p.life * Math.PI);
            if (p.life >= 1 || p.y < -10 || p.x < -10 || p.x > W + 10) {
                particles[i] = spawn(); particles[i].y = H + rand(0, 20); return;
            }
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${Math.max(0, alpha)})`; ctx.fill();
        });
        requestAnimationFrame(draw);
    }

    window.addEventListener('resize', () => { resize(); init(); });
    window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    resize(); init(); draw();
})();


/* ── 4. Modal System ────────────────────────────────────────── */
let _modalAnimId = null;

window.openModal = function (type) {
    const modal = document.getElementById('main-modal');
    const body  = document.getElementById('modal-body');
    if (!modal || !body) return;

    const tmplMap = {
        'modal-klupfel': 'tmpl-klupfel',
        'modal-tobler':  'tmpl-tobler',
        'modal-herd':    'tmpl-herd',
    };
    const tmpl = document.getElementById(tmplMap[type]);
    if (!tmpl) return;

    if (_modalAnimId) { cancelAnimationFrame(_modalAnimId); _modalAnimId = null; }
    body.innerHTML = '';
    body.appendChild(tmpl.content.cloneNode(true));
    modal.classList.add('active');

    setTimeout(() => {
        if (type === 'modal-klupfel') _startKlupfel();
        if (type === 'modal-tobler')  _startTobler();
        if (type === 'modal-herd')    _startHerd();
    }, 120);
};

window.closeModal = function (e) {
    if (e && e.target && e.target.closest) {
        const inside = e.target.closest('.modal-content');
        if (inside && !e.target.classList.contains('close-btn')) return;
    }
    const modal = document.getElementById('main-modal');
    if (modal) modal.classList.remove('active');
    if (_modalAnimId) { cancelAnimationFrame(_modalAnimId); _modalAnimId = null; }
};


/* ── 5. Canvas Micro-Simulations ────────────────────────────── */

/* === A: Congestion Deadlock (Klupfel) === */
function _startKlupfel() {
    const canvas = document.getElementById('canvas-klupfel');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const W = canvas.width, H = canvas.height;
    const wallX  = W / 2;
    const gapTop = H / 2 - 35;
    const gapBot = H / 2 + 35;

    let dots = [];
    for (let i = 0; i < 65; i++) {
        dots.push({ x: Math.random() * W * 0.3, y: Math.random() * H, speed: 2.5 + Math.random() });
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(wallX, 0, 20, gapTop);
        ctx.fillRect(wallX, gapBot, 20, H - gapBot);

        let inBottle = 0;
        dots.forEach(d => { if (d.x > wallX - 50 && d.x < wallX + 50) inBottle++; });
        const df = Math.max(0.05, 1.0 - inBottle / 25);

        dots.forEach(d => {
            let cs = d.speed;

            if (d.x > wallX - 100 && d.x < wallX + 20) {
                cs *= df;
                if (d.y < gapTop + 10) d.y += 1.2 * df;
                if (d.y > gapBot  - 10) d.y -= 1.2 * df;
            }

            if (d.x + 6 + cs > wallX && d.x - 6 < wallX + 20) {
                if (d.y < gapTop || d.y > gapBot) {
                    cs = 0; d.x = wallX - 6;
                    if (d.y < gapTop) d.y += Math.random() * 2;
                    if (d.y > gapBot) d.y -= Math.random() * 2;
                }
            }

            d.x += cs;
            if (d.x > W + 15) { d.x = -15; d.y = Math.random() * H; }

            ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, Math.PI * 2);
            const r = Math.floor(255 * (1 - cs / d.speed));
            const g = Math.floor(150 * (cs / d.speed));
            ctx.fillStyle = `rgb(${r},${g},200)`;
            ctx.fill();
        });

        _modalAnimId = requestAnimationFrame(draw);
    }
    draw();
}

/* === B: Terrain Slope (Tobler) === */
function _startTobler() {
    const canvas = document.getElementById('canvas-tobler');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const W = canvas.width, H = canvas.height;
    let x = 0;
    const getY = t => H / 2 + Math.sin(t * 0.01) * 80 - t * 0.05;

    function draw() {
        ctx.clearRect(0, 0, W, H);

        ctx.beginPath();
        for (let i = 0; i < W; i += 5) ctx.lineTo(i, getY(i));
        ctx.lineTo(W, H); ctx.lineTo(0, H);
        ctx.fillStyle = '#2d3436'; ctx.fill();

        ctx.beginPath();
        for (let i = 0; i < W; i += 5) ctx.lineTo(i, getY(i));
        ctx.strokeStyle = '#636e72'; ctx.lineWidth = 4; ctx.stroke();

        const dy = getY(x + 1) - getY(x);
        let sm = Math.exp(-3.5 * Math.abs(dy / 5 + 0.05) + 0.175);
        sm = Math.max(0.2, sm);

        x += 1.8 * sm;
        if (x > W) x = 0;

        ctx.beginPath(); ctx.arc(x, getY(x) - 15, 15, 0, Math.PI * 2);
        ctx.fillStyle = dy < -0.5 ? '#e17055' : (dy > 0 ? '#74b9ff' : '#00b894');
        ctx.fill();

        ctx.fillStyle = '#dfe6e9';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`速度: ${(sm * 100).toFixed(0)}%`, Math.min(x - 35, W - 90), getY(x) - 38);

        _modalAnimId = requestAnimationFrame(draw);
    }
    draw();
}

/* === C: Herd Panic === */
function _startHerd() {
    const canvas = document.getElementById('canvas-herd');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const W = canvas.width, H = canvas.height;

    let dots = [];
    for (let i = 0; i < 70; i++) {
        dots.push({
            x: Math.random() * W, y: Math.random() * H,
            vx: (Math.random() - 0.5) * 2.5, vy: (Math.random() - 0.5) * 2.5,
            isPanic: false, isHerd: false
        });
    }
    const src = { x: 0, y: H / 2, vx: 5, vy: 0 };

    function draw() {
        ctx.clearRect(0, 0, W, H);

        src.x += src.vx;
        if (src.x > W + 50) {
            src.x = -50; src.y = Math.random() * H;
            dots.forEach(d => {
                d.isPanic = false; d.isHerd = false;
                d.vx = (Math.random() - 0.5) * 2.5;
                d.vy = (Math.random() - 0.5) * 2.5;
            });
        }

        ctx.beginPath(); ctx.arc(src.x, src.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#d63031'; ctx.fill();
        ctx.beginPath(); ctx.arc(src.x, src.y, 45, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(214,48,49,0.35)'; ctx.lineWidth = 2; ctx.stroke();

        dots.forEach(d => {
            if (Math.hypot(src.x - d.x, src.y - d.y) < 55) { d.isPanic = true; d.isHerd = true; }
            if (d.isHerd) {
                d.vx = d.vx * 0.9 + src.vx * 0.1;
                d.vy = d.vy * 0.9 + src.vy * 0.1;
                d.y  += (src.y - d.y) * 0.03;
            }
            d.x += d.vx; d.y += d.vy;
            if (d.x < 0 || d.x > W) d.vx *= -1;
            if (d.y < 0 || d.y > H) d.vy *= -1;

            ctx.beginPath(); ctx.arc(d.x, d.y, d.isPanic ? 8 : 6, 0, Math.PI * 2);
            ctx.fillStyle = d.isPanic ? '#d63031' : '#74b9ff'; ctx.fill();

            if (d.isHerd) {
                ctx.beginPath(); ctx.arc(d.x, d.y, 12, 0, Math.PI * 2);
                ctx.strokeStyle = '#fdcb6e'; ctx.lineWidth = 2; ctx.stroke();
            }
        });

        _modalAnimId = requestAnimationFrame(draw);
    }
    draw();
}
