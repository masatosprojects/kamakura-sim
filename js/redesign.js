/* ============================================================================
   KAMAKURA SIM — REDESIGN behaviour layer
   横スクロール(GSAP/Lenis)を使わない縦スクロール版の挙動。
   main.js の代替として、必要な機能だけを軽量に再実装する。
   ・openPanel / closePanel（+ canvasアニメ起動）
   ・上部バーのメニュー（モバイル: overlay-nav 開閉）
   ・ナビのスムーススクロール
   ・スクロールでふわっと（IntersectionObserver）
   ・ごく短い静かな冒頭演出（白ヴェールのフェード）
   ============================================================================ */
(function () {
  'use strict';

  // ---- デバイス判定（既存CSSのフックを維持） ----
  var isMobile = window.matchMedia('(max-width: 768px)').matches
    || /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  document.body.classList.add(isMobile ? 'is-mobile' : 'is-desktop');

  // ---- スライドパネル（READ MORE）---------------------------------------
  window.openPanel = function (id) {
    var p = document.getElementById(id);
    if (p) p.classList.add('open');
    if (id === 'panel-klupfel' && window.startKlupfel) window.startKlupfel();
    if (id === 'panel-tobler'  && window.startTobler)  window.startTobler();
    if (id === 'panel-herd'    && window.startHerd)    window.startHerd();
  };
  window.closePanel = function (id) {
    var p = document.getElementById(id);
    if (p) p.classList.remove('open');
  };
  // 念のため openModal 系も無害化（このページでは未使用だが将来差分対策）
  if (typeof window.openModal !== 'function') {
    window.openModal = function (id) { var p = document.getElementById(id); if (p) p.classList.add('open'); };
    window.closeModal = function (id) { var p = document.getElementById(id); if (p) p.classList.remove('open'); };
  }

  document.addEventListener('DOMContentLoaded', function () {

    // ---- 上部バーを生成（既存の行き先を再利用） --------------------------
    if (!document.querySelector('.rb-topbar')) {
      var bar = document.createElement('header');
      bar.className = 'rb-topbar';
      bar.innerHTML =
        '<a href="index.html" class="rb-brand">KAMAKURA&nbsp;SIM<span class="rb-dot">.</span></a>'
      + '<nav class="rb-links">'
      +   '<a href="#overview">OVERVIEW</a>'
      +   '<a href="#manifesto">MANIFESTO</a>'
      +   '<a href="#findings">FINDINGS</a>'
      +   '<a href="#portal">MODEL</a>'
      +   '<a href="simulator/portal.html">SIMULATOR</a>'
      +   '<a href="archive.html">ARCHIVE</a>'
      + '</nav>'
      + '<button class="rb-menu-btn" id="rb-menu-btn" aria-label="menu">MENU</button>';
      document.body.insertBefore(bar, document.body.firstChild);
    }

    // ---- 上部バー：メニュー開閉（モバイルは既存 overlay-nav を流用） -------
    var overlay = document.getElementById('overlay-nav');
    var menuBtn = document.getElementById('rb-menu-btn');
    if (menuBtn && overlay) {
      menuBtn.addEventListener('click', function () {
        overlay.classList.toggle('active');
        document.body.classList.toggle('no-scroll');
      });
    }

    // ---- ナビ（バー・オーバーレイ）スムーススクロール ---------------------
    function smoothNav(e) {
      var href = this.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return; // 別ページはそのまま
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      if (overlay) overlay.classList.remove('active');
      document.body.classList.remove('no-scroll');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    Array.prototype.forEach.call(
      document.querySelectorAll('.rb-links a, .overlay-nav a.nav-link, .nav-link'),
      function (a) { a.addEventListener('click', smoothNav); }
    );

    // ---- スクロールでふわっと（IntersectionObserver） --------------------
    var targets = document.querySelectorAll(
      '.ov-left, .ov-right .ov-cta-link, .ov-stats > div, '
      + '.manifesto-p, .results-headline, .results-grid, .rc, .paradox-box, '
      + '.tech-card, .tech-stream, .gate-btn, .ov-title, .ov-desc'
    );
    Array.prototype.forEach.call(targets, function (el, i) {
      el.classList.add('rb-fade');
      el.style.transitionDelay = (Math.min(i % 6, 5) * 0.05) + 's';
    });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('rb-in'); io.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      Array.prototype.forEach.call(targets, function (el) { io.observe(el); });
    } else {
      Array.prototype.forEach.call(targets, function (el) { el.classList.add('rb-in'); });
    }

    // ---- ごく短い静かな冒頭演出（白ヴェールのフェードアウト） -------------
    var veil = document.createElement('div');
    veil.setAttribute('aria-hidden', 'true');
    veil.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:#ffffff;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'transition:opacity .7s ease;opacity:1;pointer-events:none;';
    veil.innerHTML =
      '<span style="font-weight:900;letter-spacing:.04em;font-size:1.1rem;color:#16181d;'
      + 'font-family:\'Noto Sans JP\',sans-serif;">KAMAKURA&nbsp;SIM<span style="color:#ff4d00;">.</span></span>';
    document.body.appendChild(veil);
    window.setTimeout(function () {
      veil.style.opacity = '0';
      window.setTimeout(function () { if (veil.parentNode) veil.parentNode.removeChild(veil); }, 760);
    }, 520);

    // ---- 旧儀式画面が万一表示されても消す ---------------------------------
    var ritual = document.getElementById('ritual-screen');
    if (ritual) ritual.style.display = 'none';
  });
})();
