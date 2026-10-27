// Chart.js（本地 vendor，全局 Chart）封装：暗色、克制
const C = () => window.Chart;
const GRID = '#23272c', TICK = '#7d838b';
export const PALETTE = ['#e4e5e7', '#b3302f', '#8b919a', '#4f9d6c', '#c99a3c', '#5b7fa6', '#7a5ba6', '#a65b8a', '#5a5f66', '#3d6b5a'];

function base(extra = {}) {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: TICK, boxWidth: 10, font: { size: 11 } } }, tooltip: { backgroundColor: '#000', borderColor: '#333', borderWidth: 1 } },
    scales: {
      x: { ticks: { color: TICK, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: GRID } },
      y: { ticks: { color: TICK, font: { size: 10 } }, grid: { color: GRID } },
    },
    ...extra,
  };
}

// marks: Set(日期)，异常点以红色大点标注
export function lineChart(canvas, labels, datasets, { yMin, yMax, yTicks, marks } = {}) {
  if (!C()) return null;
  const opt = base();
  if (yMin != null) opt.scales.y.min = yMin;
  if (yMax != null) opt.scales.y.max = yMax;
  if (yTicks) opt.scales.y.ticks = { ...opt.scales.y.ticks, stepSize: 1, autoSkip: false, callback: (v) => yTicks[v] ?? '' };
  opt.scales.y.grace = '5%';
  return new (C())(canvas, {
    type: 'line',
    data: {
      labels: labels.map((d) => d.slice(5)),
      datasets: datasets.map((ds, i) => ({
        borderColor: PALETTE[i], backgroundColor: PALETTE[i], borderWidth: 1.5, tension: 0, spanGaps: false, clip: 8,
        pointRadius: labels.map((d) => (marks && marks.has(d) ? 5 : 2)),
        pointBackgroundColor: labels.map((d) => (marks && marks.has(d) ? '#e0524f' : PALETTE[i])),
        pointBorderColor: labels.map((d) => (marks && marks.has(d) ? '#e0524f' : PALETTE[i])),
        ...ds,
      })),
    },
    options: opt,
  });
}

export function barChart(canvas, labels, values, { marks } = {}) {
  if (!C()) return null;
  const opt = base(); opt.plugins.legend = { display: false };
  return new (C())(canvas, {
    type: 'bar',
    data: { labels: labels.map((d) => d.slice(5)), datasets: [{ label: '当日净分', data: values,
      backgroundColor: values.map((v, i) => (marks && marks.has(labels[i]) ? (v >= 0 ? '#c99a3c' : '#e0524f') : v >= 0 ? '#8b919a' : '#6b2a29')) }] },
    options: opt,
  });
}

export function pieChart(canvas, labels, values) {
  if (!C()) return null;
  return new (C())(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => PALETTE[(i + 1) % PALETTE.length]), borderColor: '#15171a', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '55%',
      plugins: { legend: { position: 'right', labels: { color: TICK, boxWidth: 10, font: { size: 11 } } } } },
  });
}
