/**
 * app.js — 鎌倉市 津波避難シミュレーター 静的ビューア
 *
 * ● Flask/API 不要。timelapse_data.json と analysis_data.json を
 *   fetch() またはファイルピッカーで読み込み全チャートを描画する。
 * ● Intersection Observer による Lazy Load:
 *   画面外のカードは描画せず、ビューポートに入った瞬間だけ描画する。
 * ● 各カードの「詳細表示」ボタンでモーダル拡大表示。
 */

'use strict';

// =====================================================================
// 状態
// =====================================================================
const State = {
  analysis: [],
  timelapse: null,
  activeTab: 'timeseries',
  chartInstances: {},   // id → Chart.js instance
  leafletMaps: {},      // id → Leaflet instance
  modalChart: null,     // モーダル内の Chart.js instance
  modalMap: null,       // モーダル内の Leaflet instance
  tl: {
    playing: false, stepIndex: 0, intervalId: null,
    steps: [], markers: null, chart: null, map: null,
    // 波前線オーバーレイ
    waveLayer: null,
    waveLabelLayer: null,
    // 実ノードデータ（T_map由来）
    waveNodes: null,      // [[lat, lon, T], ...] T昇順ソート済み
    waveArrivalBase: 840, // shore_arrival_time
    waveRenderer: null,   // L.canvas() renderer
  },
  // 津波パラメータ（スライダー由来）
  waveParams: {
    arrivalBase: 840,   // 基準到達時刻 [s] (timelapse.meta から取得)
    offset: 0,          // TSUNAMI_ARRIVAL_OFFSET [s]
    speedMult: 1.0,     // TSUNAMI_PROPAGATION_SPEED [倍]
    baseSpeedMs: 3.0,   // TSUNAMI_BASE_SPEED_MS [m/s]
    warnWindow: 120,    // WAVE_WARNING_WINDOW_S [s]
    overlayEnabled: true,
  },
};

// カード要素 → { item, id } のマッピング（WeakMap で GC フレンドリー）
const CardMeta = new WeakMap();

// =====================================================================
// Intersection Observer — Lazy Load エンジン
// =====================================================================
const lazyObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const card = entry.target;
    const meta = CardMeta.get(card);
    if (!meta || meta.rendered) return;

    // 観察を停止してチャートを描画
    lazyObserver.unobserve(card);
    meta.rendered = true;
    card.classList.remove('card-pending');

    // スケルトンを除去してラッパーを空にする
    const wrap = card.querySelector('.chart-wrap');
    if (wrap) wrap.innerHTML = '';

    renderChartInWrap(meta.item, meta.id, wrap ?? card, false);
  });
}, {
  // カードが画面の 150px 手前に来たら先読み開始
  rootMargin: '150px 0px',
  threshold: 0,
});

// =====================================================================
// ステータス / カテゴリ定義
// =====================================================================
const STATUS = {
  a: { label: '避難完了', color: '#3fb950', radius: 3 },
  e: { label: '避難中',   color: '#d29922', radius: 3 },
  w: { label: '待機中',   color: '#8b949e', radius: 2 },
  d: { label: '死亡',     color: '#f85149', radius: 3 },
};

const MAP_TYPES  = new Set(['map_heatmap', 'map_scatter', 'map_path']);
const DIST_TYPES = new Set(['scatter', 'histogram', 'box', 'violin', 'plotly_config']);
const TIME_KEYS  = ['推移', '時間', '遅延', '経過', '変化'];

function categorize(item) {
  if (MAP_TYPES.has(item.chart_type))  return 'spatial';
  if (DIST_TYPES.has(item.chart_type)) return 'distribution';
  if (item.chart_type === 'line')      return 'timeseries';
  if (TIME_KEYS.some(k => item.title.includes(k))) return 'timeseries';
  return 'attribute';
}

// =====================================================================
// 初期化
// =====================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupFileInputs();
  setupAutoLoad();
  setupModal();
  showEmptyState();
  
  // Trigger auto-load on start
  await runAutoLoad();
});

function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function setupFileInputs() {
  document.getElementById('file-analysis').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    setLoadStatus('loading', '📊 分析データを読み込み中…');
    try {
      State.analysis = JSON.parse(await file.text());
      onAnalysisLoaded();
    } catch (err) { setLoadStatus('error', `❌ ${err.message}`); }
  });

  document.getElementById('file-timelapse').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    setLoadStatus('loading', '🎬 タイムラプスを読み込み中…');
    try {
      State.timelapse = JSON.parse(await file.text());
      onTimelapseLoaded();
    } catch (err) { setLoadStatus('error', `❌ ${err.message}`); }
  });
}

function setupAutoLoad() {
  document.getElementById('btn-auto-load').addEventListener('click', runAutoLoad);
}

async function runAutoLoad() {
  setLoadStatus('loading', '⚡ 自動読み込み中…');
  let ok = 0;
  try {
    const r = await fetch('./data/analysis_data.json');
    if (r.ok) { State.analysis = await r.json(); onAnalysisLoaded(); ok++; }
  } catch (_) {}
  try {
    const r = await fetch('./data/timelapse_data.json');
    if (r.ok) { State.timelapse = await r.json(); onTimelapseLoaded(); ok++; }
  } catch (_) {}
  
  if (ok === 0)
    setLoadStatus('error', '❌ JSONファイルが見つかりません（data/フォルダに配置してください）');
  else if (ok === 1)
    setLoadStatus('', '⚠️ 一方のファイルのみ読み込まれました');
  else
    setLoadStatus('', '✅ 両ファイルの読み込み完了');
}

// =====================================================================
// モーダル
// =====================================================================
function setupModal() {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function openModal(item) {
  // 前回のモーダルチャートを破棄
  if (State.modalChart) { State.modalChart.destroy(); State.modalChart = null; }
  if (State.modalMap)   { State.modalMap.remove(); State.modalMap = null; }

  document.getElementById('modal-title').textContent = `No.${item.no}  ${item.title}`;
  document.getElementById('modal-desc').textContent  = item.description || '';

  const wrap = document.getElementById('modal-chart-wrap');
  wrap.innerHTML = '';

  // モーダル内でチャートを描画（isModal=true で大きなサイズ指定）
  renderChartInWrap(item, 'modal', wrap, true);

  document.getElementById('modal-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.body.style.overflow = '';
  // 地図がある場合は次回のために状態をリセット
  if (State.modalMap) {
    State.modalMap.remove();
    State.modalMap = null;
  }
}

// =====================================================================
// データ読み込み後コールバック
// =====================================================================
function onAnalysisLoaded() {
  hideEmptyState();
  renderKPIBar();
  buildAllGrids();   // カード骨格を作成 → Observer 登録
  switchTab(State.activeTab); // アクティブタブを表示
  updateDataInfo();
  setLoadStatus('', `✅ 分析データ読み込み完了 (${State.analysis.length}項目)`);
}

function onTimelapseLoaded() {
  hideEmptyState();
  initTimelapseUI();
  updateDataInfo();
  setLoadStatus('', `✅ タイムラプス読み込み完了 (${State.timelapse.meta.steps.length}ステップ)`);
}

// =====================================================================
// タブ切り替え
// =====================================================================
function switchTab(tab) {
  State.activeTab = tab;

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.hidden = el.id !== `tab-${tab}`;
  });

  // Leaflet は hidden→表示切り替え後にサイズ再計算が必要
  if (tab === 'spatial' || tab === 'timelapse') {
    setTimeout(() => {
      Object.values(State.leafletMaps).forEach(m => m.invalidateSize());
    }, 60);
  }
}

// =====================================================================
// KPI バー
// =====================================================================
function renderKPIBar() {
  const kpis = State.analysis.filter(i => i.chart_type === 'kpi' && i.no <= 0);
  const strip = document.getElementById('kpi-strip');
  strip.innerHTML = '';
  kpis.forEach(item => {
    const d = item.chart_data || {};
    const div = document.createElement('div');
    div.className = 'kpi-card';
    div.innerHTML = `
      <div class="kpi-value" style="color:${d.color || '#58a6ff'}">${d.value ?? '—'}</div>
      <div class="kpi-label">${item.title}${d.label ? `<br><span>${d.label}</span>` : ''}</div>
    `;
    strip.appendChild(div);
  });
}

// =====================================================================
// グリッド構築（カード骨格 + Observer 登録）
// =====================================================================
function buildAllGrids() {
  const cats = { timeseries: [], attribute: [], distribution: [], spatial: [] };

  State.analysis.forEach(item => {
    // KPI バーに表示済みのものは除外
    if (item.chart_type === 'kpi' && item.no <= 0) return;
    const cat = categorize(item);
    if (cats[cat]) cats[cat].push(item);
  });

  Object.entries(cats).forEach(([cat, items]) => {
    const grid = document.getElementById(`grid-${cat}`);
    grid.innerHTML = '';
    items.forEach((item, idx) => {
      const id   = `chart-${cat}-${idx}`;
      const card = buildChartCard(item, id);
      grid.appendChild(card);
      // WeakMap に登録してから Observer で監視開始
      CardMeta.set(card, { item, id, rendered: false });
      lazyObserver.observe(card);
    });
  });
}

// =====================================================================
// チャートカード（骨格 + スケルトン）
// =====================================================================
function buildChartCard(item, id) {
  const isKpi = item.chart_type === 'kpi';
  const isMap = MAP_TYPES.has(item.chart_type);
  const rank  = item.rank || 'B';

  const card = document.createElement('div');
  card.className = [
    'chart-card',
    'card-pending',                      // Lazy Load 待機マーカー
    isKpi ? 'chart-card--kpi'  : '',
    isMap ? 'chart-card--map'  : '',
  ].filter(Boolean).join(' ');

  card.innerHTML = `
    <div class="chart-card-header">
      <div class="chart-card-title">No.${item.no} ${item.title}</div>
      <span class="chart-rank-badge rank-${rank}">${rank}</span>
    </div>
    ${item.description ? `<div class="chart-card-desc">${item.description}</div>` : ''}
    <div class="chart-wrap" id="wrap-${id}">
      <div class="skeleton-box"></div>
    </div>
    <div class="chart-card-footer">
      <button class="btn-detail" data-id="${id}">🔍 詳細表示</button>
    </div>
  `;

  // 詳細表示ボタン
  card.querySelector('.btn-detail').addEventListener('click', e => {
    e.stopPropagation();
    openModal(item);
  });

  return card;
}

// =====================================================================
// チャート描画ディスパッチャ（wrap 要素を直接受け取る共通版）
// =====================================================================
function renderChartInWrap(item, id, wrap, isModal) {
  const t = item.chart_type;
  const d = item.chart_data;
  const h = isModal ? 400 : 220;  // モーダルは大きく

  try {
    if      (t === 'kpi')                       renderKPI(d, wrap);
    else if (t === 'bar')                       renderBar(d, id, wrap, h, isModal);
    else if (t === 'line')                      renderLine(d, id, wrap, h, isModal);
    else if (t === 'pie' || t === 'doughnut')   renderPie(d, id, wrap, t, h, isModal);
    else if (t === 'scatter')                   renderScatter(d, id, wrap, h, isModal);
    else if (t === 'histogram')                 renderHistogram(d, id, wrap, h);
    else if (t === 'box' || t === 'violin')     renderBox(d, wrap);
    else if (t === 'map_heatmap' || t === 'map_scatter') renderMap(d, id, wrap, isModal);
    else if (t === 'map_path')                  renderMapPath(d, id, wrap, isModal);
    else if (t === 'sankey')                    renderSankey(d, wrap);
    else if (t === 'treemap')                   renderTreemapSimple(d, id, wrap, h);
    else if (t === 'plotly_config')             renderPlotlyFallback(d, id, wrap, h, isModal);
    else                                        wrapUnsupported(wrap, t);
  } catch (err) {
    wrapUnsupported(wrap, `${t} (${err.message})`);
  }
}

// ルーティング（Observer から呼ばれる通常版）
function renderChart(item, id) {
  const wrap = document.getElementById(`wrap-${id}`);
  if (!wrap) return;
  renderChartInWrap(item, id, wrap, false);
}

// =====================================================================
// KPI
// =====================================================================
function renderKPI(d, wrap) {
  wrap.innerHTML = `
    <div>
      <div class="kpi-big-value" style="color:${d.color || '#58a6ff'}">
        ${d.value ?? '—'}<span class="kpi-big-unit">${d.unit || ''}</span>
      </div>
      ${d.label ? `<div class="kpi-big-label">${d.label}</div>` : ''}
    </div>`;
}

// =====================================================================
// 棒グラフ
// =====================================================================
function renderBar(d, id, wrap, maxH, isModal) {
  const isH = d.orientation === 'h';
  const canvas = makeCanvas(wrap, maxH);
  const palette = ['#58a6ff','#3fb950','#f85149','#d29922','#bc8cff','#39d0d8'];

  const datasets = (d.datasets || []).map((ds, i) => ({
    ...ds,
    backgroundColor: ds.backgroundColor || palette[i % palette.length],
    borderWidth: ds.borderWidth ?? 0,
  }));

  const instance = new Chart(canvas, {
    type: 'bar',
    data: { labels: d.labels || [], datasets },
    options: {
      indexAxis: isH ? 'y' : 'x',
      responsive: true, maintainAspectRatio: !isModal,
      animation: { duration: isModal ? 400 : 0 },
      plugins: { legend: { labels: { color: '#8b949e', font: { size: 10 } } } },
      scales: {
        x: { stacked: d.barmode === 'stack', ticks: { color: '#8b949e', font: { size: isModal ? 11 : 9 } }, grid: { color: '#30363d' } },
        y: { stacked: d.barmode === 'stack', ticks: { color: '#8b949e', font: { size: isModal ? 11 : 9 } }, grid: { color: '#30363d' } },
      },
    },
  });

  // 二軸対応（生存率ライン）
  if ((d.datasets || []).some(ds => ds.yAxisID === 'y2')) {
    instance.options.scales.y2 = {
      type: 'linear', position: 'right',
      ticks: { color: '#d29922', font: { size: 10 } },
      grid: { drawOnChartArea: false },
    };
    instance.update();
  }

  if (isModal) State.modalChart = instance;
  else State.chartInstances[id] = instance;
}

// =====================================================================
// 折れ線グラフ
// =====================================================================
function renderLine(d, id, wrap, maxH, isModal) {
  const canvas = makeCanvas(wrap, maxH);
  const datasets = (d.datasets || []).map(ds => ({
    ...ds,
    tension: 0.3,
    pointRadius: (d.labels || []).length > 60 ? 0 : 2,
    fill: ds.fill ?? false,
  }));

  const instance = new Chart(canvas, {
    type: 'line',
    data: { labels: d.labels || [], datasets },
    options: {
      responsive: true, maintainAspectRatio: !isModal,
      animation: { duration: isModal ? 400 : 0 },
      plugins: { legend: { labels: { color: '#8b949e', font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 9 }, maxTicksLimit: 12 }, grid: { color: '#30363d' } },
        y: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#30363d' } },
      },
    },
  });

  if (isModal) State.modalChart = instance;
  else State.chartInstances[id] = instance;
}

// =====================================================================
// 円グラフ / ドーナツ
// =====================================================================
function renderPie(d, id, wrap, type, maxH, isModal) {
  const canvas = makeCanvas(wrap, maxH);
  const instance = new Chart(canvas, {
    type: type === 'doughnut' ? 'doughnut' : 'pie',
    data: d,
    options: {
      responsive: true, maintainAspectRatio: !isModal,
      animation: { duration: isModal ? 400 : 0 },
      plugins: {
        legend: {
          position: isModal ? 'bottom' : 'right',
          labels: { color: '#8b949e', font: { size: 10 }, boxWidth: 10, padding: 8 },
        },
      },
    },
  });

  if (isModal) State.modalChart = instance;
  else State.chartInstances[id] = instance;
}

// =====================================================================
// 散布図
// =====================================================================
function renderScatter(d, id, wrap, maxH, isModal) {
  const canvas = makeCanvas(wrap, maxH);
  const palette = ['#58a6ff','#f85149','#3fb950','#d29922'];
  const datasets = (d.datasets || []).map((ds, i) => ({
    label: ds.label || '',
    data: ds.data || [],
    backgroundColor: (ds.backgroundColor || palette[i % palette.length]) + 'cc',
    pointRadius: isModal ? 3 : 2,
  }));

  const instance = new Chart(canvas, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: !isModal,
      animation: { duration: isModal ? 400 : 0 },
      plugins: { legend: { labels: { color: '#8b949e', font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 9 } }, grid: { color: '#30363d' } },
        y: { ticks: { color: '#8b949e', font: { size: 9 } }, grid: { color: '#30363d' } },
      },
    },
  });

  if (isModal) State.modalChart = instance;
  else State.chartInstances[id] = instance;
}

// =====================================================================
// ヒストグラム（生データをビニング → 棒グラフ）
// =====================================================================
function renderHistogram(d, id, wrap, maxH) {
  const vals = d.x || [];
  if (!vals.length) { wrapUnsupported(wrap, 'データなし'); return; }

  const BINS = 20;
  const min = Math.min(...vals), max = Math.max(...vals);
  const step = (max - min) / BINS || 1;
  const counts = Array(BINS).fill(0);
  vals.forEach(v => { counts[Math.min(Math.floor((v - min) / step), BINS - 1)]++; });
  const labels = counts.map((_, i) => (min + i * step).toFixed(2));

  const canvas = makeCanvas(wrap, maxH);
  const instance = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: '件数', data: counts, backgroundColor: d.color || '#58a6ff', borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: true, animation: { duration: 0 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: '#30363d' } },
        y: { ticks: { color: '#8b949e', font: { size: 9 } }, grid: { color: '#30363d' } },
      },
    },
  });
  State.chartInstances[id] = instance;
}

// =====================================================================
// 箱ひげ図 / バイオリン（シンプル水平レンジ表示）
// =====================================================================
function renderBox(d, wrap) {
  const datasets = d.datasets || [];
  if (!datasets.length) { wrapUnsupported(wrap, 'データなし'); return; }

  let globalMin = Infinity, globalMax = -Infinity;
  const stats = datasets.map(ds => {
    const vals = (ds.data || []).map(Number).filter(v => !isNaN(v)).sort((a, b) => a - b);
    if (!vals.length) return null;
    const q = p => vals[Math.floor(p * (vals.length - 1))];
    const s = { min: vals[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: vals[vals.length - 1] };
    globalMin = Math.min(globalMin, s.min);
    globalMax = Math.max(globalMax, s.max);
    return { label: ds.label, ...s };
  }).filter(Boolean);

  const range = globalMax - globalMin || 1;
  const pct = v => ((v - globalMin) / range * 100).toFixed(1) + '%';

  const div = document.createElement('div');
  div.className = 'boxplot-wrap';
  stats.forEach(s => {
    const row = document.createElement('div');
    row.className = 'boxplot-row';
    row.innerHTML = `
      <div class="boxplot-label">${s.label}</div>
      <div class="boxplot-track">
        <div class="boxplot-bar" style="left:${pct(s.q1)};width:${pct(s.q3 - globalMin)}"></div>
        <div class="boxplot-median" style="left:${pct(s.median)}"></div>
      </div>
      <div class="boxplot-stats">中央値 ${s.median.toFixed(1)}<br>Q1-Q3 ${s.q1.toFixed(1)}〜${s.q3.toFixed(1)}</div>`;
    div.appendChild(row);
  });
  wrap.appendChild(div);
}

// =====================================================================
// 地図（ヒートマップ / スキャッター）
// =====================================================================
function renderMap(d, id, wrap, isModal) {
  const pts = d.points || [];
  if (!pts.length) { wrapUnsupported(wrap, '地図データなし'); return; }

  const mapDiv = document.createElement('div');
  mapDiv.className = 'chart-map';
  mapDiv.id = `leaflet-${id}`;
  wrap.appendChild(mapDiv);

  const centerLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const centerLon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;

  const map = L.map(mapDiv, { zoomControl: true, scrollWheelZoom: false })
    .setView([centerLat, centerLon], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { attribution: '© CartoDB', subdomains: 'abcd', maxZoom: 19 }).addTo(map);

  const [r, g, b, a] = d.color || [88, 166, 255, 180];
  const color = `rgba(${r},${g},${b},${(a || 180) / 255})`;

  // 最大 2000 点にダウンサンプリング
  const step = Math.ceil(pts.length / 2000) || 1;
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i];
    L.circleMarker([p.lat, p.lon],
      { radius: 3, color: 'transparent', fillColor: color, fillOpacity: 0.7, weight: 0 })
      .addTo(map);
  }

  if (isModal) State.modalMap = map;
  else State.leafletMaps[id] = map;
}

function renderMapPath(d, id, wrap, isModal) {
  const paths = d.paths || [];
  if (!paths.length) { wrapUnsupported(wrap, '軌跡データなし'); return; }

  const mapDiv = document.createElement('div');
  mapDiv.className = 'chart-map';
  mapDiv.id = `leaflet-${id}`;
  wrap.appendChild(mapDiv);

  const first = paths[0]?.path?.[0] || [139.55, 35.32];
  const map = L.map(mapDiv, { zoomControl: true, scrollWheelZoom: false })
    .setView([first[1], first[0]], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { attribution: '© CartoDB', subdomains: 'abcd', maxZoom: 19 }).addTo(map);

  const [r, g, b] = d.color || [255, 255, 0];
  paths.forEach(p => {
    if (!p.path || p.path.length < 2) return;
    L.polyline(p.path.map(([lon, lat]) => [lat, lon]),
      { color: `rgb(${r},${g},${b})`, weight: 1.5, opacity: 0.6 }).addTo(map);
  });

  if (isModal) State.modalMap = map;
  else State.leafletMaps[id] = map;
}

// =====================================================================
// サンキー（フロー一覧として表示）
// =====================================================================
function renderSankey(d, wrap) {
  const total  = (d.link_values || []).reduce((s, v) => s + v, 0) || 1;
  const labels = d.node_labels || [];
  const colors = d.node_colors || [];
  const div = document.createElement('div');
  div.className = 'sankey-simple';

  (d.link_sources || []).forEach((src, i) => {
    const val = d.link_values[i] || 0;
    const pct = Math.max(val / total * 100, 2);
    const row = document.createElement('div');
    row.className = 'sankey-row';
    row.innerHTML = `
      <span style="color:${colors[src]||'#58a6ff'};min-width:80px;font-size:11px;">${labels[src]||'?'}</span>
      <span style="color:#8b949e;font-size:10px;">→</span>
      <span style="color:${colors[d.link_targets[i]]||'#3fb950'};min-width:80px;font-size:11px;">${labels[d.link_targets[i]]||'?'}</span>
      <div class="sankey-bar" style="background:${colors[src]||'#58a6ff'};width:${pct}%;opacity:.8;">${val.toLocaleString()}</div>`;
    div.appendChild(row);
  });
  wrap.appendChild(div);
}

// =====================================================================
// ツリーマップ（横棒グラフで代替）
// =====================================================================
function renderTreemapSimple(d, id, wrap, maxH) {
  const canvas = makeCanvas(wrap, maxH);
  const palette = d.colors || ['#58a6ff','#3fb950','#f85149','#d29922','#bc8cff','#39d0d8'];
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: d.labels || [],
      datasets: [{
        label: '人数', data: d.values || [],
        backgroundColor: (d.labels || []).map((_, i) => palette[i % palette.length]),
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: true, animation: { duration: 0 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 9 } }, grid: { color: '#30363d' } },
        y: { ticks: { color: '#8b949e', font: { size: 9 } }, grid: { color: '#30363d' } },
      },
    },
  });
}

// =====================================================================
// plotly_config フォールバック（散布図として Chart.js で描画）
// =====================================================================
function renderPlotlyFallback(d, id, wrap, maxH, isModal) {
  if (!d.data || !d.data.length) { wrapUnsupported(wrap, 'データなし'); return; }
  const canvas = makeCanvas(wrap, maxH);
  const palette = ['#3fb950','#f85149','#58a6ff','#d29922'];
  const datasets = d.data.map((trace, i) => ({
    label: trace.name || `系列${i+1}`,
    data: (trace.x || []).map((x, j) => ({ x, y: (trace.y || [])[j] })),
    backgroundColor: (trace.marker?.color || palette[i % palette.length]) + 'aa',
    pointRadius: isModal ? 3 : 2,
  }));

  const instance = new Chart(canvas, {
    type: 'scatter', data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: !isModal,
      animation: { duration: isModal ? 400 : 0 },
      plugins: { legend: { labels: { color: '#8b949e', font: { size: 10 } } } },
      scales: {
        x: {
          ticks: { color: '#8b949e', font: { size: 9 } }, grid: { color: '#30363d' },
          title: { display: !!d.layout?.xaxis?.title, text: d.layout?.xaxis?.title || '', color: '#8b949e' },
        },
        y: {
          ticks: { color: '#8b949e', font: { size: 9 } }, grid: { color: '#30363d' },
          title: { display: !!d.layout?.yaxis?.title, text: d.layout?.yaxis?.title || '', color: '#8b949e' },
        },
      },
    },
  });
  if (isModal) State.modalChart = instance;
  else State.chartInstances[id] = instance;
}

// =====================================================================
// ユーティリティ
// =====================================================================
function makeCanvas(wrap, height = 220) {
  const canvas = document.createElement('canvas');
  canvas.style.maxHeight = height + 'px';
  wrap.appendChild(canvas);
  return canvas;
}

function wrapUnsupported(wrap, type) {
  wrap.innerHTML = `<div class="chart-unsupported">⚠️ 「${type}」はプレビュー非対応です</div>`;
}

function setLoadStatus(type, msg) {
  const el = document.getElementById('load-status');
  el.textContent = msg;
  el.className = 'load-status' + (type ? ' ' + type : '');
}

function hideEmptyState() {
  document.getElementById('empty-state').hidden = true;
  document.getElementById('loading-overlay').hidden = true;
}

function showEmptyState() {
  document.getElementById('empty-state').hidden = false;
  document.getElementById('loading-overlay').hidden = true;
}

function updateDataInfo() {
  const lines = [];
  if (State.analysis.length) lines.push(`📊 分析: ${State.analysis.length}項目`);
  if (State.timelapse) {
    const m = State.timelapse.meta;
    lines.push(`🎬 ${(m.total_agents || 0).toLocaleString()}人`);
    lines.push(`   ${m.steps?.length}ステップ / ${m.max_step}秒`);
  }
  document.getElementById('data-info').textContent = lines.join('\n');
}

// =====================================================================
// タイムラプス UI
// =====================================================================
function initTimelapseUI() {
  const tl = State.timelapse;
  if (!tl) return;

  State.tl.steps = tl.meta.steps;
  State.tl.stepIndex = 0;

  const slider = document.getElementById('tl-slider');
  slider.max   = State.tl.steps.length - 1;
  slider.value = 0;
  slider.addEventListener('input', () => {
    State.tl.stepIndex = parseInt(slider.value, 10);
    renderFrame(State.tl.steps[State.tl.stepIndex]);
  });

  initTimelapseMap();
  initWaveFront();          // 波前線データ初期化（mapより後）
  initTimelapseStatusChart();
  initTypeRates();
  initTsunamiParamsUI();

  document.getElementById('btn-play').addEventListener('click', playTimelapse);
  document.getElementById('btn-pause').addEventListener('click', pauseTimelapse);
  document.getElementById('btn-reset').addEventListener('click', resetTimelapse);

  document.getElementById('map-no-data').hidden = true;
  renderFrame(State.tl.steps[0]);
}

function initTimelapseMap() {
  if (State.tl.map) return;
  const map = L.map('timelapse-map', { zoomControl: true, scrollWheelZoom: true })
    .setView([35.3189, 139.5504], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { attribution: '© CartoDB', subdomains: 'abcd', maxZoom: 19 }).addTo(map);

  State.tl.map = map;
  State.tl.markers = L.layerGroup().addTo(map);

  // 波前線レイヤー（circle + label）
  State.tl.waveLayer = L.layerGroup().addTo(map);
  State.tl.waveLabelLayer = L.layerGroup().addTo(map);

  State.leafletMaps['timelapse'] = map;
}

function initTimelapseStatusChart() {
  const canvas = document.getElementById('tl-chart-status');
  const overlays = State.timelapse.overlays;
  const steps    = State.timelapse.meta.steps;
  const data     = steps.map(s => overlays[s] || {});

  State.tl.chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: steps,
      datasets: [
        { label: '完了', data: data.map(d => d.arrived    || 0), borderColor: '#3fb950', pointRadius: 0, tension: 0.3 },
        { label: '避難中', data: data.map(d => d.evacuating || 0), borderColor: '#d29922', pointRadius: 0, tension: 0.3 },
        { label: '死亡', data: data.map(d => d.dead        || 0), borderColor: '#f85149', pointRadius: 0, tension: 0.3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: '#8b949e', font: { size: 9 }, boxWidth: 8, padding: 4 } } },
      scales: {
        x: { ticks: { display: false }, grid: { color: '#30363d' } },
        y: { ticks: { color: '#8b949e', font: { size: 9 }, maxTicksLimit: 4 }, grid: { color: '#30363d' } },
      },
    },
  });
}

function initTypeRates() {
  const types = State.timelapse.meta.type_list || [];
  const container = document.getElementById('tl-type-rates');
  container.innerHTML = '';
  types.forEach(t => {
    const key = encodeType(t);
    const row = document.createElement('div');
    row.className = 'tl-type-rate-row';
    row.innerHTML = `
      <div class="tl-type-name" title="${t}">${t}</div>
      <div class="tl-type-bar-wrap"><div class="tl-type-bar-inner" id="bar-${key}" style="width:100%"></div></div>
      <div class="tl-type-pct" id="pct-${key}">100%</div>`;
    container.appendChild(row);
  });
}

function encodeType(t) { return t.replace(/[^a-zA-Z0-9]/g, '_'); }

// =====================================================================
// タイムラプス フレーム描画
// =====================================================================
function renderFrame(step) {
  const tl = State.timelapse;
  if (!tl) return;

  const overlay = tl.overlays[step] || {};
  const frame   = tl.frames[step]   || [];
  const schema  = tl.schema;

  // スタット更新
  document.getElementById('tl-arrived').textContent = (overlay.arrived    || 0).toLocaleString();
  document.getElementById('tl-evac').textContent    = (overlay.evacuating || 0).toLocaleString();
  document.getElementById('tl-wait').textContent    = (overlay.waiting    || 0).toLocaleString();
  document.getElementById('tl-dead').textContent    = (overlay.dead       || 0).toLocaleString();
  document.getElementById('tl-time-label').textContent = `${step}秒`;
  document.getElementById('tl-rate').textContent    = `生存率 ${overlay.survival_rate ?? '—'}%`;

  // 属性別生存率バー
  Object.entries(overlay.type_rates || {}).forEach(([t, rate]) => {
    const key = encodeType(t);
    const bar = document.getElementById(`bar-${key}`);
    const pct = document.getElementById(`pct-${key}`);
    if (bar) bar.style.width = rate + '%';
    if (pct) pct.textContent = rate + '%';
  });

  // 波前線オーバーレイ更新
  renderWaveFront(step);

  // マーカー更新（最大 3000 点）
  if (!State.tl.markers) return;
  State.tl.markers.clearLayers();

  const iLat = schema.indexOf('lat');
  const iLon = schema.indexOf('lon');
  const iS   = schema.indexOf('s');
  const skip = Math.ceil(frame.length / 3000) || 1;

  for (let i = 0; i < frame.length; i += skip) {
    const row = frame[i];
    const st  = STATUS[row[iS]] || STATUS['e'];
    L.circleMarker([row[iLat], row[iLon]], {
      radius: st.radius, color: 'transparent',
      fillColor: st.color, fillOpacity: 0.8, weight: 0,
    }).addTo(State.tl.markers);
  }
}

// =====================================================================
// タイムラプス 再生制御
// =====================================================================
function playTimelapse() {
  if (State.tl.playing) return;
  State.tl.playing = true;
  document.getElementById('btn-play').disabled  = true;
  document.getElementById('btn-pause').disabled = false;

  const speed  = parseInt(document.getElementById('tl-speed').value, 10);
  const slider = document.getElementById('tl-slider');

  State.tl.intervalId = setInterval(() => {
    if (State.tl.stepIndex >= State.tl.steps.length - 1) { pauseTimelapse(); return; }
    State.tl.stepIndex++;
    slider.value = State.tl.stepIndex;
    renderFrame(State.tl.steps[State.tl.stepIndex]);
  }, speed);
}

function pauseTimelapse() {
  State.tl.playing = false;
  clearInterval(State.tl.intervalId);
  document.getElementById('btn-play').disabled  = false;
  document.getElementById('btn-pause').disabled = true;
}

function resetTimelapse() {
  pauseTimelapse();
  State.tl.stepIndex = 0;
  document.getElementById('tl-slider').value = 0;
  if (State.tl.steps.length) renderFrame(State.tl.steps[0]);
}

// =====================================================================
// 波前線オーバーレイ（実ノード座標ベース）
// =====================================================================

/**
 * timelapse.meta.wave_data からノードリストを読み込んで State に格納する。
 * 動的津波モードのシミュレーションデータが存在する場合のみ有効。
 */
function initWaveFront() {
  const wd = State.timelapse?.meta?.wave_data;
  if (!wd?.nodes?.length) {
    console.log('[wave] wave_data なし → 簡易ラジアルモードで動作');
    return;
  }

  // nodes は T昇順ソート済み [[lat, lon, T], ...]
  State.tl.waveNodes       = wd.nodes;
  State.tl.waveArrivalBase = wd.shore_arrival_time ?? 840;

  // Leaflet Canvas renderer （SVGより大幅に高速）
  State.tl.waveRenderer = L.canvas({ padding: 0.2 });

  console.log(`[wave] 実ノードデータ読み込み完了: ${wd.nodes.length}ノード, 到達時刻=${wd.shore_arrival_time}秒`);
}

/**
 * シミュレーションステップ step での波前線を描画する。
 *
 * ● 実ノードデータがある場合: T_map 由来の正確な位置を表示
 *     - 浸水済みノード（T ≦ step）        : 半透明の赤点
 *     - 波前線ノード（step - warnWindow < T ≦ step）: 輝度グラデーションの青点
 *     - 到達直前ノード（step < T ≦ step + warnWindow / 2）: 橙点（警告帯）
 *
 * ● 実ノードデータがない場合: 簡易ラジアル近似にフォールバック
 *
 * @param {number} step - 現在のシミュレーション時刻 [s]
 */
function renderWaveFront(step) {
  const wl  = State.tl.waveLayer;
  const wll = State.tl.waveLabelLayer;
  if (!wl || !wll) return;

  wl.clearLayers();
  wll.clearLayers();

  if (!State.waveParams.overlayEnabled) return;

  if (State.tl.waveNodes?.length) {
    renderWaveFrontFromNodes(step, wl, wll);
  } else {
    renderWaveFrontRadial(step, wl, wll);
  }
}

/**
 * 実ノードデータを使った波前線描画。
 * What-If スライダー（offset / speedMult）は T値を再スケールして反映。
 */
function renderWaveFrontFromNodes(step, wl, wll) {
  const nodes    = State.tl.waveNodes;
  const wp       = State.waveParams;
  const renderer = State.tl.waveRenderer;
  const base     = State.tl.waveArrivalBase;

  // ── What-If T変換 ──────────────────────────────────────────────────
  // offset: 到達時刻シフト。speedMult: 伝播速度を再スケール
  //   effectiveT(T) = (base + offset) + (T - base) / speedMult
  // speedMult > 1 → 伝播が速い → 同じ距離に早く到達
  const effectiveT = (T) => (base + wp.offset) + (T - base) / wp.speedMult;

  const warnWindow   = wp.warnWindow;
  const approachWin  = warnWindow * 0.5; // 到達直前の警告帯幅 [s]

  let floodedCount = 0;
  let frontCount   = 0;

  for (const node of nodes) {
    const lat = node[0], lon = node[1], rawT = node[2];
    const T = effectiveT(rawT);

    if (T <= step) {
      // ── 浸水済み ────────────────────────────────────────────────
      // 波前線に近いほど明るい赤 / 古いほど暗く
      const age     = step - T;                       // 浸水後経過 [s]
      const fade    = Math.max(0.15, 1 - age / 600);  // 最低15%の不透明度
      L.circleMarker([lat, lon], {
        renderer,
        radius:      3,
        color:       'transparent',
        fillColor:   `rgba(248,81,73,${(fade * 0.55).toFixed(2)})`,
        fillOpacity: 1,
        weight:      0,
        interactive: false,
      }).addTo(wl);
      floodedCount++;

    } else if (T <= step + warnWindow) {
      // ── 波前線（到達直前）: 橙→シアンのグラデーション ────────────
      const remaining  = T - step;                              // 到達までの残り [s]
      const proximity  = 1 - remaining / warnWindow;           // 0(遠い) → 1(近い)

      // 近いほどシアン・遠いほど橙
      const r = Math.round(79  + (210 - 79)  * (1 - proximity));
      const g = Math.round(195 + (153 - 195) * (1 - proximity));
      const b = Math.round(247 + (34  - 247) * (1 - proximity));
      const alpha = 0.4 + proximity * 0.5;

      L.circleMarker([lat, lon], {
        renderer,
        radius:      remaining < approachWin ? 6 : 4,
        color:       `rgba(${r},${g},${b},${alpha.toFixed(2)})`,
        fillColor:   `rgba(${r},${g},${b},${(alpha * 0.6).toFixed(2)})`,
        fillOpacity: 1,
        weight:      remaining < approachWin ? 2 : 1,
        interactive: false,
      }).addTo(wl);
      frontCount++;
    }
    // warnWindow より先のノードは描画しない（パフォーマンス優先）
  }

  // ── ステータスラベル ────────────────────────────────────────────────
  const arrivalEff = base + wp.offset;
  let labelHtml;
  if (step < arrivalEff) {
    const remaining = arrivalEff - step;
    labelHtml = `<div class="wave-front-label">⏳ 到達まで ${remaining.toFixed(0)} 秒</div>`;
  } else {
    const elapsed = step - arrivalEff;
    labelHtml =
      `<div class="wave-front-label">` +
      `🌊 浸水 ${floodedCount.toLocaleString()} 点 | ` +
      `前線 ${frontCount} 点 | ` +
      `+${elapsed.toFixed(0)}s` +
      `</div>`;
  }
  const labelIcon = L.divIcon({ className: '', html: labelHtml, iconAnchor: [-8, 8] });
  L.marker([35.3250, 139.5650], { icon: labelIcon, interactive: false }).addTo(wll);
}

/**
 * 実ノードデータがない場合のフォールバック（簡易ラジアル近似）。
 */
function renderWaveFrontRadial(step, wl, wll) {
  const wp           = State.waveParams;
  const arrivalEff   = wp.arrivalBase + wp.offset;
  const effectSpeed  = wp.baseSpeedMs * wp.speedMult;
  const origin       = [35.3117, 139.5481]; // 由比ヶ浜中央（近似）

  if (step < arrivalEff) {
    const remaining = arrivalEff - step;
    const label = L.divIcon({
      className: '',
      html: `<div class="wave-front-label">⏳ 到達まで ${remaining.toFixed(0)} 秒</div>`,
      iconAnchor: [-10, 10],
    });
    L.marker(origin, { icon: label, interactive: false }).addTo(wll);
    return;
  }

  const elapsed = step - arrivalEff;
  const frontR  = elapsed * effectSpeed;
  const warnR   = Math.max(0, frontR - wp.warnWindow * effectSpeed);

  if (warnR > 10) {
    L.circle(origin, {
      radius: warnR, color: 'transparent',
      fillColor: 'rgba(248,81,73,0.12)', fillOpacity: 1, weight: 0,
      interactive: false,
    }).addTo(wl);
  }
  L.circle(origin, {
    radius: frontR,
    color: 'rgba(79,195,247,0.8)', fillOpacity: 0, weight: 2,
    dashArray: '6 4', interactive: false,
  }).addTo(wl);

  const labelHtml =
    `<div class="wave-front-label">` +
    `🌊 ${(frontR / 1000).toFixed(2)} km | ${effectSpeed.toFixed(1)} m/s (近似)` +
    `</div>`;
  const labelIcon = L.divIcon({ className: '', html: labelHtml, iconAnchor: [-12, 12] });
  L.marker([origin[0] + 0.008, origin[1] + 0.014], { icon: labelIcon, interactive: false }).addTo(wll);
}

// =====================================================================
// 津波パラメータ UI 初期化
// =====================================================================

/** プリセットシナリオ定義 */
const WAVE_SCENARIOS = {
  baseline: { offset: 0,    speedMult: 1.0, warnWindow: 120, label: 'ベースライン' },
  early:    { offset: -180, speedMult: 1.0, warnWindow: 120, label: '早期到達 -3分' },
  late:     { offset: 300,  speedMult: 1.0, warnWindow: 120, label: '遅延到達 +5分' },
  fast:     { offset: 0,    speedMult: 2.0, warnWindow: 90,  label: '高速伝播 ×2' },
  slow:     { offset: 0,    speedMult: 0.5, warnWindow: 150, label: '低速伝播 ×0.5' },
};

function initTsunamiParamsUI() {
  // meta から津波パラメータを取得（wave_data があればそちらを優先）
  const meta = State.timelapse?.meta;
  const wd   = meta?.wave_data;
  const baseArr    = wd?.shore_arrival_time ?? meta?.tsunami_arrival_time ?? 840;
  const baseSpeed  = wd?.base_speed_ms      ?? meta?.tsunami_base_speed_ms ?? 3.0;
  State.waveParams.arrivalBase = baseArr;
  State.waveParams.baseSpeedMs = baseSpeed;
  // waveNodes も waveArrivalBase もここで同期
  State.tl.waveArrivalBase = baseArr;

  // スライダー参照
  const slOffset = document.getElementById('param-arrival-offset');
  const slSpeed  = document.getElementById('param-prop-speed');
  const slWarn   = document.getElementById('param-warn-window');
  const valOffset = document.getElementById('val-arrival-offset');
  const valSpeed  = document.getElementById('val-prop-speed');
  const valWarn   = document.getElementById('val-warn-window');
  const rdOffset  = document.getElementById('readout-arrival');
  const rdSpeed   = document.getElementById('readout-speed');
  const toggle    = document.getElementById('wave-overlay-toggle');

  if (!slOffset) return; // HTML 未挿入の場合はスキップ

  // ── 初期値表示 ──────────────────────────────────────────────────────
  function updateDisplays() {
    const wp = State.waveParams;
    const eff = wp.arrivalBase + wp.offset;
    const effSpeed = wp.baseSpeedMs * wp.speedMult;

    const sign = wp.offset >= 0 ? '+' : '';
    valOffset.textContent = `${sign}${wp.offset} 秒`;
    valSpeed.textContent  = `×${wp.speedMult.toFixed(1)}`;
    valWarn.textContent   = `${wp.warnWindow} 秒`;

    rdOffset.textContent = `到達時刻: ${eff} 秒 (${secToMinSec(eff)})`;
    rdSpeed.textContent  = `実効速度: ${effSpeed.toFixed(2)} m/s`;
  }

  // ── イベントリスナー ────────────────────────────────────────────────
  slOffset.addEventListener('input', () => {
    State.waveParams.offset = parseInt(slOffset.value, 10);
    updateDisplays();
    renderFrame(State.tl.steps[State.tl.stepIndex]);
    setActiveScenarioBtn(null);
  });

  slSpeed.addEventListener('input', () => {
    State.waveParams.speedMult = parseFloat(slSpeed.value);
    updateDisplays();
    renderFrame(State.tl.steps[State.tl.stepIndex]);
    setActiveScenarioBtn(null);
  });

  slWarn.addEventListener('input', () => {
    State.waveParams.warnWindow = parseInt(slWarn.value, 10);
    updateDisplays();
    renderFrame(State.tl.steps[State.tl.stepIndex]);
    setActiveScenarioBtn(null);
  });

  toggle.addEventListener('change', () => {
    State.waveParams.overlayEnabled = toggle.checked;
    renderFrame(State.tl.steps[State.tl.stepIndex]);
  });

  // ── プリセットボタン ────────────────────────────────────────────────
  document.querySelectorAll('.btn-scenario').forEach(btn => {
    btn.addEventListener('click', () => {
      const sc = WAVE_SCENARIOS[btn.dataset.scenario];
      if (!sc) return;

      State.waveParams.offset    = sc.offset;
      State.waveParams.speedMult = sc.speedMult;
      State.waveParams.warnWindow = sc.warnWindow;

      slOffset.value = sc.offset;
      slSpeed.value  = sc.speedMult;
      slWarn.value   = sc.warnWindow;

      updateDisplays();
      renderFrame(State.tl.steps[State.tl.stepIndex]);
      setActiveScenarioBtn(btn.dataset.scenario);
    });
  });

  // ── 初期表示 ────────────────────────────────────────────────────────
  updateDisplays();
  setActiveScenarioBtn('baseline');
}

/** シナリオボタンのアクティブ状態を更新 */
function setActiveScenarioBtn(active) {
  document.querySelectorAll('.btn-scenario').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scenario === active);
  });
}

/** 秒を「MM分SS秒」形式に変換 */
function secToMinSec(s) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}分${String(sec).padStart(2, '0')}秒`;
}
