/* Relay — interactive client-coordinator prototype.
   Single file, no build step. State lives in memory and in localStorage.
   Reply drafting runs on a deterministic rules engine (see analyze/draftFor);
   the production path swaps that one function for a model call behind the
   same human approval gate. Nothing here sends email or touches a calendar. */

/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const pad = n => String(n).padStart(2, '0');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const article = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const calm = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;
const median = list => {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ---------- dates: everything derives from today, nothing is hardcoded ---------- */
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => new Date(s + 'T12:00:00');
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const isWeekend = s => [0, 6].includes(parseISO(s).getDay());
const nextBiz = (s, n = 1) => { let d = s; for (let i = 0; i < n; i++) { do { d = addDays(d, 1); } while (isWeekend(d)); } return d; };
const bizOrNext = s => isWeekend(s) ? nextBiz(s) : s;

const easternParts = (date = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
}).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
const easternDate = (date = new Date()) => { const p = easternParts(date); return `${p.year}-${p.month}-${p.day}`; };
const TODAY = easternDate();
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime()) && iso(parseISO(s)) === s;
const validTime = s => typeof s === 'string' && /^(09|1[0-6]):(00|30)$/.test(s);
const pastSlot = (date, time) => { const p = easternParts(); return date < easternDate() || (date === easternDate() && time <= `${p.hour}:${p.minute}`); };
/* Seeded meetings land on business days so the demo never opens onto a dead weekend. */
const DESK = bizOrNext(TODAY);
const mondayOf = s => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };

const prettyDate = s => parseISO(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const longDate = s => parseISO(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const timeLabel = t => new Date(`${TODAY}T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dayName = s => parseISO(s).toLocaleDateString('en-US', { weekday: 'long' });
const agoLabel = min => {
  if (min == null) return '';
  if (min < 1) return 'Just now';
  if (min < 60) return `${Math.round(min)} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} hr ago`;
  if (min < 2880) return 'Yesterday';
  return `${Math.round(min / 1440)} days ago`;
};

/* ---------- static chrome ---------- */
const icons = {
  today: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  inbox: '<path d="M4 5h16v14H4zM4 6l8 6 8-6"/>',
  pipeline: '<path d="M5 4v16M12 4v16M19 4v16M3 7h4M10 12h4M17 9h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3"/>',
  followups: '<path d="M4 10a8 8 0 111 8M4 4v6h6M12 7v5l3 2"/>',
  impact: '<path d="M4 19h16M7 19V9M12 19V5M17 19v-6"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[k] || icons.inbox}</svg>`;
const navs = [['today', 'Today'], ['inbox', 'Inbox'], ['pipeline', 'Client pipeline'], ['calendar', 'Calendar'], ['followups', 'Follow-ups'], ['impact', 'Impact'], ['settings', 'Business setup']];
const stages = ['New inquiry', 'Qualified', 'Meeting booked', 'Proposal sent', 'Won', 'Lost'];
const stageOdds = { 'New inquiry': .1, 'Qualified': .25, 'Meeting booked': .45, 'Proposal sent': .65, 'Won': 1, 'Lost': 0 };


/* ---------- seed workspace ---------- */
function seed() {
  const c = (o) => ({ sent: [], need: false, kind: 'reply', ...o });
  return {
    clients: [
      c({ id: 1, name: 'Maya Chen', company: 'Bloom & Co', initials: 'MC', color: 'purple', email: 'maya@bloom.example', subject: 'A fresh direction for our brand', message: 'Hi Alex! We’re a growing skincare brand and need help with our positioning before a November launch. Our budget is around $8,000. Is this something you can help with?', stage: 'New inquiry', value: 8000, source: 'Website inquiry', ago: 12, due: TODAY, need: true, note: 'Brand strategy · $8k budget · November launch' }),
      c({ id: 2, name: 'James Wilson', company: 'Forma Digital', initials: 'JW', color: 'blue', email: 'james@forma.example', subject: 'Re: Growth strategy proposal', message: 'Thanks for putting this together, Alex. I’m reviewing the growth strategy proposal with our co-founder and should have feedback this week.', stage: 'Proposal sent', value: 12500, source: 'Email', ago: 4320, kind: 'followup', due: TODAY, need: true, draft: 'Hi James, checking in on the growth strategy proposal. Have you and your co-founder had a chance to review it? Happy to answer questions about the scope or walk through the next steps together.\n\nBest,\nAlex', note: 'Growth strategy · Proposal awaiting feedback' }),
      c({ id: 3, name: 'Sofia Rodriguez', company: 'Atelier Collective', initials: 'SR', color: 'pink', email: 'sofia@atelier.example', subject: 'Let’s talk about our launch', message: 'The strategy engagement sounds like a good fit. We’re planning a January launch and would love to chat about the process. Do you have time this week?', stage: 'Qualified', value: 6000, source: 'Referral', ago: 48, due: TODAY, need: true, note: 'Launch strategy · Ready for a discovery call' }),
      c({ id: 4, name: 'Daniel Park', company: 'Lumen Labs', initials: 'DP', color: 'green', email: 'daniel@lumen.example', subject: 'Discovery call confirmed', message: 'That time works for me. Looking forward to discussing how we can improve our sales process.', stage: 'Meeting booked', value: 9000, source: 'Email', ago: 1440, due: TODAY, note: 'Sales process · Discovery call' }),
      c({ id: 5, name: 'Emma Brooks', company: 'Fieldwork', initials: 'EB', color: 'orange', email: 'emma@fieldwork.example', subject: 'Workshop planning', message: 'I’ve shared the current customer journey map. Let’s review it at our workshop planning call.', stage: 'Meeting booked', value: 7500, source: 'Referral', ago: 1440, due: TODAY, note: 'Customer experience · Workshop planning' }),
      c({ id: 6, name: 'Oliver Reed', company: 'Common Ground', initials: 'OR', color: 'blue', email: 'oliver@common.example', subject: 'A few questions about the scope', message: 'Could we talk through the deliverables? We’re particularly interested in the research phase.', stage: 'Meeting booked', value: 5500, source: 'Email', ago: 1440, due: TODAY, note: 'Positioning research · Scope review' }),
      c({ id: 7, name: 'Ava Patel', company: 'Studio Fern', initials: 'AP', color: 'green', email: 'ava@fern.example', subject: 'Q4 strategy partnership', message: 'We’re discussing the proposal at our leadership meeting on Monday. Could you check back with us next week?', stage: 'Proposal sent', value: 6500, source: 'Website inquiry', ago: 2880, kind: 'followup', due: nextBiz(TODAY, 3), need: true, draft: 'Hi Ava, I hope the leadership meeting went well. I wanted to check in on the Q4 strategy proposal. Are there any questions I can help answer?\n\nBest,\nAlex', note: 'Q4 strategy · Follow up after Monday meeting' }),
      c({ id: 9, name: 'Grace Lin', company: 'Meridian Craft', initials: 'GL', color: 'pink', email: 'grace@meridian.example', subject: 'Signed — excited to start', message: 'The scope looks right. Countersigned copy attached, and we are ready to kick off whenever suits you.', stage: 'Won', value: 11000, source: 'Referral', ago: 7200, due: TODAY, note: 'Brand strategy \u00b7 Signed engagement' }),
      c({ id: 10, name: 'Peter Adeyemi', company: 'Hollow Lane', initials: 'PA', color: 'green', email: 'peter@hollowlane.example', subject: 'Re: Positioning proposal', message: 'Thanks for the thorough proposal. We have decided to keep this in-house for now, but we will be in touch next year.', stage: 'Lost', value: 4500, source: 'Website inquiry', ago: 10080, due: TODAY, note: 'Positioning \u00b7 Kept in-house' }),
      c({ id: 8, name: 'Noah Kim', company: 'Arc Partners', initials: 'NK', color: 'orange', email: 'noah@arc.example', subject: 'Exploring a smaller strategy session', message: 'We’re looking for a focused strategy session to align our small team. Our budget is $3,500 and timing is flexible.', stage: 'Qualified', value: 3500, source: 'Email', ago: 1440, due: TODAY, note: 'Team alignment · Budget needs review' })
    ],
    events: [
      { id: 1, client: 4, date: DESK, time: '10:00', title: 'Discovery call', duration: 30 },
      { id: 2, client: 5, date: DESK, time: '14:00', title: 'Workshop planning', duration: 30 },
      { id: 3, client: 6, date: nextBiz(DESK), time: '11:00', title: 'Scope review', duration: 30 }
    ],
    settings: { name: 'Northstar Studio', owner: 'Alex Carter', services: 'Brand strategy, growth strategy, and customer experience consulting', minimum: 5000, tone: 'Warm and professional', questions: 'What would you like to achieve? What is your timeline? What budget have you set aside?' },
    roi: { inquiries: 18, fee: 7500, close: 25, respondHours: 42, price: 49 },
    activity: [{ text: 'Discovery call scheduled with Lumen Labs', time: '9:02 AM' }, { text: 'Growth proposal moved to Proposal sent', time: '8:45 AM' }],
    /* Minutes from inbound message to approved reply. Seeded history + anything you do live. */
    responses: [4, 3, 6, 2, 5],
    nextClient: 11,
    nextEvent: 4
  };
}

let { clients, events, settings, roi, activity, responses, nextClient, nextEvent } = seed();
let view = 'today', selected = 1, inboxFilter = 'all', inboxQuery = '', weekOffset = 0, toastTimer, streamToken = 0;

/* ---------- persistence ---------- */
const STORE = 'relay.prototype.v2';
/* Validate imported and saved data before replacing a working workspace. */
function decodeWorkspace(raw) {
  const fail = () => { throw Error('Invalid Relay workspace.'); };
  const obj = value => value && typeof value === 'object' && !Array.isArray(value);
  const str = (value, limit = 2000) => { if (typeof value !== 'string' || value.length > limit) fail(); return value; };
  const num = (value, min = 0, max = 1000000) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(); return value; };
  const id = value => { num(value, 1, Number.MAX_SAFE_INTEGER - 1); if (!Number.isSafeInteger(value)) fail(); return value; };
  const date = value => { if (!validDate(value)) fail(); return value; };
  if (!obj(raw) || !Array.isArray(raw.clients) || !raw.clients.length || raw.clients.length > 500) fail();
  const ids = new Set();
  const cleanClients = raw.clients.map(c => {
    if (!obj(c) || ids.has(id(c.id)) || !stages.includes(c.stage)) fail();
    ids.add(c.id);
    if (!['purple', 'blue', 'pink', 'green', 'orange'].includes(c.color)) fail();
    if (typeof c.need !== 'boolean' || !['reply', 'followup'].includes(c.kind)) fail();
    if (!Array.isArray(c.sent) || c.sent.length > 500) fail();
    const name = str(c.name, 80), company = str(c.company, 100);
    if (!name.trim() || !company.trim()) fail();
    const result = { id: c.id, name, company, initials: str(c.initials, 10), color: c.color,
      email: str(c.email, 254), subject: str(c.subject, 300), message: str(c.message, 10000),
      stage: c.stage, value: num(c.value), source: str(c.source, 100), ago: num(c.ago ?? 0, 0, 1e9),
      kind: c.kind, due: date(c.due), need: c.need, note: str(c.note ?? '', 1000),
      sent: c.sent.map(m => { if (!obj(m)) fail(); return { text: str(m.text, 20000) }; }),
      draft: c.streaming ? '' : str(c.draft ?? '', 20000), streaming: false };
    if (c.arrivedAt != null) result.arrivedAt = num(c.arrivedAt, 0, 1e15);
    if (c.respondedSec != null) result.respondedSec = num(c.respondedSec, 0, 1e12);
    return result;
  });
  if (!Array.isArray(raw.events) || raw.events.length > 1000) fail();
  const eventIds = new Set(), bookedClients = new Set(), bookedSlots = new Set();
  const cleanEvents = raw.events.map(e => {
    if (!obj(e) || eventIds.has(id(e.id)) || !ids.has(e.client) || bookedClients.has(e.client)) fail();
    date(e.date);
    if (isWeekend(e.date) || !validTime(e.time) || e.duration !== 30 || bookedSlots.has(`${e.date} ${e.time}`)) fail();
    eventIds.add(e.id); bookedClients.add(e.client); bookedSlots.add(`${e.date} ${e.time}`);
    return { id: e.id, client: e.client, date: e.date, time: e.time, duration: 30, title: str(e.title, 100) };
  });
  const defaults = seed();
  const prefs = raw.settings ?? defaults.settings;
  if (!obj(prefs) || !['Warm and professional', 'Concise and direct', 'Friendly and conversational'].includes(prefs.tone)) fail();
  const cleanSettings = { name: str(prefs.name, 80), owner: str(prefs.owner, 80), services: str(prefs.services, 500),
    questions: str(prefs.questions, 600), minimum: num(prefs.minimum), tone: prefs.tone };
  if (![cleanSettings.name, cleanSettings.owner, cleanSettings.services, cleanSettings.questions].every(x => x.trim())) fail();
  const cleanRoi = {};
  for (const [key, min, max] of [['inquiries',0,500],['fee',0,1000000],['close',0,100],['respondHours',0,336],['price',1,10000]]) {
    cleanRoi[key] = num(raw.roi?.[key] ?? defaults.roi[key], min, max);
  }
  const items = raw.activity ?? [];
  if (!Array.isArray(items) || items.length > 100) fail();
  const cleanActivity = items.map(a => { if (!obj(a)) fail(); return { text: str(a.text, 1000), time: str(a.time, 100) }; });
  const samples = raw.responses ?? defaults.responses;
  if (!Array.isArray(samples) || samples.length > 10000) fail();
  return { clients: cleanClients, events: cleanEvents, settings: cleanSettings, roi: cleanRoi, activity: cleanActivity,
    responses: samples.map(n => num(n, 0, 1e10)), nextClient: Math.max(...ids) + 1,
    nextEvent: Math.max(0, ...eventIds) + 1, selected: ids.has(raw.selected) ? raw.selected : cleanClients[0].id };
}
function applyWorkspace(data) {
  streamToken++;
  ({ clients, events, settings, roi, activity, responses, nextClient, nextEvent, selected } = data);
}
function save() {
  try {
    // Never persist a read-only animation state or an unfinished animated draft.
    const snapshot = clients.map(c => c.streaming ? { ...c, streaming: false, draft: '' } : c);
    localStorage.setItem(STORE, JSON.stringify({ day: TODAY, clients: snapshot, events, settings, roi, activity, responses, nextClient, nextEvent, selected }));
  } catch (_) { /* Storage may be blocked; the in-memory demo still works. */ }
}
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data?.day !== TODAY) return false;
    applyWorkspace(decodeWorkspace(data));
    return true;
  } catch (_) { return false; }
}
function wipe() { try { localStorage.removeItem(STORE); } catch (_) {} }

/* ---------- derived reads ---------- */
const find = id => clients.find(c => c.id === Number(id));
const live = c => !['Won', 'Lost'].includes(c.stage);
const due = () => clients.filter(c => c.need && c.due <= TODAY && live(c));
const openClients = () => clients.filter(live);
const pipelineValue = () => openClients().reduce((s, c) => s + c.value, 0);
const weighted = () => openClients().reduce((s, c) => s + c.value * (stageOdds[c.stage] ?? 0), 0);
const avatar = c => `<span class="avatar ${c.color}">${esc(c.initials)}</span>`;
const badge = c => `<span class="pill ${c.stage === 'Won' ? 'green' : c.stage === 'Lost' ? 'gray' : ''}">${esc(c.stage)}</span>`;

function toast(message) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4200);
}
function log(text) {
  activity.unshift({ text, time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) });
  activity = activity.slice(0, 12);
}

/* ---------- open slots, shared by booking and by the draft writer ---------- */
function slotsFor(date, ignoreId) {
  const all = [];
  for (let h = 9; h < 17; h++) for (const m of ['00', '30']) all.push(`${pad(h)}:${m}`);
  if (!validDate(date) || isWeekend(date)) return [];
  return all.filter(t => !pastSlot(date, t) && !events.some(e => e.id !== ignoreId && e.date === date && e.time === t));
}
function nextSlots(count = 2) {
  const out = [];
  let day = bizOrNext(TODAY);
  /* One slot per day: two options on two different days reads better in a
     reply than two times on the same afternoon. */
  for (let i = 0; i < 10 && out.length < count; i++) {
    const free = slotsFor(day);
    if (free.length) out.push({ date: day, time: free[0] });
    day = nextBiz(day);
  }
  return out;
}
const slotPhrase = (s, prev) => prev && prev.date === s.date ? timeLabel(s.time) : `${dayName(s.date)} at ${timeLabel(s.time)}`;

/* ---------- the inference layer ----------
   Deterministic reading of an inbound message: budget, timeline, service line,
   intent and fit. This is the seam where a model call goes later — same inputs,
   same output shape, same approval gate downstream. */
const SERVICES = [
  { label: 'Brand positioning', keys: ['brand', 'positioning', 'identity', 'messaging', 'rebrand', 'naming', 'story'] },
  { label: 'Growth strategy', keys: ['growth', 'acquisition', 'funnel', 'revenue', 'pipeline', 'demand', 'go-to-market', 'gtm', 'sales', 'scale'] },
  { label: 'Customer experience', keys: ['customer journey', 'journey', 'experience', 'onboarding', 'retention', 'churn', 'cx'] },
  { label: 'Positioning research', keys: ['research', 'discovery', 'interview', 'audit', 'competitive', 'landscape'] },
  { label: 'Team workshop', keys: ['workshop', 'facilitat', 'offsite', 'align', 'sprint'] }
];
/* Whole-word scoring, so "rebrand" does not outrank an explicit research ask. */
function bestService(text) {
  const t = text.toLowerCase();
  let best = null, top = 0;
  for (const s of SERVICES) {
    const score = s.keys.reduce((n, k) => n + (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(t) ? 1 : 0), 0);
    if (score > top) { top = score; best = s; }
  }
  return best;
}
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function readBudget(text) {
  const m = text.match(/\$\s*([\d][\d,]*(?:\.\d+)?)\s*([km])?/i);
  if (m) {
    let n = parseFloat(m[1].replace(/,/g, ''));
    const unit = (m[2] || '').toLowerCase();
    if (unit === 'k') n *= 1e3;
    if (unit === 'm') n *= 1e6;
    return Math.round(n);
  }
  const k = text.match(/\b(\d{1,3}(?:\.\d+)?)\s*k\b/i);
  return k ? Math.round(parseFloat(k[1]) * 1000) : null;
}
function readTimeline(text) {
  const t = text.toLowerCase();
  if (/\basap\b|urgent|right away|immediately|as soon as/.test(t)) return { label: 'ASAP', phrase: 'an immediate start', rush: true, urgency: 'high' };
  const q = t.match(/\bq([1-4])\b/);
  if (q) return { label: `Q${q[1]}`, phrase: `a Q${q[1]} push`, urgency: 'medium' };
  const month = MONTHS.find(m => t.includes(m));
  if (month) return { label: `${cap(month)} launch`, phrase: `${article(month)} ${cap(month)} launch`, urgency: 'medium' };
  if (/this week|next week/.test(t)) return { label: 'Within a week', phrase: 'a start in the next week or so', urgency: 'high' };
  if (/next month/.test(t)) return { label: 'Next month', phrase: 'a start next month', urgency: 'medium' };
  if (/flexible|no rush|open timing|whenever/.test(t)) return { label: 'Flexible', phrase: 'a flexible timeline', urgency: 'low' };
  return null;
}
function readIntent(text) {
  const t = text.toLowerCase();
  if (/proposal|reviewing|feedback|contract/.test(t)) return 'Proposal feedback';
  if (/scope|deliverable|phase|timeline of work/.test(t)) return 'Scope question';
  if (/time this week|available|schedule|book|call|chat|meet/.test(t)) return 'Wants to talk';
  return 'New project inquiry';
}
function analyze(c) {
  const text = `${c.subject} ${c.message}`;
  const budget = readBudget(text); // Opportunity value is an estimate, not a budget the client stated.
  const timeline = readTimeline(text);
  const service = bestService(text);
  const intent = readIntent(text);
  const fits = budget == null ? null : budget >= settings.minimum;
  const signals = [];
  if (service) signals.push({ label: 'Service', value: service.label });
  if (budget != null) signals.push({ label: 'Budget', value: money(budget), tone: fits ? 'good' : 'warn' });
  if (timeline) signals.push({ label: 'Timeline', value: timeline.label, tone: timeline.urgency === 'high' ? 'warn' : '' });
  signals.push({ label: 'Intent', value: intent });
  if (fits === false) signals.push({ label: 'Note', value: `Below your ${money(settings.minimum)} minimum`, tone: 'warn' });
  return {
    budget, timeline, intent, fits,
    service: service?.label || null,
    signals
  };
}

/* Asking for a budget they already gave you is the tell that nothing read the
   message. Drop any configured question the inquiry has already answered. */
function remainingQuestions(a) {
  const asked = settings.questions.split(/(?<=[?.])\s+/).map(q => q.trim()).filter(Boolean);
  const keep = asked.filter(q => {
    const t = q.toLowerCase();
    if (a.budget != null && /budget|invest|spend|price/.test(t)) return false;
    if (a.timeline && /timeline|timing|when |deadline/.test(t)) return false;
    return true;
  });
  return keep.join(' ');
}

/* Composes the reply from the reading above plus the owner's own preferences. */
function draftFor(c) {
  const a = analyze(c);
  const first = c.name.split(' ')[0];
  const owner = settings.owner.split(' ')[0];
  const opener = {
    'Warm and professional': `Hi ${first}, thank you for getting in touch.`,
    'Concise and direct': `Hi ${first}, thanks for reaching out.`,
    'Friendly and conversational': `Hi ${first}, great to hear from you!`
  }[settings.tone] || `Hi ${first}, thank you for getting in touch.`;

  const parts = [opener];
  if (a.service && a.timeline?.rush) parts[0] += ` ${a.service} is very much what we do at ${settings.name}, and I’d like to confirm the scope before committing to your timing.`;
  else if (a.service && a.timeline && a.timeline.urgency !== 'low') parts[0] += ` ${a.service} ahead of ${a.timeline.phrase} is very much the kind of work we do at ${settings.name}.`;
  else if (a.service && a.timeline) parts[0] += ` ${a.service} is core to what we do at ${settings.name}, and ${a.timeline.phrase} gives us room to scope it properly.`;
  else if (a.service) parts[0] += ` ${a.service} is core to what we do at ${settings.name}.`;
  else parts[0] += ` At ${settings.name}, we help clients with ${settings.services.toLowerCase()}.`;

  if (a.budget != null && a.fits) parts.push(`The ${money(a.budget)} you mentioned is above our ${money(settings.minimum)} starting budget. We can confirm the fee once we agree the scope.`);
  else if (a.budget != null) parts.push(`One note on budget: our engagements typically start at ${money(settings.minimum)}. Is there flexibility in the ${money(a.budget)} budget? We can discuss whether a smaller engagement is possible.`);

  if (a.intent === 'Proposal feedback') parts.push('Happy to walk through any part of the proposal, or to answer questions from whoever else is weighing in.');
  else parts.push(remainingQuestions(a));

  const slots = nextSlots(2);
  if (slots.length >= 2) parts.push(`If it’s easier to talk it through, I have ${slotPhrase(slots[0])} or ${slotPhrase(slots[1], slots[0])} open for a 30-minute call, both Eastern.`);
  else parts.push('If it’s easier to talk it through, I can share a few times for a 30-minute call.');

  parts.push(`Best,\n${owner}`);
  return parts.join('\n\n');
}

/* ---------- views ---------- */
function heading(title, sub, action = '') {
  return `<div class="page-heading compact"><div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;
}
const simulateButton = (cls = 'button primary') => `<button class="${cls}" data-action="simulate">✧ Simulate inbound inquiry</button>`;

function speedTile() {
  const mins = median(responses);
  return `<article class="metric-speed"><span>Median first response ${icon('followups')}</span><strong>${mins < 1 ? '<1' : Math.round(mins)} min<small>sample history and demo approvals</small></strong></article>`;
}

function todayView() {
  const pending = due();
  const today = events.filter(e => e.date === TODAY).sort((a, b) => a.time.localeCompare(b.time));
  return `<div class="page-heading"><div><div class="eyebrow">YOUR DAILY BRIEF</div><h1>A little less busy.<br><span>A lot more momentum.</span></h1><p>Good morning, ${esc(settings.owner.split(' ')[0])}. ${pending.length ? `You have ${pending.length} suggestions ready to review.` : 'You’re all caught up on today’s suggestions.'}</p></div><div class="heading-actions">${simulateButton()}<button class="button subtle" data-view="inbox">Review suggestions <span>↗</span></button></div></div>
<section class="metrics metrics-4" aria-label="Workspace summary"><article><span>Open opportunities ${icon('pipeline')}</span><strong>${openClients().length}<small>clients in motion</small></strong><div class="metric-bars">${[35, 45, 40, 60, 55, 70, 85, 100].map(h => `<i style="height:${h}%"></i>`).join('')}</div></article><article><span>Pipeline value ${icon('today')}</span><strong>${money(pipelineValue())}<small>potential project fees, not revenue</small></strong><div class="metric-line"></div></article><article><span>Needs your approval ${icon('inbox')}</span><strong>${pending.length}<small>${pending.length ? 'drafts ready for your personal touch' : 'nothing waiting on you today'}</small></strong><div class="stacked-avatars">${pending.slice(0, 3).map(avatar).join('')}</div></article>${speedTile()}</section>
<div class="dashboard-grid"><div><section class="panel"><div class="panel-head"><h2>Your next best moves</h2><span class="pill">✧ Prepared by Relay</span></div>${pending.length ? pending.map(c => `<div class="move-row">${avatar(c)}<div><div class="row-title">${esc(c.name)} <span>· ${esc(c.company)}</span></div><p>${c.kind === 'followup' ? 'Keep the conversation going on your proposal.' : c.stage === 'Qualified' ? 'A good-fit client is ready for the next step.' : 'A new inquiry is ready for your reply.'}</p><div class="row-meta"><span>${c.kind === 'followup' ? 'Proposal follow-up' : 'Suggested reply'}</span><span>${money(c.value)} opportunity</span><span>${esc(agoLabel(c.ago))}</span></div></div><button class="button small" data-review="${c.id}">Review ${c.kind === 'followup' ? 'follow-up' : 'reply'} <span>↗</span></button></div>`).join('') : '<div class="empty">✓ All caught up.<p>Today’s replies and follow-ups are taken care of.</p></div>'}</section>
<section class="panel activity-panel"><div class="panel-head"><h2>Recent activity</h2><span class="muted text-small">Today</span></div>${activity.slice(0, 4).map(a => `<div class="activity-row"><span class="activity-check">✓</span><span>${esc(a.text)}</span><small>${esc(a.time)}</small></div>`).join('') || '<div class="empty">Nothing logged yet today.</div>'}</section></div>
<aside><section class="panel schedule-panel"><div class="panel-head"><h2>On your calendar</h2><button class="icon-button" data-view="calendar" aria-label="Open calendar">↗</button></div><div class="calendar-date"><span>${Number(TODAY.slice(-2))}</span><div>${dayName(TODAY)}<small>${parseISO(TODAY).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · Eastern</small></div></div>${today.map(eventRow).join('') || `<div class="empty">A clear calendar today.${isWeekend(TODAY) ? '<p>It’s the weekend — this week’s meetings are on the calendar.</p>' : ''}</div>`}<button class="button wide subtle" data-view="calendar">View full calendar →</button></section>
<section class="insight"><div class="eyebrow">KEEP THE CONVERSATION MOVING</div><h2>A useful reply.<br>A clear next step.</h2><p>Relay prepares the follow-through.<br>You review and approve it.</p><button class="text-button light" data-view="impact">See the math ↗</button></section></aside></div>`;
}

function eventRow(e) {
  const c = find(e.client);
  return `<button class="event-row" data-event="${e.id}"><span class="event-time">${timeLabel(e.time)}</span><div><strong>${esc(e.title)}</strong><span>${esc(c ? c.company : 'Client')}</span><small>${e.duration} min · Video call</small></div></button>`;
}

function inboxView() {
  const matches = clients.filter(c => (inboxFilter !== 'pending' || due().includes(c)) && `${c.name} ${c.company} ${c.subject}`.toLowerCase().includes(inboxQuery.toLowerCase()));
  if (!matches.some(c => c.id === selected)) selected = matches[0]?.id;
  const c = find(selected);
  return heading('Every conversation. One place.', 'Thoughtful replies, with you in control.', `<div class="heading-actions">${simulateButton()}<button class="button subtle" data-action="new-inquiry">＋ Write your own</button></div>`) + `<div class="inbox-layout panel"><section class="thread-list"><div class="inbox-controls"><label class="search-label"><span>⌕</span><input id="search" aria-label="Search conversations" placeholder="Search conversations" value="${esc(inboxQuery)}"></label><div class="tabs"><button data-filter="all" aria-pressed="${inboxFilter === 'all'}" class="${inboxFilter === 'all' ? 'selected' : ''}">All conversations</button><button data-filter="pending" aria-pressed="${inboxFilter === 'pending'}" class="${inboxFilter === 'pending' ? 'selected' : ''}">Needs review <b>${due().length}</b></button></div></div>${matches.map(x => `<button class="thread ${x.id === selected ? 'selected' : ''}" data-thread="${x.id}"><div class="thread-top">${avatar(x)}<div><strong>${esc(x.name)}</strong><small>${esc(x.company)}</small></div>${due().includes(x) ? '<span class="unread" aria-label="Needs review"></span>' : ''}</div><strong class="subject">${esc(x.subject)}</strong><p>${esc(x.sent.at(-1)?.text || x.message)}</p><div class="thread-bottom"><span>${esc(agoLabel(x.ago))}</span><span>${x.sent.length ? 'Replied' : esc(x.source)}</span></div></button>`).join('') || '<div class="empty">No conversations match.</div>'}</section><section class="conversation">${c ? conversation(c) : '<div class="empty">No conversation selected.<p>Choose All conversations or clear your search.</p></div>'}</section></div>`;
}

function conversation(c) {
  if (!c.draft && !c.sent.length && !c.streaming) c.draft = draftFor(c);
  const a = analyze(c);
  const read = `<div class="read-panel ${c.streaming ? 'is-working' : ''}"><div class="read-head"><span class="spark">✧</span><strong>Relay’s read of this message</strong><span class="pill ${a.fits === false ? '' : 'green'}">Rule-based reading</span></div><div class="read-chips">${a.signals.map(s => `<span class="chip ${s.tone || ''}"><b>${esc(s.label)}</b>${esc(s.value)}</span>`).join('')}</div></div>`;
  const timer = c.respondedSec != null
    ? `<div class="sla sla-done">✓ Answered in ${c.respondedSec < 60 ? `${Math.round(c.respondedSec)} seconds` : `${Math.round(c.respondedSec / 60)} min`} · simulated reply</div>`
    : c.arrivedAt ? `<div class="sla"><span class="live-dot"></span>Inbound inquiry · <span id="sla-timer">0s</span> since it landed</div>` : '';
  return `<div class="conversation-head"><div>${avatar(c)}<div><h2>${esc(c.name)}</h2><p>${esc(c.email)}</p></div></div><button class="button small" data-book="${c.id}">${events.some(e => e.client === c.id) ? 'Manage meeting' : 'Book meeting'}</button></div>
<div class="client-context">${badge(c)}<span>${money(c.value)} opportunity</span><button class="text-button" data-client="${c.id}">View client ↗</button></div>${timer}
<div class="messages"><div class="message-heading">${esc(c.subject)}</div><div class="message"><div class="message-label">${esc(c.name)} <span>${esc(agoLabel(c.ago))}</span></div><p>${esc(c.message)}</p></div>${c.sent.map(s => `<div class="message outgoing"><div class="message-label">${esc(settings.owner)} <span>Approved by you</span></div><p>${esc(s.text)}</p></div>`).join('')}</div>
${read}
<div class="composer"><div class="composer-head"><span class="spark">✧</span><strong>${c.sent.length ? 'Write another reply' : 'Suggested reply'}</strong><span class="pill">${esc(settings.tone)}</span></div>${c.streaming ? '<div class="stream-status" id="stream-status" role="status">Reading the message…</div>' : ''}<textarea id="reply-text" aria-label="Reply draft" rows="8" ${c.streaming ? 'readonly' : ''}>${esc(c.draft)}</textarea><div class="composer-footer"><span>Approval records a demo reply. Use your mail app to send it.</span><div class="footer-actions"><button class="button" data-mailto="${c.id}" ${c.streaming ? 'disabled' : ''}>Open in mail app</button><button class="button primary" data-send="${c.id}" ${c.streaming ? 'disabled' : ''}>Approve & send ↗</button></div></div></div>`;
}

function pipelineView() {
  const won = clients.filter(c => c.stage === 'Won').length;
  const lost = clients.filter(c => c.stage === 'Lost').length;
  const decided = won + lost;
  const open = openClients();
  const avg = open.length ? open.reduce((s, c) => s + c.value, 0) / open.length : 0;
  const max = Math.max(1, ...stages.map(s => clients.filter(c => c.stage === s).reduce((t, c) => t + c.value, 0)));
  return heading('Relationships in motion.', 'Track each opportunity from the first hello to a signed yes.', `<div class="pipeline-total">${money(pipelineValue())}<small>open pipeline</small></div>`) + `
<section class="panel analytics"><div class="panel-head"><h2>Pipeline analytics</h2><span class="muted text-small">Across ${clients.length} relationships</span></div><div class="analytics-grid"><div class="stat"><span>Weighted pipeline</span><strong>${money(weighted())}</strong><small>by stage probability</small></div><div class="stat"><span>Average opportunity</span><strong>${money(avg)}</strong><small>${open.length} open</small></div><div class="stat"><span>Win rate</span><strong>${decided ? Math.round((won / decided) * 100) + '%' : '—'}</strong><small>${decided ? `${won} won · ${lost} lost` : 'no decisions yet'}</small></div><div class="stat"><span>Needs you today</span><strong>${due().length}</strong><small>drafts awaiting approval</small></div></div><div class="funnel">${stages.map((s, i) => { const g = clients.filter(c => c.stage === s); const v = g.reduce((t, c) => t + c.value, 0); return `<div class="funnel-row"><span class="funnel-label"><i class="stage-dot s${i}"></i>${s}</span><div class="funnel-track"><i style="width:${(v / max) * 100}%"></i></div><span class="funnel-value">${money(v)} <small>· ${g.length}</small></span></div>`; }).join('')}</div></section>
<div class="kanban">${stages.map((stage, i) => {
    const group = clients.filter(c => c.stage === stage);
    return `<section class="kanban-column"><div class="column-heading"><span class="stage-dot s${i}"></span><h2>${stage}</h2><span>${group.length}</span></div><div class="column-total">${money(group.reduce((s, c) => s + c.value, 0))}</div>${group.map(c => `<button class="client-card" data-client="${c.id}"><div class="client-card-top">${avatar(c)}<span>↗</span></div><h3>${esc(c.company)}</h3><p>${esc(c.name)}</p><div class="card-note">${esc(c.note)}</div><div class="client-card-bottom"><strong>${money(c.value)}</strong><span>${due().includes(c) ? 'Needs review' : 'View details'}</span></div></button>`).join('') || '<div class="column-empty">No clients here yet</div>'}</section>`;
  }).join('')}</div><p class="page-note">Select a client to review their details, update their stage, or book a meeting.</p>`;
}

function getWeek() {
  const start = mondayOf(TODAY);
  return Array.from({ length: 5 }, (_, i) => addDays(start, weekOffset * 7 + i));
}
function calendarView() {
  const days = getWeek();
  return heading('Make room for good conversations.', 'Discovery calls, check-ins, and next steps. All times Eastern.', `<button class="button primary" data-action="new-booking">＋ Book a meeting</button>`) + `<section class="panel calendar-panel"><div class="panel-head"><div class="week-control"><button class="icon-button" data-week="-1" aria-label="Previous week">‹</button><h2>${prettyDate(days[0])} – ${prettyDate(days[4])}, ${days[0].slice(0, 4)}</h2><button class="icon-button" data-week="1" aria-label="Next week">›</button></div><button class="button small" data-action="this-week">This week</button></div><div class="week-grid">${days.map(d => `<section class="day-column ${d === TODAY ? 'is-today' : ''}"><div class="day-heading"><span>${parseISO(d).toLocaleDateString('en-US', { weekday: 'short' })}</span><strong>${Number(d.slice(-2))}</strong></div><div class="day-events">${events.filter(e => e.date === d).sort((a, b) => a.time.localeCompare(b.time)).map(e => { const c = find(e.client); return `<button class="calendar-event ${c ? c.color : 'blue'}" data-event="${e.id}"><span>${timeLabel(e.time)} · ${e.duration} min</span><strong>${esc(e.title)}</strong><small>${esc(c ? c.company : '')}</small><span class="event-video">▣ Video call</span></button>`; }).join('') || '<p class="free-day">No meetings</p>'}</div></section>`).join('')}</div></section><div class="calendar-footer"><span class="pill green">${events.filter(e => days.includes(e.date)).length} meetings this week</span><span>Prototype calendar · nothing is synced to Google or Outlook</span></div>`;
}

function followupsView() {
  const list = clients.filter(c => c.kind === 'followup' && c.need && live(c)).sort((a, b) => a.due.localeCompare(b.due));
  return heading('A thoughtful nudge goes a long way.', 'Keep proposals moving without keeping it all in your head.') + `<div class="followup-intro"><span class="spark">✧</span><div><strong>You set the pace. Relay prepares the words.</strong><p>Every follow-up stays in your review queue until you approve it. Keep the next step visible without relying on memory.</p></div></div><section class="panel"><div class="panel-head"><h2>Upcoming follow-ups</h2><span class="pill">${list.length} waiting</span></div>${list.map(c => `<div class="followup-row">${avatar(c)}<div class="followup-client"><h3>${esc(c.company)}</h3><p>${esc(c.name)} · ${money(c.value)} proposal</p></div><div class="followup-preview"><strong>${c.due <= TODAY ? 'Due today' : prettyDate(c.due)}</strong><p>${esc(c.draft)}</p></div><div class="row-actions"><button class="button small" data-snooze="${c.id}">Snooze</button><button class="button primary small" data-review="${c.id}">Review draft ↗</button></div></div>`).join('') || '<div class="empty">All follow-ups are up to date.<p>Your next conversations are waiting in the inbox.</p></div>'}</section>`;
}

/* ---------- illustrative impact scenario (unvalidated recovery assumptions) ---------- */
function lossShare(hours) {
  if (hours <= 5 / 60) return 0;
  if (hours <= 0.5) return 0.03;
  if (hours <= 4) return 0.08;
  if (hours <= 24) return 0.14;
  return 0.18;
}
function impactNumbers() {
  const inq = Math.max(0, Number(roi.inquiries) || 0);
  const fee = Math.max(0, Number(roi.fee) || 0);
  const close = Math.min(100, Math.max(0, Number(roi.close) || 0)) / 100;
  const hours = Math.max(0, Number(roi.respondHours) || 0);
  const price = Math.max(1, Number(roi.price) || 1);
  const recovered = inq * lossShare(hours);
  const nowWins = (inq - recovered) * close;
  const gain = recovered * close;
  const monthly = gain * fee;
  return {
    inq, fee, close, hours, price, nowWins, recovered, gain, monthly,
    relayWins: nowWins + gain,
    annual: monthly * 12,
    roi: monthly / price,
    cadence: gain > 0 ? 4.33 / gain : 0
  };
}
const cadenceLabel = n => !n.gain ? 'No delay to recover — you already answer fast.'
  : n.cadence <= 1.4 ? 'about one extra project a week'
  : n.cadence <= 9 ? `about one extra project every ${Math.round(n.cadence)} weeks`
  : `about ${(n.gain * 12).toFixed(0)} extra projects a year`;

function impactView() {
  const n = impactNumbers();
  const field = (key, label, attrs) => `<label>${label}<input data-roi="${key}" type="number" value="${esc(roi[key])}" ${attrs}></label>`;
  return heading('Explore a possible business case.', 'An illustrative scenario with assumed recovery rates, not measured Relay results.') + `
<div class="impact-layout"><section class="panel"><div class="panel-head"><h2>Your inputs</h2><span class="pill">Editable</span></div><div class="form-body"><div class="form-grid">${field('inquiries', 'Inbound inquiries per month', 'min="0" max="500"')}${field('fee', 'Average project fee ($)', 'min="0" max="1000000" step="500"')}</div><div class="form-grid">${field('close', 'Your close rate on inquiries you reach (%)', 'min="0" max="100"')}${field('respondHours', 'Your typical response time (hours)', 'min="0" max="336" step="0.5"')}</div>${field('price', 'Relay price per month ($)', 'min="1" max="10000"')}<p class="text-small muted">These are editable sample inputs. Subscription pricing is a planning assumption, not an offer. The calculation excludes delivery costs and does not predict actual revenue.</p></div></section>
<section class="panel impact-out"><div class="panel-head"><h2>Modelled outcome</h2><span class="pill green" id="roi-multiple">${n.roi >= 1 ? `${Math.round(n.roi)}× the subscription` : 'Below subscription cost'}</span></div><div class="form-body"><div class="impact-compare"><div class="impact-col"><span>With assumed delays</span><strong id="roi-now">${n.nowWins.toFixed(1)}</strong><small>per month</small></div><div class="impact-arrow">→</div><div class="impact-col win"><span>If all delayed leads are recovered</span><strong id="roi-relay">${n.relayWins.toFixed(1)}</strong><small>per month</small></div></div>
<div class="impact-headline"><span>Illustrative additional gross project fees</span><strong id="roi-monthly">${money(n.monthly)}<small> / month</small></strong><b id="roi-annual">${money(n.annual)} a year · ${cadenceLabel(n)}</b></div>
<p class="text-small muted" id="roi-assumptions">${esc(impactAssumptions(n))}</p></div></section></div>
<section class="panel sources"><div class="panel-head"><h2>How this scenario works</h2></div><div class="form-body"><ul class="source-list"><li>Assumed share of inquiries lost to delay: 0% at 5 minutes or less, 3% up to 30 minutes, 8% up to 4 hours, 14% up to 24 hours, and 18% beyond 24 hours.</li><li>These rates are illustrative product assumptions, not research findings or measured conversion improvements.</li><li>Additional fees = inquiries × assumed lost share × close rate × project fee. This assumes every delayed inquiry is recovered.</li><li>Validate these assumptions with pilot customers before using the calculation to make a business decision.</li></ul></div></section>`;
}
function impactAssumptions(n) {
  return `This scenario assumes ${Math.round(lossShare(n.hours) * 100)}% of inquiries are lost to delay and all are recovered, with a ${Math.round(n.close * 100)}% close rate. These are illustrative assumptions, not a guarantee or research-derived forecast.`;
}
function paintImpact() {
  const n = impactNumbers();
  const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
  set('#roi-assumptions', impactAssumptions(n));
  set('#roi-now', n.nowWins.toFixed(1));
  set('#roi-relay', n.relayWins.toFixed(1));
  set('#roi-annual', `${money(n.annual)} a year · ${cadenceLabel(n)}`);
  set('#roi-multiple', n.roi >= 1 ? `${Math.round(n.roi)}× the subscription` : 'Below subscription cost');
  const m = $('#roi-monthly');
  if (m) m.innerHTML = `${money(n.monthly)}<small> / month</small>`;
}

function settingsView() {
  return heading('Your business. Your way.', 'Give your coordinator the context to sound like part of your team.') + `<form id="settings-form" class="settings-layout"><section class="panel settings-panel"><div class="panel-head"><h2>Business profile</h2><span class="pill">Saved in this browser</span></div><div class="form-body"><div class="form-grid"><label>Business name<input name="name" required maxlength="80" value="${esc(settings.name)}"></label><label>Your name<input name="owner" required maxlength="80" value="${esc(settings.owner)}"></label></div><label>Services you offer<textarea name="services" required rows="3" maxlength="500">${esc(settings.services)}</textarea></label><div class="form-grid"><label>Starting project budget ($)<input name="minimum" type="number" min="0" max="1000000" required value="${settings.minimum}"></label><label>Reply tone<select name="tone">${['Warm and professional', 'Concise and direct', 'Friendly and conversational'].map(t => `<option ${settings.tone === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div><label>Questions for new clients<textarea name="questions" required maxlength="600" rows="3">${esc(settings.questions)}</textarea></label><div class="form-bottom"><span>Applies to every new suggestion Relay prepares.</span><button class="button primary" type="submit">Save preferences</button></div></div></section>
<aside><section class="panel"><div class="panel-head"><h2>You stay in control</h2></div><div class="guardrail"><span>✓</span><div><strong>Review before sending</strong><p>Every message waits for your approval.</p></div></div><div class="guardrail"><span>✓</span><div><strong>Confirm before booking</strong><p>Choose the client, date, and available time.</p></div></div><div class="guardrail"><span>✓</span><div><strong>Untrusted input stays untrusted</strong><p>Client messages are read as data. Instructions inside them are never obeyed.</p></div></div></section>
<section class="panel connection-panel"><div class="panel-head"><h2>Connections</h2></div><div class="connection"><span>Email</span><span class="pill gray">Not connected</span></div><div class="connection"><span>Calendar</span><span class="pill gray">Not connected</span></div><div class="connection"><span>Drafting engine</span><span class="pill gray">On-device rules</span></div><p>Gmail, Outlook, Google Calendar and a model-backed drafting engine are the next build steps.</p></section>
<section class="panel"><div class="panel-head"><h2>This workspace</h2></div><div class="form-body"><p class="text-small muted">Your changes are saved in this browser only. Export a copy to move a scenario to another machine.</p><div class="modal-actions"><button type="button" class="button" data-action="export">Export JSON</button><button type="button" class="button" data-action="import">Import JSON</button></div><input type="file" id="import-file" accept="application/json,.json" hidden></div></section></aside></form>`;
}

/* ---------- render ---------- */
const VIEWS = { today: todayView, inbox: inboxView, pipeline: pipelineView, calendar: calendarView, followups: followupsView, impact: impactView, settings: settingsView };
function navTo(next) {
  if (!VIEWS[next]) return;
  view = next;
  history.replaceState(null, '', '#' + next);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function render() {
  const label = navs.find(n => n[0] === view)[1];
  document.title = `${label} · Relay`;
  $('#nav').innerHTML = navs.map(([key, text]) => `<button data-view="${key}" class="${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${text}</span>${key === 'inbox' && due().length ? `<span class="count">${due().length}</span>` : ''}</button>`).join('');
  $('#breadcrumb').innerHTML = `Workspace <span>/</span> ${label}`;
  $('.workspace strong').textContent = settings.name;
  $('.profile strong').textContent = settings.owner;
  const date = $('.top-date');
  if (date) date.textContent = longDate(TODAY);
  $('#main').innerHTML = VIEWS[view]();
  save();
}

/* ---------- modals ---------- */
function showModal(title, body) {
  $('#modal').innerHTML = `<div class="modal-heading"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">×</button></div>${body}`;
  $('#modal').showModal();
}
function clientModal(id) {
  const c = find(id);
  if (!c) return;
  const a = analyze(c);
  showModal(esc(c.company), `<div class="modal-body"><div class="client-summary">${avatar(c)}<div><strong>${esc(c.name)}</strong><p>${esc(c.email)}</p></div><strong>${money(c.value)}</strong></div><p class="muted">${esc(c.note)}</p><div class="read-chips compact">${a.signals.map(s => `<span class="chip ${s.tone || ''}"><b>${esc(s.label)}</b>${esc(s.value)}</span>`).join('')}</div><form id="stage-form" data-id="${c.id}"><label>Client stage<select name="stage">${stages.map(s => `<option ${s === c.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></label><div class="modal-actions"><button type="button" class="button" data-review="${c.id}">Open conversation</button><button class="button primary" type="submit">Update stage</button></div><p class="text-small muted">Changing a stage does not cancel an existing meeting.</p></form></div>`);
}
const MAX_DATE = addDays(TODAY, 450);
function bookingModal(id, eventId) {
  const existing = events.find(e => e.id === Number(eventId)) || events.find(e => e.client === Number(id));
  const c = find(id) || find(existing?.client) || clients[0];
  showModal(existing ? 'Manage meeting' : 'Book a discovery call', `<form id="booking-form" data-event="${existing?.id || ''}" class="modal-body"><p class="modal-subtitle">Reserve 30 minutes, Monday through Friday, 9 AM–5 PM Eastern.</p><label>Client<select name="client" ${existing ? 'disabled' : ''}>${clients.filter(x => existing ? x.id === existing.client : live(x)).map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)} · ${esc(x.company)}</option>`).join('')}</select></label><label>Meeting title<input name="title" required maxlength="80" value="${esc(existing?.title || 'Discovery call')}"></label><div class="form-grid"><label>Date<input name="date" type="date" required min="${TODAY}" max="${MAX_DATE}" value="${existing?.date || nextBiz(TODAY)}"></label><label>Time (Eastern)<select name="time" required></select></label></div><div class="booking-note">▣ Video call · 30 minutes<br><small>This creates a prototype booking. No invitation is sent.</small></div><div id="booking-error" role="alert" class="error"></div><div class="modal-actions">${existing ? `<button type="button" class="button" data-ics="${existing.id}">Download .ics</button><button type="button" class="button danger" data-cancel-event="${existing.id}">Cancel meeting</button>` : '<button type="button" class="button" data-action="close-modal">Never mind</button>'}<button class="button primary" type="submit">${existing ? 'Save changes' : 'Confirm booking'}</button></div></form>`);
  updateSlots(existing?.time);
}
function updateSlots(preferred) {
  const form = $('#booking-form');
  if (!form) return;
  const date = form.elements.date.value, select = form.elements.time;
  if (!date) { select.innerHTML = '<option value="">Choose a date</option>'; return; }
  if (isWeekend(date)) { select.innerHTML = '<option value="">Choose a weekday</option>'; return; }
  const available = slotsFor(date, Number(form.dataset.event));
  select.innerHTML = available.length
    ? available.map(t => `<option value="${t}" ${t === preferred ? 'selected' : ''}>${timeLabel(t)}</option>`).join('')
    : '<option value="">No times available</option>';
}
function inquiryModal() {
  showModal('Write your own inquiry', `<form id="inquiry-form" class="modal-body"><p class="modal-subtitle">Paste anything a real prospect might send. Relay reads it for budget, timeline and service line, then drafts a reply in your tone.</p><div class="form-grid"><label>Client name<input name="name" required maxlength="70" placeholder="Jordan Lee"></label><label>Company<input name="company" required maxlength="80" placeholder="Brightside"></label></div><label>Project budget ($)<input name="value" required type="number" min="0" max="1000000" value="7500"></label><label>Their message<textarea name="message" rows="4" required maxlength="2000" placeholder="We’re looking for help with…"></textarea></label><div class="booking-note">Drafting runs on a rules engine inside your browser. Try mentioning a budget, a month, or a service to watch what it picks up.</div><div class="modal-actions"><button type="button" class="button" data-action="close-modal">Cancel</button><button class="button primary" type="submit">Create inquiry & draft ↗</button></div></form>`);
}

/* ---------- actions ---------- */
function approveReply(id, text) {
  const c = find(id);
  if (!c || !text?.trim()) throw Error('Write a reply before sending.');
  c.sent.push({ text: text.trim() });
  c.need = false;
  c.draft = '';
  c.ago = 0;
  if (c.arrivedAt && c.respondedSec == null) {
    c.respondedSec = (Date.now() - c.arrivedAt) / 1000;
    responses.push(Math.max(0.2, c.respondedSec / 60));
  }
  log(`Reply approved for ${c.company}`);
  render();
  return { clientId: c.id, status: 'recorded_in_prototype', externalMessageSent: false, respondedSec: c.respondedSec ?? null };
}
function book(data) {
  const c = find(data.client);
  const existing = events.find(e => e.id === Number(data.event));
  if (!c) throw Error('Choose a client.');
  if (!validDate(data.date) || data.date < TODAY || data.date > MAX_DATE) throw Error(`Choose a date between ${prettyDate(TODAY)} and ${prettyDate(MAX_DATE)}.`);
  if (isWeekend(data.date)) throw Error('Meetings are available Monday through Friday.');
  if (!validTime(data.time)) throw Error('Choose an available time.');
  if (pastSlot(data.date, data.time)) throw Error('Choose a future time.');
  if (events.some(e => e.id !== existing?.id && e.date === data.date && e.time === data.time)) throw Error('That time has been booked. Choose another.');
  if (!data.title.trim()) throw Error('Enter a meeting title.');
  if (!existing && events.some(e => e.client === c.id)) throw Error('This client already has a meeting. Open their existing meeting to reschedule.');
  const event = { id: existing?.id || nextEvent++, client: c.id, date: data.date, time: data.time, title: data.title.trim(), duration: 30 };
  if (existing) Object.assign(existing, event);
  else {
    events.push(event);
    if (['New inquiry', 'Qualified'].includes(c.stage)) c.stage = 'Meeting booked';
  }
  log(`${existing ? 'Meeting rescheduled' : 'Meeting booked'} with ${c.company}`);
  return event;
}

/* Pool of realistic inbound messages. Each exercises a different read:
   a good-fit rush job, a large growth deal, one under the minimum, one flexible. */
const INBOUND = [
  { name: 'Priya Raman', company: 'Tandem Health', color: 'purple', email: 'priya@tandem.example', subject: 'Positioning help before our Q1 push', message: 'Hi! We’re a telehealth startup and our messaging is all over the place. We need brand positioning sorted before a Q1 launch and have about $14,000 set aside. Do you have time this week for a call?', value: 14000 },
  { name: 'Marcus Hale', company: 'Northwind Outdoors', color: 'blue', email: 'marcus@northwind.example', subject: 'Growth has stalled — need help ASAP', message: 'Our acquisition funnel has flattened two quarters in a row and the board wants a plan. Budget is $22,000 and honestly we need to start ASAP. Can you help with growth strategy?', value: 22000 },
  { name: 'Lena Okoro', company: 'Cobalt Studio', color: 'pink', email: 'lena@cobalt.example', subject: 'Small onboarding project?', message: 'We’re a four-person studio and our customer onboarding is losing people. Retention is the worry. We only have about $4,000 for this, timing is flexible.', value: 4000 },
  { name: 'Tom Reyes', company: 'Halverson & Pike', color: 'green', email: 'tom@halverson.example', subject: 'Competitive research engagement', message: 'We’d like a competitive landscape audit and some customer interviews before we commit to a rebrand in October. Budget around $9,500, timing is fairly flexible.', value: 9500 }
];
let inboundIndex = 0;
function simulateInquiry() {
  const t = INBOUND[inboundIndex % INBOUND.length];
  inboundIndex++;
  const c = {
    id: nextClient++, ...t,
    initials: t.name.split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase(),
    stage: 'New inquiry', source: 'Website inquiry', ago: 0, kind: 'reply',
    due: TODAY, need: true, sent: [], draft: '', streaming: true,
    arrivedAt: Date.now(), note: 'New inquiry · Needs qualification'
  };
  clients.unshift(c);
  log(`New inquiry from ${c.company}`);
  selected = c.id;
  inboxFilter = 'all';
  inboxQuery = '';
  $('#modal').close();
  navTo('inbox');
  toast(`Inquiry from ${c.company} just landed. Relay is reading it.`);
  streamDraft(c.id);
}
/* Shows the work: read the message, then type the draft. Cosmetic, but it is the
   difference between "a mockup" and "something that responded". */
async function streamDraft(id) {
  const c = find(id);
  if (!c) return;
  const token = streamToken;
  c.streaming = true;
  c.draft = '';
  render();
  const phases = ['Reading the message…', 'Reading budget, timeline and service line…', 'Checking your calendar for open slots…', `Drafting in your ${settings.tone.toLowerCase()} tone…`];
  for (const phase of phases) {
    if (token !== streamToken) return;
    const el = selected === c.id && view === 'inbox' ? $('#stream-status') : null;
    if (el) el.textContent = phase;
    await sleep(calm() ? 0 : 430);
  }
  const text = draftFor(c);
  if (!calm()) {
    for (let i = 0; i < text.length; i += 3) {
      if (token !== streamToken) return;
      c.draft = text.slice(0, i + 3);
      if (selected === c.id && view === 'inbox') {
        const ta = $('#reply-text');
        if (ta) { ta.value = c.draft; ta.scrollTop = ta.scrollHeight; }
      }
      await sleep(7);
    }
  }
  if (token !== streamToken) return;
  c.draft = text;
  c.streaming = false;
  if (selected === c.id && view === 'inbox') render(); else save();
}

/* ---------- real side effects: a mail handoff and a calendar file ---------- */
function mailtoFor(id) {
  const c = find(id);
  if (!c) return;
  const body = ($('#reply-text')?.value || c.draft || '').trim();
  if (!body) { toast('Nothing to send yet.'); return; }
  const url = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent('Re: ' + c.subject)}&body=${encodeURIComponent(body)}`;
  if (url.length > 1900) toast('Draft is long — your mail app may trim it.');
  window.location.href = url;
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function easternInstant(date, time) {
  const [year, month, day] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const p = easternParts(new Date(instant));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    instant += target - represented;
  }
  return new Date(instant);
}
const icsStamp = date => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
const icsText = value => String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function calendarFile(e, c) {
  const start = easternInstant(e.date, e.time), end = new Date(start.getTime() + e.duration * 60000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Relay Prototype//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:relay-${e.id}-${e.date}@relay.prototype`, `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(e.title + (c ? ' — ' + c.company : ''))}`,
    `DESCRIPTION:${e.duration}-minute video call booked in the Relay prototype.`, 'END:VEVENT', 'END:VCALENDAR'];
  // Fold long UTF-8 content lines without splitting a code point.
  const encoder = new TextEncoder();
  return lines.map(line => {
    let result = '', bytes = 0;
    for (const ch of line) { const size = encoder.encode(ch).length; if (bytes + size > 75) { result += '\r\n '; bytes = 1; } result += ch; bytes += size; }
    return result;
  }).join('\r\n') + '\r\n';
}
function icsFor(eventId) {
  const e = events.find(x => x.id === Number(eventId));
  if (!e) return;
  download(`relay-${e.date}-${e.time.replace(':', '')}.ics`, calendarFile(e, find(e.client)), 'text/calendar');
  toast('Calendar file downloaded with Eastern time converted to UTC.');
}
function exportWorkspace() {
  download(`relay-workspace-${TODAY}.json`, JSON.stringify({ day: TODAY, clients, events, settings, roi, activity, responses, nextClient, nextEvent }, null, 2), 'application/json');
  toast('Workspace exported.');
}
function importWorkspace(file) {
  if (file.size > 2 * 1024 * 1024) { toast('Choose a Relay export smaller than 2 MB.'); return; }
  const reader = new FileReader();
  reader.onerror = () => toast('The file could not be read. Your workspace is unchanged.');
  reader.onload = () => {
    let data;
    try { data = decodeWorkspace(JSON.parse(String(reader.result))); }
    catch (_) { toast('That file is not a valid Relay export. Your workspace is unchanged.'); return; }
    applyWorkspace(data);
    log('Workspace imported');
    render();
    toast('Workspace imported.');
  };
  reader.readAsText(file);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-view]');
  if (!b) return;
  const d = b.dataset;
  if (d.view) { navTo(d.view); return; }
  if (d.review) { $('#modal').close(); selected = Number(d.review); inboxFilter = 'all'; inboxQuery = ''; navTo('inbox'); return; }
  if (d.thread) { selected = Number(d.thread); render(); return; }
  if (d.filter) { inboxFilter = d.filter; render(); return; }
  if (d.send) {
    try {
      const r = approveReply(d.send, $('#reply-text').value);
      toast(r.respondedSec != null
        ? `Approved in ${Math.round(r.respondedSec)} seconds in this demo. No real email was sent.`
        : 'Reply recorded. No real email was sent.');
    } catch (err) { toast(err.message); }
    return;
  }
  if (d.mailto) { mailtoFor(d.mailto); return; }
  if (d.ics) { icsFor(d.ics); return; }
  if (d.client) { clientModal(d.client); return; }
  if (d.book) { bookingModal(d.book); return; }
  if (d.event) { bookingModal(null, d.event); return; }
  if (d.week) { weekOffset += Number(d.week); render(); return; }
  if (d.snooze) {
    const c = find(d.snooze);
    c.due = nextBiz(c.due < TODAY ? TODAY : c.due, 2);
    log(`Follow-up with ${c.company} moved to ${prettyDate(c.due)}`);
    render();
    toast(`Follow-up moved to ${prettyDate(c.due)}.`);
    return;
  }
  if (d.cancelEvent) {
    const event = events.find(x => x.id === Number(d.cancelEvent));
    const c = find(event.client);
    events = events.filter(x => x.id !== event.id);
    if (c && c.stage === 'Meeting booked') c.stage = 'Qualified';
    log(`Meeting canceled with ${c ? c.company : 'client'}`);
    $('#modal').close();
    render();
    toast('Meeting canceled.');
    return;
  }
  if (b.id === 'reset') {
    showModal('Reset this demo?', `<div class="modal-body"><p>This restores the sample clients, meetings and preferences, and clears what is saved in this browser.</p><div class="modal-actions"><button class="button" data-action="close-modal">Keep exploring</button><button class="button primary" data-action="confirm-reset">Reset demo</button></div></div>`);
    return;
  }
  switch (d.action) {
    case 'close-modal': $('#modal').close(); break;
    case 'new-inquiry': inquiryModal(); break;
    case 'new-booking': bookingModal(); break;
    case 'simulate': simulateInquiry(); break;
    case 'this-week': weekOffset = 0; render(); break;
    case 'export': exportWorkspace(); break;
    case 'import': $('#import-file')?.click(); break;
    case 'confirm-reset': wipe(); location.hash = 'today'; location.reload(); break;
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') {
    const pos = t.selectionStart;
    inboxQuery = t.value;
    render();
    const box = $('#search');
    if (box) { box.focus(); box.setSelectionRange(pos, pos); }
    return;
  }
  if (t.id === 'reply-text') {
    const c = find(selected);
    if (c && !c.streaming) { c.draft = t.value; save(); }
    return;
  }
  if (t.dataset.roi) {
    const bounds = { inquiries: [0,500], fee: [0,1000000], close: [0,100], respondHours: [0,336], price: [1,10000] };
    const [min, max] = bounds[t.dataset.roi];
    roi[t.dataset.roi] = Math.min(max, Math.max(min, Number(t.value) || min));
    paintImpact();
    save();
  }
});

document.addEventListener('change', e => {
  if (e.target.closest('#booking-form') && e.target.name === 'date') updateSlots();
  if (e.target.id === 'import-file' && e.target.files?.[0]) { importWorkspace(e.target.files[0]); e.target.value = ''; }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const d = Object.fromEntries(new FormData(f));
  if (f.id === 'settings-form') {
    settings = { ...settings, ...d, minimum: Number(d.minimum) };
    log('Business preferences updated');
    render();
    toast('Preferences saved in this browser.');
  }
  if (f.id === 'stage-form') {
    const c = find(f.dataset.id);
    c.stage = d.stage;
    log(`${c.company} moved to ${d.stage}`);
    $('#modal').close();
    render();
    toast('Client stage updated.');
  }
  if (f.id === 'inquiry-form') {
    const name = d.name.trim();
    const c = {
      id: nextClient++, name, company: d.company.trim(),
      initials: name.split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase(),
      color: 'purple', email: `${name.split(/\s+/)[0].toLowerCase()}@example.com`,
      subject: 'New project inquiry', message: d.message.trim(),
      stage: 'New inquiry', value: Number(d.value), source: 'Your inquiry',
      ago: 0, kind: 'reply', due: TODAY, need: true, sent: [], draft: '',
      streaming: true, arrivedAt: Date.now(), note: 'New inquiry · Needs qualification'
    };
    clients.unshift(c);
    log(`New inquiry from ${c.company}`);
    selected = c.id;
    inboxFilter = 'all';
    inboxQuery = '';
    $('#modal').close();
    navTo('inbox');
    streamDraft(c.id);
  }
  if (f.id === 'booking-form') {
    try {
      const existing = events.find(x => x.id === Number(f.dataset.event));
      const ev = book({ ...d, client: existing?.client || Number(d.client), event: f.dataset.event });
      $('#modal').close();
      weekOffset = Math.round((parseISO(mondayOf(ev.date)) - parseISO(mondayOf(TODAY))) / 604800000);
      navTo('calendar');
      toast(`Meeting ${existing ? 'updated' : 'booked'} for ${prettyDate(ev.date)} at ${timeLabel(ev.time)}.`);
    } catch (err) {
      const box = $('#booking-error');
      if (box) box.textContent = err.message;
    }
  }
});

window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (VIEWS[next]) { view = next; render(); }
});

/* Live counter on a simulated inquiry — the number the whole pitch rests on. */
setInterval(() => {
  const el = $('#sla-timer');
  if (!el) return;
  const c = find(selected);
  if (!c?.arrivedAt || c.respondedSec != null) return;
  const s = Math.floor((Date.now() - c.arrivedAt) / 1000);
  el.textContent = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}, 1000);

/* ---------- boot ---------- */
load();
if (VIEWS[location.hash.slice(1)]) view = location.hash.slice(1);
if (!find(selected)) selected = clients[0]?.id;
render();

/* ---------- optional MCP surface for AI hosts ---------- */
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const tools = [
    {
      name: 'relay_read_demo_workspace',
      description: 'Read sample clients and bookings in the current Relay prototype. No real accounts are connected.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!input || Object.keys(input).length) throw Error('Expected an empty object.');
        return {
          clients: clients.map(({ id, name, company, stage, value }) => ({ id, name, company, stage, value })),
          events,
          medianResponseMinutes: median(responses)
        };
      }
    },
    {
      name: 'relay_open_client_conversation',
      description: 'Navigate to a sample client conversation. Does not send or approve a reply.',
      inputSchema: { type: 'object', properties: { clientId: { type: 'integer' } }, required: ['clientId'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!Number.isInteger(input?.clientId) || !find(input.clientId) || Object.keys(input).some(k => k !== 'clientId')) throw Error('A valid clientId is required.');
        selected = input.clientId;
        inboxFilter = 'all';
        inboxQuery = '';
        navTo('inbox');
        return { view, clientId: selected };
      }
    }
  ];
  for (const tool of tools) {
    try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
  }
}
