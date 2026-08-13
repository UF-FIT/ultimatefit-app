const ANALYSIS_STATE = new Map();
const SESSION_STATE = new Map();
let timer = null;

function ensureStyles() {
  if (document.getElementById('uf-training-presentation-styles')) return;
  const style = document.createElement('style');
  style.id = 'uf-training-presentation-styles';
  style.textContent = `
    .ufAccordionHeader{cursor:pointer!important;position:relative!important;padding-right:48px!important;user-select:none}
    .ufAccordionHeader:focus-visible{outline:2px solid var(--y);outline-offset:3px;border-radius:8px}
    .ufAccordionChevron{position:absolute;right:14px;top:50%;transform:translateY(-50%);width:30px;height:30px;border:1px solid #2a2a2e;border-radius:8px;background:#0b0b0d;color:#fff;display:grid;place-items:center;font-size:22px;line-height:1;transition:transform .18s ease,border-color .18s ease,color .18s ease;pointer-events:none}
    .ufAccordionHeader[aria-expanded="true"] .ufAccordionChevron{transform:translateY(-50%) rotate(90deg);border-color:rgba(255,217,8,.42);color:var(--y)}
    #uf-load-analytics.ufCollapsed>:not(.ufah),#uf-training-volume-analysis.ufCollapsed>:not(.trainingVolumeHeader){display:none!important}
    #uf-load-analytics.ufCollapsed,#uf-training-volume-analysis.ufCollapsed{padding:0!important;overflow:hidden}
    #uf-load-analytics.ufCollapsed .ufah,#uf-training-volume-analysis.ufCollapsed .trainingVolumeHeader{margin:0!important;padding:16px 18px!important;align-items:center!important}
    #uf-load-analytics.ufCollapsed .ufah p,#uf-training-volume-analysis.ufCollapsed .trainingVolumeHeader p{display:none!important}
    #uf-load-analytics.ufCollapsed .ufah h2,#uf-training-volume-analysis.ufCollapsed .trainingVolumeHeader h2{margin-bottom:0!important}
    .trainingSessionView.ufCollapsed>:not(.trainingSessionTitle){display:none!important}
    .trainingSessionView.ufCollapsed{padding:0!important;overflow:hidden!important}
    .trainingSessionView.ufCollapsed .trainingSessionTitle{margin:0!important;padding:16px 18px!important;min-height:76px;align-items:center!important}
    .trainingSessionView.ufCollapsed .trainingSessionTitle p{display:none!important}
    .trainingSessionView.ufCollapsed .trainingSessionTitle h2{margin-bottom:0!important}
    .ufSessionTags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
    .ufSessionTags span{padding:3px 7px;border-radius:999px;background:rgba(255,217,8,.08);border:1px solid rgba(255,217,8,.18);color:#bdb673;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.025em}
    .trainingSessionView:not(.ufCollapsed) .ufSessionTags{display:none}
    .ufLineGraph{display:block!important;height:auto!important;min-height:210px!important;padding:10px 12px 4px!important;overflow:hidden!important}
    .ufLineGraph svg{display:block;width:100%;height:178px;overflow:visible}
    .ufLineGraph .ufArea{fill:url(#ufLoadAreaGradient)}
    .ufLineGraph .ufLine{fill:none;stroke:var(--y);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
    .ufLineGraph .ufPoint{fill:#0b0b0d;stroke:var(--y);stroke-width:4}
    .ufLineGraph .ufPoint.zero{stroke:#6f6420;stroke-width:2}
    .ufLineGraph .ufValue{fill:#d7d7db;font-size:11px;font-weight:800;text-anchor:middle}
    .ufLineGraph .ufBaseline{stroke:#29292d;stroke-width:1}
    .ufLineLabels{display:grid;grid-template-columns:repeat(var(--uf-points),minmax(0,1fr));gap:4px;color:#777b83;font-size:10px;text-align:center;margin-top:2px}
    @media(max-width:700px){.ufAccordionHeader{padding-right:42px!important}.ufAccordionChevron{right:10px}.trainingSessionView.ufCollapsed .trainingSessionTitle{padding:14px!important}.ufLineGraph{min-height:190px!important;overflow-x:auto!important}.ufLineGraph svg{min-width:560px}.ufLineLabels{min-width:560px}.ufSessionTags{gap:4px}.ufSessionTags span{font-size:7px}}
  `;
  document.head.appendChild(style);
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function parseKg(text) {
  const clean = String(text || '').replace(/[^0-9-]/g, '');
  return Number(clean || 0);
}

function enhanceLoadGraph() {
  const graph = document.querySelector('#uf-load-analytics .ufag:not([data-uf-line])');
  if (!graph) return;
  const source = [...graph.querySelectorAll('.ufab')].map(node => ({
    value: parseKg(node.querySelector('b')?.textContent),
    label: node.querySelector('span')?.textContent?.trim() || '',
  }));
  if (!source.length) return;

  const width = 760;
  const height = 168;
  const padX = 42;
  const padTop = 28;
  const padBottom = 22;
  const plotBottom = height - padBottom;
  const max = Math.max(1, ...source.map(item => item.value));
  const points = source.map((item, index) => ({
    ...item,
    x: source.length === 1 ? width / 2 : padX + index * ((width - padX * 2) / (source.length - 1)),
    y: padTop + (1 - item.value / max) * (plotBottom - padTop),
  }));
  const line = smoothPath(points);
  const area = `${line} L ${points.at(-1).x} ${plotBottom} L ${points[0].x} ${plotBottom} Z`;
  const pointMarkup = points.map(point => `
    <circle class="ufPoint ${point.value === 0 ? 'zero' : ''}" cx="${point.x}" cy="${point.y}" r="6"/>
    <text class="ufValue" x="${point.x}" y="${Math.max(14, point.y - 13)}">${new Intl.NumberFormat('pt-PT',{maximumFractionDigits:0}).format(point.value)} kg</text>
  `).join('');

  graph.dataset.ufLine = '1';
  graph.classList.add('ufLineGraph');
  graph.style.removeProperty('--n');
  graph.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Evolução semanal da carga realizada">
      <defs><linearGradient id="ufLoadAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffd908" stop-opacity=".28"/><stop offset="100%" stop-color="#ffd908" stop-opacity=".025"/></linearGradient></defs>
      <line class="ufBaseline" x1="${padX}" x2="${width-padX}" y1="${plotBottom}" y2="${plotBottom}"/>
      <path class="ufArea" d="${area}"/>
      <path class="ufLine" d="${line}"/>
      ${pointMarkup}
    </svg>
    <div class="ufLineLabels" style="--uf-points:${source.length}">${source.map(item => `<span>${item.label}</span>`).join('')}</div>
  `;
}

function applyAnalysisState(section, header, key) {
  const open = ANALYSIS_STATE.get(key) === true;
  section.classList.toggle('ufCollapsed', !open);
  header.setAttribute('aria-expanded', String(open));
}

function prepareAnalysis(section, header, key) {
  if (!section || !header) return;
  header.classList.add('ufAccordionHeader');
  header.tabIndex = 0;
  if (!header.querySelector('.ufAccordionChevron')) header.insertAdjacentHTML('beforeend','<span class="ufAccordionChevron">›</span>');
  if (header.dataset.ufAccordionBound !== '1') {
    header.dataset.ufAccordionBound = '1';
    const toggle = event => {
      if (event.type === 'keydown' && !['Enter',' '].includes(event.key)) return;
      if (event.type === 'click' && event.target.closest('button,input,select,a')) return;
      event.preventDefault();
      ANALYSIS_STATE.set(key, !(ANALYSIS_STATE.get(key) === true));
      applyAnalysisState(section, header, key);
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', toggle);
  }
  applyAnalysisState(section, header, key);
}

function sessionKey(node, index) {
  const title = node.querySelector('.trainingSessionTitle h2')?.textContent?.trim() || `sessao-${index}`;
  const params = new URLSearchParams(location.search);
  return `${location.pathname}|${params.get('plano') || ''}|${title}|${index}`;
}

function sessionGroups(node) {
  const values = [...node.querySelectorAll('.trainingExerciseCopy small')]
    .map(item => item.textContent?.split('·')[0]?.trim())
    .filter(value => value && !/texto livre/i.test(value));
  return [...new Set(values)].slice(0, 6);
}

function applySessionState(node, header, key) {
  const open = SESSION_STATE.get(key) === true;
  node.classList.toggle('ufCollapsed', !open);
  header.setAttribute('aria-expanded', String(open));
}

function prepareSessions() {
  const sessions = [...document.querySelectorAll('.trainingViewer .trainingSessionView')];
  sessions.forEach((node, index) => {
    const header = node.querySelector(':scope > .trainingSessionTitle');
    if (!header) return;
    const key = sessionKey(node, index);
    header.classList.add('ufAccordionHeader');
    header.tabIndex = 0;
    if (!header.querySelector('.ufAccordionChevron')) header.insertAdjacentHTML('beforeend','<span class="ufAccordionChevron">›</span>');
    const left = header.querySelector(':scope > div');
    if (left && !left.querySelector('.ufSessionTags')) {
      const groups = sessionGroups(node);
      if (groups.length) left.insertAdjacentHTML('beforeend', `<div class="ufSessionTags">${groups.map(group => `<span>${group}</span>`).join('')}</div>`);
    }
    if (header.dataset.ufAccordionBound !== '1') {
      header.dataset.ufAccordionBound = '1';
      const toggle = event => {
        if (event.type === 'keydown' && !['Enter',' '].includes(event.key)) return;
        if (event.type === 'click' && event.target.closest('button,input,select,a')) return;
        event.preventDefault();
        const willOpen = !(SESSION_STATE.get(key) === true);
        if (willOpen) {
          sessions.forEach((other, otherIndex) => {
            const otherHeader = other.querySelector(':scope > .trainingSessionTitle');
            if (!otherHeader) return;
            const otherKey = sessionKey(other, otherIndex);
            SESSION_STATE.set(otherKey, false);
            applySessionState(other, otherHeader, otherKey);
          });
        }
        SESSION_STATE.set(key, willOpen);
        applySessionState(node, header, key);
      };
      header.addEventListener('click', toggle);
      header.addEventListener('keydown', toggle);
    }
    applySessionState(node, header, key);
  });
}

function enhance() {
  ensureStyles();
  enhanceLoadGraph();
  prepareAnalysis(document.getElementById('uf-load-analytics'), document.querySelector('#uf-load-analytics > .ufah'), 'load');
  prepareAnalysis(document.getElementById('uf-training-volume-analysis'), document.querySelector('#uf-training-volume-analysis > .trainingVolumeHeader'), 'volume');
  prepareSessions();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(enhance, 80);
}

export function startTrainingPresentationEnhancer() {
  if (window.__ufTrainingPresentationEnhancer) return;
  window.__ufTrainingPresentationEnhancer = true;
  new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('focus', schedule);
  schedule();
}
