/* V2 batch analysis dashboard — loads data/v2_batch_analysis.json */
(function () {
  const TYPE_COLORS = {
    '一般来訪客': '#f28522',
    '地域住民': '#5ca84b',
    '現地就業者': '#f4c724',
    'プロ誘導員': '#d9363e',
  };

  const GROUP_COLORS = {
    'A_現行Baseline': '#ff4d00',
    'B_警報': '#3498db',
    'C_行動': '#9b59b6',
    'D_津波到達': '#e74c3c',
    'E_人口': '#1abc9c',
  };

  function fmt(n, d = 1) {
    return Number(n).toFixed(d);
  }

  function chartDefaults() {
    Chart.defaults.color = 'rgba(255,255,255,0.55)';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';
    Chart.defaults.font.family = "'Inter', 'Noto Sans JP', sans-serif";
  }

  function makeBar(canvasId, labels, datasets, opts = {}) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    return new Chart(el, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { boxWidth: 12, padding: 16 } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y, 2)}%`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } } },
          y: {
            beginAtZero: true,
            max: opts.yMax,
            title: { display: !!opts.yLabel, text: opts.yLabel || '' },
            ticks: { callback: (v) => v + '%' },
          },
        },
        ...opts.extra,
      },
    });
  }

  function renderKPIs(data) {
    const base = data.results['A1_Baseline_Full_Scale'];
    const pv = data.paper_vs_current;
    document.getElementById('kpi-current-base').textContent = fmt(base.overall_survival_mean_pct, 2) + '%';
    document.getElementById('kpi-paper-base').textContent = fmt(pv.baseline_overall.paper_pct, 2) + '%';
    document.getElementById('kpi-delta').textContent = (pv.baseline_overall.delta_pp >= 0 ? '+' : '') + fmt(pv.baseline_overall.delta_pp, 1) + 'pp';
    document.getElementById('kpi-runs').textContent = String(base.n_runs);
    document.getElementById('kpi-pop').textContent = Math.round(base.pop_mean).toLocaleString();
    const rows = data.rows.filter((r) => !r.status);
    document.getElementById('kpi-scenarios').textContent = String(rows.length);
  }

  function renderBaselineCompare(data) {
    const pv = data.paper_vs_current;
    const labels = ['全体', '一般来訪客', '地域住民', '現地就業者', 'プロ誘導員', '成人', '高齢者', '児童'];
    const paper = [
      pv.baseline_overall.paper_pct,
      pv.baseline_by_type['一般来訪客'].paper_pct,
      pv.baseline_by_type['地域住民'].paper_pct,
      pv.baseline_by_type['現地就業者'].paper_pct,
      pv.baseline_by_type['プロ誘導員'].paper_pct,
      pv.baseline_by_age['成人'].paper_pct,
      pv.baseline_by_age['高齢者'].paper_pct,
      pv.baseline_by_age['児童'].paper_pct,
    ];
    const current = [
      pv.baseline_overall.current_pct,
      pv.baseline_by_type['一般来訪客'].current_pct,
      pv.baseline_by_type['地域住民'].current_pct,
      pv.baseline_by_type['現地就業者'].current_pct,
      pv.baseline_by_type['プロ誘導員'].current_pct,
      pv.baseline_by_age['成人'].current_pct,
      pv.baseline_by_age['高齢者'].current_pct,
      pv.baseline_by_age['児童'].current_pct,
    ];
    makeBar('chart-baseline-compare', labels, [
      { label: 'v1.0 参考値', data: paper, backgroundColor: 'rgba(255,255,255,0.25)' },
      { label: 'v2 一括 A1 (2026)', data: current, backgroundColor: 'rgba(255,77,0,0.85)' },
    ], { yMax: 100, yLabel: '生存率 (%)' });
  }

  function renderScenarioChart(data) {
    const rows = data.rows.filter((r) => !r.status);
    const labels = rows.map((r) => r.scenario.replace(/_/g, ' '));
    const values = rows.map((r) => r.survival_pct);
    const colors = rows.map((r) => GROUP_COLORS[r.group] || '#888');
    makeBar('chart-scenarios', labels, [
      { label: '生存率', data: values, backgroundColor: colors },
    ], { yMax: 35, yLabel: '生存率 (%)' });
  }

  function renderGroupRange(data) {
    const paper = data.group_range_comparison.paper;
    const current = data.group_range_comparison.current;
    const items = [
      { label: '津波到達', paper: paper['A_津波到達'].range_pp, current: current['D_津波到達(現行)']?.range_pp },
      { label: '人口構成', paper: paper['B_人口構成'].range_pp, current: current['E_人口(現行)']?.range_pp },
      { label: '警報', paper: paper['C_警報'].range_pp, current: current['B_警報(現行)']?.range_pp },
      { label: 'ハザードマップ', paper: paper['D_ハザードマップ'].range_pp, current: null },
      { label: 'CaseI / 行動', paper: paper['E_CaseI'].range_pp, current: current['C_行動(現行)']?.range_pp },
    ];
    makeBar('chart-group-range', items.map((i) => i.label), [
      { label: 'v1 参考 変動幅 (pp)', data: items.map((i) => i.paper), backgroundColor: 'rgba(255,255,255,0.22)' },
      { label: 'v2 変動幅 (pp)', data: items.map((i) => i.current ?? 0), backgroundColor: 'rgba(255,77,0,0.8)' },
    ], { yLabel: 'レンジ (pp)' });
  }

  function renderTsunamiCurve(data) {
    const keys = ['D1_Tsunami_600s', 'D2_Tsunami_720s', 'D3_Tsunami_840s', 'D4_Tsunami_1080s'];
    const labels = ['600s (10分)', '720s (12分)', '840s (14分)', '1080s (18分)'];
    const values = keys.map((k) => data.results[k]?.overall_survival_mean_pct ?? null);
    const el = document.getElementById('chart-tsunami');
    if (!el) return;
    new Chart(el, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '現行バッチ 生存率',
          data: values,
          borderColor: '#ff4d00',
          backgroundColor: 'rgba(255,77,0,0.15)',
          fill: true,
          tension: 0.25,
          pointRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, max: 35, ticks: { callback: (v) => v + '%' } },
        },
      },
    });
  }

  function renderTable(data) {
    const tbody = document.querySelector('#scenario-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.rows.forEach((r) => {
      const tr = document.createElement('tr');
      if (r.status === 'NO DATA') {
        tr.innerHTML = `<td>${r.scenario}</td><td>—</td><td colspan="5" class="muted">未実行</td>`;
      } else {
        tr.innerHTML = `
          <td>${r.scenario}</td>
          <td><span class="grp-tag">${r.group.replace('A_現行Baseline', 'Baseline').replace('(現行)', '')}</span></td>
          <td>${r.n_runs}</td>
          <td>${r.pop.toLocaleString()}</td>
          <td><strong>${fmt(r.survival_pct, 2)}%</strong></td>
          <td>${r.delta_vs_base_pp >= 0 ? '+' : ''}${fmt(r.delta_vs_base_pp, 2)}pp</td>
          <td>±${fmt(r.std_pp, 3)}pp</td>`;
      }
      tbody.appendChild(tr);
    });
  }

  async function init() {
    chartDefaults();
    const res = await fetch('data/v2_batch_analysis.json');
    if (!res.ok) throw new Error('data load failed');
    const data = await res.json();
    renderKPIs(data);
    renderBaselineCompare(data);
    renderScenarioChart(data);
    renderGroupRange(data);
    renderTsunamiCurve(data);
    renderTable(data);
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((e) => {
      console.error(e);
      document.body.insertAdjacentHTML('beforeend', '<p style="padding:2rem;color:#f66;">データ読み込みに失敗しました。</p>');
    });
  });
})();
