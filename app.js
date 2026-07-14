/* সূত্র — প্রোটোটাইপ অ্যাপ লজিক */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const bn = (value) => String(value).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

const clusterById = (id) => CLUSTERS.find((c) => String(c.id) === String(id));

/* ব্যাকএন্ড থাকলে লাইভ ডেটা টেনে data.js-এর গ্লোবালগুলো জায়গায় বসিয়ে দেয়;
   না থাকলে (file:// বা স্ট্যাটিক হোস্টিং) নমুনা ডেটাই থাকে। */
let LIVE_STATUS = null;
async function loadRemote() {
  /* আগে লোকাল ব্যাকএন্ড, তারপর স্ট্যাটিক এক্সপোর্ট (GitHub Pages) — দুটোই না
     থাকলে data.js-এর নমুনা ডেটা */
  for (const endpoint of ['/api/bootstrap', 'api/bootstrap.json']) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.clusters?.length) {
        Object.assign(SOURCES, data.sources);
        CLUSTERS.splice(0, CLUSTERS.length, ...data.clusters);
        (data.topics ?? []).forEach((t) => { if (!TOPICS.includes(t)) TOPICS.push(t); });
      }
      LIVE_STATUS = data.status ?? null;
      return;
    } catch { /* পরের উৎস চেষ্টা */ }
  }
}

function stanceCounts(cluster) {
  const counts = { govt: 0, neutral: 0, critic: 0 };
  cluster.reports.forEach((r) => { counts[r.stance] += 1; });
  return counts;
}

function stancePct(cluster) {
  const counts = stanceCounts(cluster);
  const total = counts.govt + counts.neutral + counts.critic || 1;
  const govt = Math.round((counts.govt / total) * 100);
  const critic = Math.round((counts.critic / total) * 100);
  return { govt, critic, neutral: 100 - govt - critic };
}

/* ── ছোট ছোট রেন্ডার-টুকরা ─────────────────────────── */

function barHTML(cluster, { thin = false, tall = false, labels = true } = {}) {
  const pct = stancePct(cluster);
  const cls = thin ? 'bar bar--thin' : tall ? 'bar bar--tall' : 'bar';
  const seg = (key) => {
    if (pct[key] <= 0) return '';
    let text = '';
    if (labels && !thin) {
      if (pct[key] >= 22) text = `${STANCES[key].short} ${bn(pct[key])}%`;
      else if (pct[key] >= 12) text = `${bn(pct[key])}%`;
    }
    return `<div class="seg seg--${key}" style="width:${pct[key]}%">${text}</div>`;
  };
  const label = `অবস্থান: সরকার-ঘেঁষা ${bn(pct.govt)}%, নিরপেক্ষ ${bn(pct.neutral)}%, সমালোচক ${bn(pct.critic)}%`;
  return `<div class="${cls}" role="img" aria-label="${label}">${seg('govt')}${seg('neutral')}${seg('critic')}</div>`;
}

function hovercardHTML(srcId) {
  const s = SOURCES[srcId];
  const p = s.pattern;
  return `<span class="hovercard">
    <span class="hc-head">
      <span class="monogram hc-mono">${s.mono}</span>
      <span class="hc-title"><b>${s.name}</b><br><span class="hc-dim">${s.kind} · ${s.founded}</span></span>
      <span class="chip hc-type">${OWNER_TYPES[s.type].mark} ${OWNER_TYPES[s.type].label}</span>
    </span>
    <span class="hc-chain">${s.chain.join(' → ')}</span>
    ${s.businesses !== '—' ? `<span class="hc-dim">গ্রুপের ব্যবসা: ${s.businesses}</span>` : ''}
    <span class="bar bar--thin"><span class="seg seg--govt" style="width:${p.govt}%"></span><span class="seg seg--neutral" style="width:${p.neutral}%"></span><span class="seg seg--critic" style="width:${p.critic}%"></span></span>
    <span class="hc-dim">গত ৩০ দিন: ঘেঁষা ${bn(p.govt)}% · নিরপেক্ষ ${bn(p.neutral)}% · সমালোচক ${bn(p.critic)}%</span>
    ${s.conflict ? `<span class="hc-warn">⚠ ${s.conflict}</span>` : ''}
    <span class="more">সম্পূর্ণ প্রোফাইল →</span>
  </span>`;
}

function srcChipHTML(srcId, { dark = false } = {}) {
  const s = SOURCES[srcId];
  const mark = OWNER_TYPES[s.type].mark;
  return `<a class="chip src-chip ${dark ? 'chip--dark' : ''}" href="source.html?id=${srcId}">
    ${s.name} ${mark}${hovercardHTML(srcId)}</a>`;
}

/* চিপ নয় — চলমান লেখার ভেতরে পোর্টাল-নাম, হোভার-প্রোফাইলসহ */
function srcNameHTML(srcId) {
  return `<a class="src-chip src-name" href="source.html?id=${srcId}"><b>${SOURCES[srcId].name}</b>${hovercardHTML(srcId)}</a>`;
}

function stanceChipHTML(stance, text) {
  const cls = stance === 'neutral' ? 'chip' : `chip chip--${stance}`;
  return `<span class="${cls}">${text ?? STANCES[stance].label}</span>`;
}

function imgHTML(src, cls = '') {
  return src ? `<img class="${cls}" src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer"
    onerror="this.remove()">` : '';
}

function clusterCardHTML(cluster) {
  return `<a class="card" href="story.html?id=${cluster.id}">
    ${cluster.image ? `<span class="card-thumb img-slot">${imgHTML(cluster.image)}</span>` : ''}
    <span class="k">${cluster.topic} · ${bn(cluster.reportCount)}টি প্রতিবেদন</span>
    <span class="hd" style="font-size:14px">${cluster.title}</span>
    ${barHTML(cluster, { thin: true })}
    <span class="sub">${bn(cluster.portalCount)} পোর্টাল · ${cluster.updated}</span>
  </a>`;
}

/* ── সাইট-ক্রোম (হেডার / স্ট্যাটাস / ফুটার) ─────────── */

function renderChrome() {
  const page = document.body.dataset.page;
  const nav = [
    ['home', 'index.html', 'হোম'],
    ['blindspot', 'blindspot.html', 'ব্লাইন্ডস্পট'],
    ['sources', 'sources.html', 'সোর্স'],
  ];
  $('#chrome-head').innerHTML = `
    <div class="site-head"><div class="wrap">
      <a class="brand" href="index.html">সূত্র</a>
      <nav class="site-nav">${nav.map(([id, href, label]) =>
        `<a class="chip ${page === id || (page === 'story' && id === 'home') || (page === 'source' && id === 'sources') ? 'chip--dark' : ''}" href="${href}">${label}</a>`).join('')}
      </nav>
      <input class="search" type="search" placeholder="খুঁজুন… (ডেমো)">
    </div></div>
    <div class="status-bar"><div class="wrap">
      <span>${LIVE_STATUS?.ready
        ? `সর্বশেষ স্ক্র্যাপ: ${LIVE_STATUS.lastRunText} · পরবর্তী: ${LIVE_STATUS.nextRunText}`
        : LIVE_STATUS ? LIVE_STATUS.text : 'সর্বশেষ স্ক্র্যাপ: দুপুর ১২:৩০ · পরবর্তী: ১:০০'}</span>
      <span class="chip" style="font-size:10.5px">${LIVE_STATUS?.ready ? LIVE_STATUS.portalsText : '১০/১০ পোর্টাল সচল'}</span>
      ${LIVE_STATUS?.ready ? `<span class="chip" style="font-size:10.5px">${LIVE_STATUS.modeText} · ${bn(LIVE_STATUS.articles)} প্রতিবেদন · ${bn(LIVE_STATUS.clusters)} ক্লাস্টার</span>` : ''}
      <span class="chip chip--dashed" style="font-size:10.5px">⚠ ${LIVE_STATUS?.ready ? 'প্রোটোটাইপ — মালিকানা-তথ্য ও অবস্থান-বিশ্লেষণ যাচাইহীন' : 'নমুনা ডেটা — মালিকানা ও অবস্থান শুধু ডেমোর জন্য'}</span>
    </div></div>`;
  $('#chrome-foot').innerHTML = `<div class="wrap">
    <span class="chip chip--dashed">ব্র্যান্ড নাম "সূত্র" = প্লেসহোল্ডার</span>
    <span class="chip chip--dashed">প্রতিটি প্রতিবেদন এআই বিশ্লেষণে অবস্থান পায় — পোর্টালের গড় নয়</span>
    <span class="sub">অ্যাকাউন্ট লাগে না — পছন্দ এই ব্রাউজারেই থাকে</span>
  </div>`;
}

/* ── ইন্টারস্টিশিয়াল (1l) ──────────────────────────── */

function openInterstitial(srcId, stance, url) {
  const s = SOURCES[srcId];
  const goExternal = () => {
    if (url) window.open(url, '_blank', 'noopener');
    else toast(`ডেমো: "${s.name}"-এর মূল সাইটে যাওয়া নিষ্ক্রিয়`);
  };
  const skip = store.get('shutro.skipInterstitial', {});
  if (skip[srcId]) { goExternal(); return; }
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="পড়ার আগে জেনে নিন">
    <span class="k">পড়ার আগে জেনে নিন</span>
    <div class="row"><span class="chip chip--dark">${s.name}</span><span class="sub">→ যাচ্ছেন মূল সাইটে</span></div>
    <div class="chain-row">${s.chain.map((node, i) =>
      `<span class="chip ${i === s.chain.length - 1 ? 'chip--dark' : ''}">${node}</span>`).join('<span>→</span>')}</div>
    ${s.conflict ? `<div class="sub">${s.conflict}।</div>`
      : `<div class="sub">${s.businesses !== '—' ? `মূল গ্রুপের ব্যবসা: ${s.businesses}।` : 'বড় কোনো শিল্পগোষ্ঠীর সঙ্গে মালিকানা-সংযোগ পাওয়া যায়নি।'}</div>`}
    <div class="row"><span class="k">এই প্রতিবেদনের অবস্থান:</span>${stanceChipHTML(stance)}</div>
    <div class="row" style="margin-top:4px">
      <button class="btn btn--dark" data-go>মূল সাইটে পড়ুন ↗</button>
      <a class="btn" href="source.html?id=${srcId}">প্রোফাইল দেখুন</a>
    </div>
    <label class="check-row"><input type="checkbox" data-skip> এই পোর্টালের জন্য আর দেখাবেন না</label>
    <span class="sub" style="font-size:10px">${url ? 'পছন্দ লোকালস্টোরেজে থাকে, অ্যাকাউন্ট ছাড়া' : 'ডেমো: বাইরের সাইটে যাওয়া নিষ্ক্রিয় · পছন্দ লোকালস্টোরেজে থাকে, অ্যাকাউন্ট ছাড়া'}</span>
  </div>`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  $('[data-go]', overlay).addEventListener('click', () => {
    if ($('[data-skip]', overlay).checked) {
      skip[srcId] = true;
      store.set('shutro.skipInterstitial', skip);
    }
    close();
    goExternal();
  });
  document.body.appendChild(overlay);
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'chip chip--dark';
  el.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:200;font-size:12px;padding:4px 16px';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function bindExternalLinks(root = document) {
  $$('a[data-ext]', root).forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openInterstitial(a.dataset.src, a.dataset.stance, a.dataset.url || null);
    });
  });
}

/* ── অনবোর্ডিং (1o) ────────────────────────────────── */

function maybeOnboard() {
  if (store.get('shutro.onboarded', false)) return;
  const defaults = new Set(['রাজনীতি', 'অর্থনীতি', 'আন্তর্জাতিক']);
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal" style="max-width:460px" role="dialog" aria-modal="true" aria-label="অনবোর্ডিং">
    <div class="step-track"><span class="chip chip--dark">১</span><span class="line"></span><span class="chip">২</span></div>
    <span class="hd" style="font-size:17px">কোন বিষয়ের খবর দেখতে চান?</span>
    <div class="row" data-topics>${TOPICS.concat(['প্রযুক্তি', 'বিনোদন']).map((t) =>
      `<button class="chip ${defaults.has(t) ? 'chip--dark' : ''}" data-topic="${t}">${t}</button>`).join('')}</div>
    <div style="border-top:1px dashed var(--line-soft);padding-top:10px">
      <span class="k" style="display:block;margin-bottom:6px">ধাপ ২: পোর্টাল — ${bn(10)}টিই ডিফল্ট চালু</span>
      <div class="row">${Object.values(SOURCES).slice(0, 4).map((s) => `<span class="chip">☑ ${s.name}</span>`).join('')}<span class="chip">☑ +${bn(6)}</span></div>
    </div>
    <div class="row" style="justify-content:space-between">
      <span class="sub">অ্যাকাউন্ট লাগবে না — পছন্দ এই ব্রাউজারেই থাকবে</span>
      <button class="btn btn--dark" data-start>শুরু করুন →</button>
    </div>
  </div>`;
  $$('[data-topic]', overlay).forEach((btn) => {
    btn.addEventListener('click', () => btn.classList.toggle('chip--dark'));
  });
  $('[data-start]', overlay).addEventListener('click', () => {
    const topics = $$('[data-topic].chip--dark', overlay).map((b) => b.dataset.topic);
    store.set('shutro.topics', topics);
    store.set('shutro.onboarded', true);
    overlay.remove();
    toast('পছন্দ সংরক্ষিত — এই ব্রাউজারেই থাকবে');
  });
  document.body.appendChild(overlay);
}

/* ── হোম (1d) ──────────────────────────────────────── */

function renderHome() {
  const lead = CLUSTERS.find((c) => c.lead);
  const rest = CLUSTERS.filter((c) => !c.lead && !c.blindspot).concat(CLUSTERS.filter((c) => !c.lead && c.blindspot));
  const blindspots = CLUSTERS.filter((c) => c.blindspot);
  const preferred = new Set(store.get('shutro.topics', []));
  const topics = ['সব', ...TOPICS];

  $('#app').innerHTML = `
    <div class="topic-row" data-filter>${topics.map((t, i) =>
      `<button class="chip ${i === 0 ? 'chip--dark' : ''}" data-topic="${t}">${t}${preferred.has(t) ? ' ✓' : ''}</button>`).join('')}
    </div>
    <div class="panel" style="margin-bottom:26px">
      <a class="lead-story" href="story.html?id=${lead.id}" data-card data-topic="${lead.topic}">
        <div class="img-slot">${imgHTML(lead.image)}</div>
        <div class="lead-body">
          <span class="k">প্রধান খবর · ${bn(lead.reportCount)}টি প্রতিবেদন · ${bn(10)}টির মধ্যে ${bn(lead.portalCount)} পোর্টাল</span>
          <span class="hd lead-hd">${lead.title}</span>
          ${barHTML(lead)}
          <span class="sub">সর্বশেষ হালনাগাদ: ${lead.updated} · <u>কভারেজ তুলনা →</u></span>
        </div>
      </a>
      <div class="story-grid">${rest.map((c) =>
        clusterCardHTML(c).replace('class="card"', `class="card" data-card data-topic="${c.topic}"`)).join('')}
      </div>
      <a class="blindspot-strip" href="blindspot.html">
        <span class="bs-name">ব্লাইন্ডস্পট</span>
        <span class="tl"></span>
        <span class="chip">শুধু ১ পক্ষে ছাপা ${bn(blindspots.length)}টি খবর →</span>
      </a>
    </div>`;

  $('[data-filter]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-topic]');
    if (!btn) return;
    $$('[data-filter] .chip').forEach((c) => c.classList.remove('chip--dark'));
    btn.classList.add('chip--dark');
    const topic = btn.dataset.topic;
    $$('[data-card]').forEach((card) => {
      card.style.display = (topic === 'সব' || card.dataset.topic === topic) ? '' : 'none';
    });
  });

  maybeOnboard();
}

/* ── স্টোরি পেজ (1h + 1i) ──────────────────────────── */

function reportRowHTML(report) {
  return `<div class="report-row" data-stance="${report.stance}">
    <span class="time">${report.time}</span>
    ${srcChipHTML(report.src)}
    <a class="report-hd" href="#" data-ext data-src="${report.src}" data-stance="${report.stance}" data-url="${report.url ?? ''}"
      ${report.url ? 'title="মূল প্রতিবেদনে যান"' : ''}>"${report.headline}"${report.url ? ' <span class="ext-mark">↗</span>' : ''}</a>
    ${stanceChipHTML(report.stance, STANCES[report.stance].short)}
  </div>`;
}

function renderStory() {
  const id = new URLSearchParams(location.search).get('id');
  const cluster = clusterById(id) ?? CLUSTERS.find((c) => c.lead) ?? CLUSTERS[0];
  const counts = stanceCounts(cluster);
  const covering = [...new Set(cluster.reports.map((r) => r.src))];
  const changes = cluster.reports.filter((r) => r.changes);
  document.title = `${cluster.title} — সূত্র`;

  const tabs = [
    ['all', `সব ${bn(cluster.reports.length)}`],
    ['govt', `ঘেঁষা ${bn(counts.govt)}`],
    ['neutral', `নিরপেক্ষ ${bn(counts.neutral)}`],
    ['critic', `সমালোচক ${bn(counts.critic)}`],
  ];

  const timeline = cluster.reports.map((r, i) => {
    const s = SOURCES[r.src];
    const cls = i === 0 ? 'tl-item--first' : r.stance !== 'neutral' ? `tl-item--${r.stance}` : '';
    const changeAlert = r.changes
      ? `<div class="tl-alert">⟳ ${s.name} শিরোনাম বদলেছে ${bn(r.changes)} বার — আগের সংস্করণ দেখুন</div>` : '';
    return `<div class="tl-item ${cls}"><div class="tl-row">
      <span class="sub" style="width:42px;flex:none">${r.time}</span>
      ${srcChipHTML(r.src)}
      <span class="hd" style="font-size:12.5px">"${r.headline}"${i === 0 ? ' — প্রথম প্রকাশ' : ''}</span>
      ${r.stance !== 'neutral' ? stanceChipHTML(r.stance, STANCES[r.stance].short) : ''}
    </div></div>${changeAlert}`;
  }).join('');

  $('#app').innerHTML = `
    <div class="panel" style="margin:20px 0 26px">
      <div class="story-head">
        <span class="k"><a href="index.html">← হোম</a> · ${cluster.topic} · ${bn(cluster.reports.length)}টি সূত্র · হালনাগাদ ${cluster.updated}</span>
        <h1 class="story-title">${cluster.title}</h1>
        ${cluster.image ? `<div class="img-slot story-img">${imgHTML(cluster.image)}</div>` : ''}
        <div class="ai-summary">
          <span class="k">এআই সারসংক্ষেপ — ${bn(cluster.reports.length)}টি সূত্র থেকে, নিরপেক্ষ ভাষায়</span>
          <span class="sub" style="font-size:13px;color:var(--ink)">${cluster.summary}</span>
        </div>
        ${barHTML(cluster, { tall: true })}
      </div>
      <div class="story-cols">
        <div class="story-main">
          <div class="tabs">${tabs.map(([key, label], i) =>
            `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}</div>
          <div data-reports>${[...cluster.reports].reverse().map(reportRowHTML).join('')}</div>
          <div class="section-title" style="margin-top:10px">টাইমলাইন <span class="ann">কে আগে, কে পরে, কে শিরোনাম পাল্টাল</span></div>
          <div class="timeline">${timeline}</div>
        </div>
        <div class="story-side">
          <span class="k">কভারেজ বিবরণ</span>
          <span class="sub">মোট সূত্র ${bn(cluster.reports.length)} · পোর্টাল ${bn(covering.length)}/${bn(10)}<br>
            প্রথম প্রকাশ: ${cluster.firstPublished}<br>
            শিরোনাম বদল: ${changes.length ? `${bn(changes.reduce((n, r) => n + r.changes, 0))} বার` : 'নেই'}</span>
          ${barHTML(cluster, { thin: true })}
          <span class="k" style="margin-top:6px">মালিকানা প্যানেল</span>
          <div class="own-panel">${covering.map((srcId) => {
            const s = SOURCES[srcId];
            return `<div class="sub">${srcNameHTML(srcId)} → ${s.chain.slice(1).join(' → ')}
              ${s.businesses !== '—' ? `<br><span style="font-size:10.5px">ব্যবসা: ${s.businesses}</span>` : ''}</div>`;
          }).join('')}</div>
        </div>
      </div>
    </div>`;

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const key = tab.dataset.tab;
      $$('[data-reports] .report-row').forEach((row) => {
        row.style.display = (key === 'all' || row.dataset.stance === key) ? '' : 'none';
      });
    });
  });

  bindExternalLinks();
}

/* ── সোর্স প্রোফাইল (1j + 1k) ─────────────────────── */

function renderSource() {
  const id = new URLSearchParams(location.search).get('id');
  const s = SOURCES[id] ?? SOURCES['kaler-kantho'];
  const srcId = SOURCES[id] ? id : 'kaler-kantho';
  document.title = `${s.name} — সূত্র`;

  const recent = [];
  CLUSTERS.forEach((cluster) => {
    cluster.reports.forEach((r) => {
      if (r.src === srcId) recent.push({ cluster, report: r });
    });
  });

  const fakeCluster = { reports: Object.entries(s.pattern).flatMap(([k, v]) => Array(v).fill({ stance: k })) };

  const treeSiblings = s.siblings.map((name) => `<span class="chip">${name}</span>`).join('');
  const tree = s.group !== '—' && s.group !== s.owner
    ? `<div class="tree-node tree-node--root">${s.group} <span class="sub-inline">— ${s.businesses}</span></div>
       <div class="tree-branch">
         <div class="tree-node">${s.owner}</div>
         <div class="tree-branch"><div class="tree-leaves">
           <span class="chip chip--dark">${s.name} ← আপনি এখানে</span>${treeSiblings}
         </div></div>
       </div>`
    : `<div class="tree-node tree-node--root">${s.owner}${s.businesses !== '—' ? ` <span class="sub-inline">— ${s.businesses}</span>` : ''}</div>
       <div class="tree-branch"><div class="tree-leaves">
         <span class="chip chip--dark">${s.name} ← আপনি এখানে</span>${treeSiblings}
       </div></div>`;

  const drow = (k, v) => `<div class="drow"><span class="k">${k}</span><span class="sub">${v}</span></div>`;

  $('#app').innerHTML = `
    <div class="panel" style="margin:20px 0 26px">
      <div class="panel-head">
        <div class="row">
          <div class="monogram">${s.mono}</div>
          <div>
            <div class="hd">${s.name}</div>
            <div class="sub">${s.kind} · ${s.founded}</div>
          </div>
        </div>
        <span class="chip">${OWNER_TYPES[s.type].mark} ${s.typeLabel}</span>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:6px">
        <span class="k">মালিকানা কাঠামো</span>
        ${tree}
      </div>
      <div class="dossier" style="border-top:1px solid var(--line)">
        <div class="dossier-table">
          ${drow('মালিক', s.owner)}
          ${drow('মূল গ্রুপ', s.group)}
          ${drow('গ্রুপের ব্যবসা', s.businesses)}
          ${drow('সহযোগী মিডিয়া', s.siblings.length ? s.siblings.join(' · ') : '—')}
          ${drow('প্রতিষ্ঠা', s.founded)}
          ${drow('আয়ের উৎস', s.revenue)}
        </div>
        <div class="dossier-aside">
          <span class="k">গত ৩০ দিনের অবস্থান-প্যাটার্ন</span>
          <div class="pattern-cols">
            <div class="pc-govt" style="height:${s.pattern.govt}%"></div>
            <div class="pc-neutral" style="height:${s.pattern.neutral}%"></div>
            <div class="pc-critic" style="height:${s.pattern.critic}%"></div>
          </div>
          <span class="sub" style="font-size:10.5px">ঘেঁষা ${bn(s.pattern.govt)}% · নিরপেক্ষ ${bn(s.pattern.neutral)}% · সমালোচক ${bn(s.pattern.critic)}%</span>
          ${barHTML(fakeCluster, { thin: true })}
          ${s.conflict ? `<div class="conflict-box">
            <span class="k" style="display:block;margin-bottom:4px">⚠ স্বার্থ-সংঘাতের ঝুঁকি</span>
            <span class="sub">${s.conflict}</span>
          </div>` : ''}
        </div>
      </div>
      <div style="padding:16px;border-top:1px solid var(--line)">
        <span class="k" style="display:block;margin-bottom:8px">সাম্প্রতিক শিরোনাম — ক্লাস্টারসহ</span>
        ${recent.length ? recent.map(({ cluster, report }) => `<div class="report-row">
          <span class="time">${report.time}</span>
          <a class="report-hd" href="story.html?id=${cluster.id}">"${report.headline}"</a>
          ${stanceChipHTML(report.stance, STANCES[report.stance].short)}
          <span class="sub" style="flex:none">${cluster.topic}</span>
        </div>`).join('') : '<span class="sub">আজকের ক্লাস্টারে এই পোর্টালের প্রতিবেদন নেই</span>'}
      </div>
    </div>`;
}

/* ── সোর্স তালিকা ──────────────────────────────────── */

function renderSources() {
  $('#app').innerHTML = `
    <div class="section-title">সোর্স <span class="ann">"কে টাকা দেয়" — এক পাতায়</span></div>
    <div class="panel" style="margin-bottom:26px"><div class="source-grid">
      ${Object.entries(SOURCES).map(([srcId, s]) => `<a class="card" href="source.html?id=${srcId}">
        <div class="row">
          <div class="monogram" style="width:32px;height:32px;font-size:12px">${s.mono}</div>
          <div style="flex:1;min-width:0">
            <div class="hd" style="font-size:14px">${s.name}</div>
            <div class="sub" style="font-size:11px">${s.kind}</div>
          </div>
          <span class="chip" style="flex:none">${OWNER_TYPES[s.type].mark} ${OWNER_TYPES[s.type].label}</span>
        </div>
        <span class="sub">${s.group !== '—' ? `${s.owner} → ${s.group}` : s.owner}</span>
        <div class="bar bar--thin" role="img" aria-label="৩০ দিনের অবস্থান-প্যাটার্ন">
          <div class="seg seg--govt" style="width:${s.pattern.govt}%"></div>
          <div class="seg seg--neutral" style="width:${s.pattern.neutral}%"></div>
          <div class="seg seg--critic" style="width:${s.pattern.critic}%"></div>
        </div>
        <span class="sub" style="font-size:10.5px">গত ৩০ দিন: ঘেঁষা ${bn(s.pattern.govt)}% · নিরপেক্ষ ${bn(s.pattern.neutral)}% · সমালোচক ${bn(s.pattern.critic)}%</span>
      </a>`).join('')}
    </div></div>`;
}

/* ── ব্লাইন্ডস্পট (1n) ─────────────────────────────── */

function renderBlindspot() {
  const side = (key) => CLUSTERS.filter((c) => c.blindspot === key).map((c) => `
    <a class="card" href="story.html?id=${c.id}" style="margin-bottom:10px">
      <span class="hd" style="font-size:13.5px">${c.title}</span>
      ${barHTML(c, { thin: true })}
      <span class="sub" style="font-size:10.5px">${c.blindspotNote} · ${bn(c.reportCount)}টি প্রতিবেদন</span>
    </a>`).join('');

  $('#app').innerHTML = `
    <div class="panel" style="margin:20px 0 26px">
      <div class="panel-head">
        <div>
          <div class="hd">ব্লাইন্ডস্পট</div>
          <div class="sub">যে খবর এক পক্ষের মিডিয়ায় প্রায় নেই</div>
        </div>
        <span class="chip chip--dashed">প্রতি ৩০ মিনিটে হালনাগাদ</span>
      </div>
      <div class="mirror">
        <div>
          <span class="chip chip--govt" style="margin-bottom:10px">সরকার-ঘেঁষা পোর্টালে অনুপস্থিত</span>
          <div style="height:10px"></div>
          ${side('govt')}
        </div>
        <div>
          <span class="chip chip--critic" style="margin-bottom:10px">সমালোচক পোর্টালে অনুপস্থিত</span>
          <div style="height:10px"></div>
          ${side('critic')}
        </div>
      </div>
    </div>`;
}

/* ── বুট ───────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  await loadRemote();
  renderChrome();
  const page = document.body.dataset.page;
  if (page === 'home') renderHome();
  else if (page === 'story') renderStory();
  else if (page === 'source') renderSource();
  else if (page === 'sources') renderSources();
  else if (page === 'blindspot') renderBlindspot();
});
