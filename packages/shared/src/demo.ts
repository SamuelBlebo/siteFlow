// Sample projects for "Explore with sample data": three Ghanaian jobs with about six weeks of
// history, so every screen has something real-looking to show. Pure data: the loadDemo Cloud
// Function writes it, removeDemo deletes it. Everything is marked sample: true, uses ids that start
// with "sample-", and sends no messages (the triggers and scheduled jobs skip sample sites).
//
// Dates are worked out from the day it is loaded, so the data always looks current.
import { WORK_TYPES } from './constants';
import { issueDoc } from './logic/issues';
import { DEMO_DRAWINGS } from './demoDrawings';
import { overallProgress, standardMilestones } from './logic/progress';
import { materialsUsed, reportDoc, reportId } from './logic/reports';
import { siteFields } from './logic/sites';
import { DEFAULT_COUNTRY, countryOf, type Country } from './locale';
import type { IssuePriority, IssueStatus, MaterialLogType } from './types';

export const SAMPLE_PREFIX = 'sample-';
export const isSample = (s: { sample?: boolean } | null | undefined) => !!s?.sample;

const DAY = 86400000;
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
// Working days (Monday to Saturday) going back from today, newest first
function workDaysBack(now: Date, n: number) {
  const out: string[] = [];
  for (let i = 0; out.length < n; i++) { const d = addDays(now, -i); if (d.getDay() !== 0) out.push(key(d)); }
  return out;
}
// Small seeded random numbers, so the same day always builds the same data (and tests are stable)
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

type Crew = [name: string, trade: string, rate: number];
interface MaterialSpec { name: string; unit: string; reorderLevel: number; avgDaily: number; start: number; price: number }
interface Plan {
  key: string; name: string; location: string; workType: string; stageIndex: number; budget: number;
  startDaysAgo: number; lengthDays: number; foremanName: string; foremanPhone: string; client: { name: string; phone: string; email: string };
  reportsToday: boolean; crew: Crew[]; materials: MaterialSpec[]; photos: string[];
  work: string[]; issues: { title: string; priority: IssuePriority; category: string; location: string; status: IssueStatus; daysAgo: number; description: string }[];
  weekly: { Equipment: number; Transport: number };
}

const PLANS: Plan[] = [
  {
    key: 'adenta', name: 'Adenta 4-bedroom residence', location: 'Adenta, Accra', workType: 'building', stageIndex: 3, budget: 650000,
    startDaysAgo: 150, lengthDays: 270, foremanName: 'Kwame Mensah', foremanPhone: '0241234567',
    client: { name: 'Mr and Mrs Addo', phone: '0244556677', email: 'addo.family@example.com' },
    reportsToday: false,
    crew: [['Kofi Asante', 'Mason', 180], ['Ebo Quansah', 'Mason', 180], ['Musah Ibrahim', 'Steel bender', 170], ['Selorm Agbeko', 'Carpenter', 170], ['Akua Donkor', 'Labourer', 110], ['Yaw Tetteh', 'Labourer', 110]],
    materials: [
      { name: 'Cement (50kg)', unit: 'bags', reorderLevel: 30, avgDaily: 6, start: 120, price: 98 },
      { name: 'Iron rods 12mm', unit: 'lengths', reorderLevel: 20, avgDaily: 2, start: 60, price: 92 },
      { name: 'Sandcrete blocks 6"', unit: 'pcs', reorderLevel: 300, avgDaily: 60, start: 1200, price: 7 },
      { name: 'Sharp sand', unit: 'trips', reorderLevel: 2, avgDaily: 0.2, start: 6, price: 800 },
    ],
    photos: ['adenta-blockwork', 'adenta-blocks-course', 'adenta-crew', 'adenta-block-moulding', 'adenta-plastering'],
    work: ['Blockwork to lintel level on the east wing.', 'Formwork for the living room lintels.', 'Cast lintels over the bedroom windows.',
      'Fixed reinforcement for the lintel beam on grid B.', 'Blockwork on the west wing, 4 courses.', 'Cleared and cured yesterday\'s lintels.'],
    issues: [
      { title: 'Crack in blockwork above window', priority: 'medium', category: 'Quality', location: 'East wing, bedroom 2', status: 'open', daysAgo: 3, description: 'Hairline crack above the window opening. Check before plastering.' },
      { title: 'Cement delivery came short by 10 bags', priority: 'low', category: 'Materials', location: 'Store', status: 'resolved', daysAgo: 12, description: 'Supplier sent the missing bags the next day.' },
    ],
    weekly: { Equipment: 1800, Transport: 1600 },
  },
  {
    key: 'legon', name: 'East Legon office complex', location: 'East Legon, Accra', workType: 'building', stageIndex: 4, budget: 3200000,
    startDaysAgo: 270, lengthDays: 520, foremanName: 'Yaw Boateng', foremanPhone: '0201234567',
    client: { name: 'Northgate Properties Ltd', phone: '0302998877', email: 'projects@example.com' },
    reportsToday: true,
    crew: [['Kojo Addo', 'Mason', 190], ['Fiifi Mensah', 'Mason', 190], ['Abdul Rahman', 'Steel bender', 180], ['Kweku Owusu', 'Steel bender', 180],
      ['Esi Arthur', 'Labourer', 120], ['Nii Armah', 'Labourer', 120], ['Mawuli Dzah', 'Carpenter', 180]],
    materials: [
      { name: 'Cement (50kg)', unit: 'bags', reorderLevel: 80, avgDaily: 20, start: 300, price: 98 },
      { name: 'Iron rods 16mm', unit: 'lengths', reorderLevel: 60, avgDaily: 10, start: 200, price: 205 },
      { name: 'Sandcrete blocks 6"', unit: 'pcs', reorderLevel: 600, avgDaily: 150, start: 2500, price: 7 },
      { name: 'Quarry dust', unit: 'trips', reorderLevel: 2, avgDaily: 0.3, start: 8, price: 900 },
    ],
    photos: ['legon-scaffold', 'legon-crane', 'legon-frame', 'legon-tower'],
    work: ['Slab reinforcement for the first floor, grid A to C.', 'Fixed beam reinforcement on grid lines C to E.', 'Formwork and props for the first floor slab.',
      'Column starter bars set out for the second floor.', 'Concrete pour for beams on grid A, 18 m³.', 'Scaffold raised to the second floor on the east face.'],
    issues: [
      { title: 'Cement damaged by rain in the store', priority: 'high', category: 'Materials', location: 'Store', status: 'open', daysAgo: 0, description: 'Rain got into the store. 15 bags of cement caked and were thrown away.' },
      { title: 'Stair core slab thickness unclear on drawings', priority: 'critical', category: 'Design', location: 'Stair core', status: 'in_progress', daysAgo: 4, description: 'Drawings show 150 mm and 200 mm. Waiting for the structural engineer before the pour.' },
      { title: 'Scaffold board missing a toe board', priority: 'medium', category: 'Safety', location: 'First floor, east face', status: 'closed', daysAgo: 9, description: 'Toe boards fitted along the whole run.' },
    ],
    weekly: { Equipment: 5200, Transport: 2400 },
  },
  {
    key: 'road', name: 'Kasoa–Winneba road drainage, phase 2', location: 'Kasoa, Central Region', workType: 'roads', stageIndex: 5, budget: 1600000,
    startDaysAgo: 120, lengthDays: 240, foremanName: 'Ama Owusu', foremanPhone: '0551234567',
    client: { name: 'Department of Urban Roads', phone: '0332001122', email: 'urbanroads@example.com' },
    reportsToday: true,
    crew: [['Kwabena Ofori', 'Mason', 180], ['Joseph Lartey', 'Labourer', 110], ['Adwoa Sarpong', 'Labourer', 110], ['Isaac Nyarko', 'Operator', 210],
      ['Peter Quaye', 'Labourer', 110], ['Rashid Alhassan', 'Carpenter', 170]],
    materials: [
      { name: 'Cement (50kg)', unit: 'bags', reorderLevel: 60, avgDaily: 15, start: 300, price: 98 },
      { name: 'Precast kerbs', unit: 'pcs', reorderLevel: 100, avgDaily: 40, start: 900, price: 45 },
      { name: 'Iron rods 12mm', unit: 'lengths', reorderLevel: 20, avgDaily: 4, start: 80, price: 92 },
      { name: 'Laterite', unit: 'trips', reorderLevel: 4, avgDaily: 2, start: 30, price: 650 },
    ],
    photos: ['road-roadside-works', 'road-kerbs', 'road-culvert', 'road-culvert-2', 'road-haul-road'],
    work: ['Laid 60 m of precast kerbs on the left side, chainage 2+300 to 2+360.', 'Box culvert walls at chainage 2+150 cast.',
      'Excavated the drain trench, 45 m.', 'Compacted the laterite base on the service lane.', 'Wing walls for culvert C3 formed and poured.', 'Backfilled behind the new kerbs.'],
    issues: [
      { title: 'Water main exposed during drain excavation', priority: 'high', category: 'Site condition', location: 'Chainage 2+410', status: 'open', daysAgo: 2, description: 'A water main was found 0.8 m down. Work stopped on that stretch until the water company confirms the depth.' },
      { title: 'Traffic signs knocked down overnight', priority: 'medium', category: 'Safety', location: 'Diversion at 2+200', status: 'resolved', daysAgo: 6, description: 'Signs replaced and weighted down.' },
    ],
    weekly: { Equipment: 9800, Transport: 3600 },
  },
];

export interface DemoSite {
  id: string;
  site: Record<string, unknown>;
  finance: { budget: number; budgetByCategory: Record<string, number> };
  workers: { id: string; doc: Record<string, unknown>; dailyRate: number }[];
  attendance: { date: string; doc: Record<string, unknown> }[];
  materials: { id: string; doc: Record<string, unknown> }[];
  materialLogs: { id: string; doc: Record<string, unknown> }[];
  expenses: { id: string; doc: Record<string, unknown> }[];
  reports: { id: string; doc: Record<string, unknown> }[];
  issues: { id: string; doc: Record<string, unknown> }[];
  milestones: { id: string; doc: Record<string, unknown> }[];
  drawings: { id: string; doc: Record<string, unknown> }[];
}

// photoBase: where the sample photos are served, e.g. https://siteflow-dp-dev.web.app/demo
// The sample projects for a company: built with Ghana's figures, then moved to the company's country
// (its cities, and money scaled to its currency so amounts look right there).
export function buildDemo({ companyId, photoBase, now = new Date(), country = DEFAULT_COUNTRY }: { companyId: string; photoBase: string; now?: Date; country?: string }): DemoSite[] {
  const base = buildGhana({ companyId, photoBase, now });
  return country === DEFAULT_COUNTRY ? base : localiseDemo(base, countryOf(country));
}

function buildGhana({ companyId, photoBase, now = new Date() }: { companyId: string; photoBase: string; now?: Date }): DemoSite[] {
  const today = key(now);
  return PLANS.map((p, pi) => {
    const r = rng(now.getFullYear() * 1000 + now.getMonth() * 40 + now.getDate() + pi * 7919);
    const sid = `${SAMPLE_PREFIX}${p.key}`;
    const fid = `${SAMPLE_PREFIX}foreman-${p.key}`;
    const planStart = key(addDays(now, -p.startDaysAgo));
    const planEnd = key(addDays(now, p.lengthDays - p.startDaysAgo));
    const stages = WORK_TYPES.find((w) => w.key === p.workType)!.stages;
    const stage = stages[p.stageIndex];
    const days = workDaysBack(now, 46); // about eight weeks, newest first
    // Older history (opening deliveries, spending brought forward) sits before the 8-week spend chart
    const openingDay = key(addDays(now, -70));
    const photo = (name: string) => ({ photo: `${photoBase}/${name}.jpg`, thumb: `${photoBase}/${name}-thumb.jpg` });

    // Milestones: earlier stages done, the current one part way. Against the planned dates this
    // leaves the residence behind programme and the other two on track.
    const ms = standardMilestones(planStart, planEnd, stages).map((m, i) => {
      const pct = i < p.stageIndex ? 100 : i === p.stageIndex ? 55 : 0;
      return {
        ...m, percentDone: pct, status: pct >= 100 ? 'done' : pct > 0 ? 'in_progress' : 'not_started',
        actualStart: pct > 0 ? m.plannedStart : null, actualEnd: pct >= 100 ? m.plannedEnd : null, note: '',
      };
    });
    const progress = Math.round(overallProgress(ms) ?? 0);

    // Crew, pay and attendance for the last 30 working days
    const workers = p.crew.map(([name, trade, rate], i) => ({
      id: `${sid}-w${i + 1}`, dailyRate: rate,
      doc: { name, trade, phone: '', active: true, createdBy: fid },
    }));
    const attendance = days.filter((d) => d !== today || p.reportsToday).map((date) => {
      const marks: Record<string, string> = {};
      for (const w of workers) { const x = r(); marks[w.id] = x < 0.84 ? 'present' : x < 0.92 ? 'late' : x < 0.97 ? 'absent' : 'leave'; }
      return { date, doc: { date, marks, markedBy: fid } };
    });

    // Materials: an opening delivery, more deliveries when stock runs low, and daily use
    const materials: DemoSite['materials'] = [];
    const materialLogs: DemoSite['materialLogs'] = [];
    const expenses: DemoSite['expenses'] = [];
    let n = 0;
    p.materials.forEach((m, mi) => {
      const mid = `${sid}-m${mi + 1}`;
      let stock = 0;
      const log = (date: string, type: MaterialLogType, qty: number, extra: Record<string, unknown> = {}) => {
        const id = `${sid}-l${String(++n).padStart(4, '0')}`;
        materialLogs.push({ id, doc: { materialId: mid, materialName: m.name, unit: m.unit, type, qty, cost: 0, supplier: '', ref: '', note: '', date, createdBy: fid, createdByName: p.foremanName, ...extra } });
        stock += type === 'usage' ? -qty : qty;
        return id;
      };
      const deliver = (date: string, qty: number) => {
        const cost = Math.round(qty * m.price);
        log(date, 'delivery', qty, { cost, supplier: mi === 0 ? 'Ghacem depot, Tema' : 'Kasoa building materials', ref: `WB-${4100 + n}` });
        expenses.push({ id: `${sid}-e${String(expenses.length + 1).padStart(3, '0')}`, doc: { date, category: 'Materials', amount: cost, payee: mi === 0 ? 'Ghacem depot, Tema' : 'Kasoa building materials', method: 'Bank transfer', ref: `WB-${4100 + n}`, note: `${m.name}, ${qty} ${m.unit}`, createdBy: fid, createdByName: p.foremanName } });
      };
      deliver(openingDay, m.start); // the opening stock, delivered before the weeks shown on the charts
      for (const date of [...days].reverse()) {
        if (date === today && !p.reportsToday) continue;
        const wobble = 0.6 + r() * 0.8;
        // The road job used a lot of cement today: shows the "unusual use" alert
        let qty = Math.max(m.unit === 'trips' ? (r() < m.avgDaily ? 1 : 0) : Math.round(m.avgDaily * wobble), 0);
        if (date === today && p.key === 'legon' && mi === 0) qty = Math.round(m.avgDaily * 1.8);
        if (qty > 0 && qty <= stock) log(date, 'usage', qty, { note: 'Used on site' });
        // Restock when low, except the road job's kerbs (left low so a reorder alert shows)
        const lowOnPurpose = p.key === 'road' && mi === 1; // kerbs: a small last delivery, none in the last 10 days
        if (stock < m.reorderLevel * 1.5 && date !== today && !(lowOnPurpose && date > days[10])) deliver(date, Math.max(1, Math.round(m.avgDaily * (lowOnPurpose ? 5 : 8))));
      }
      materials.push({ id: mid, doc: { name: m.name, unit: m.unit, stock, reorderLevel: m.reorderLevel, avgDaily: m.avgDaily, active: true, lastLogId: materialLogs[materialLogs.length - 1].id } });
    });

    // Weekly wages from attendance, plus equipment and transport
    const byWeek = new Map<string, number>();
    for (const a of attendance) {
      const d = new Date(`${a.date}T00:00`);
      const monday = key(addDays(d, -((d.getDay() + 6) % 7)));
      const pay = Object.entries(a.doc.marks).reduce((s, [wid, st]) => s + (st === 'present' || st === 'late' ? workers.find((w) => w.id === wid)!.dailyRate : 0), 0);
      byWeek.set(monday, (byWeek.get(monday) || 0) + pay);
    }
    for (const [monday, wages] of byWeek) {
      const sat = key(addDays(new Date(`${monday}T00:00`), 5));
      if (sat > today) continue;
      const add = (category: string, amount: number, note: string, payee: string) =>
        expenses.push({ id: `${sid}-e${String(expenses.length + 1).padStart(3, '0')}`, doc: { date: sat, category, amount: Math.round(amount), payee, method: 'Bank transfer', ref: '', note, createdBy: fid, createdByName: p.foremanName } });
      add('Labour', wages, `Wages, week of ${monday}`, 'Site workers');
      add('Equipment', p.weekly.Equipment * (0.8 + r() * 0.4), p.key === 'road' ? 'Excavator and roller hire' : 'Mixer and scaffold hire', 'Plant hire');
      add('Transport', p.weekly.Transport * (0.7 + r() * 0.6), 'Haulage and deliveries', 'Transport');
    }
    // Spending before the sample window, so the budget used matches the progress
    const spentInWindow = expenses.reduce((s, e) => s + (e.doc.amount as number), 0);
    const earlier = Math.max(0, Math.round(p.budget * (progress / 100) * (p.key === 'adenta' ? 1.05 : 0.9) - spentInWindow));
    const firstDay = days[days.length - 1];
    if (earlier > 0) {
      for (const [category, share] of [['Materials', 0.55], ['Labour', 0.25], ['Equipment', 0.12], ['Transport', 0.08]] as const) {
        expenses.push({ id: `${sid}-e${String(expenses.length + 1).padStart(3, '0')}`, doc: { date: openingDay, category, amount: Math.round(earlier * share), payee: '', method: '', ref: '', note: `${category} before ${firstDay} (brought forward)`, createdBy: fid, createdByName: p.foremanName } });
      }
    }

    // Daily reports: most working days, with photos on some; the residence hasn't reported today
    const reports: DemoSite['reports'] = [];
    days.forEach((date, i) => {
      if (date === today && !p.reportsToday) return;
      if (i > 0 && r() < 0.12) return; // a few missed days
      const att = attendance.find((a) => a.date === date);
      const present = att ? Object.values(att.doc.marks).filter((s) => s === 'present' || s === 'late').length : p.crew.length;
      const pics = i % 3 === 0 ? [p.photos[(i / 3) % p.photos.length], p.photos[(i / 3 + 1) % p.photos.length]].map(photo) : [];
      const issueToday = p.issues.find((x) => x.daysAgo === 0 && date === today);
      reports.push({
        id: reportId(date, fid),
        doc: {
          ...reportDoc({
            text: p.work[i % p.work.length], issues: issueToday ? issueToday.description : '', weather: ['Sunny', 'Cloudy', 'Sunny', 'Light rain'][i % 4],
            stage, progress: Math.max(0, progress - Math.floor(i / 4)), workersPresent: present,
          }, { companyId, siteId: sid, siteName: p.name, date, time: `${16 + (i % 2)}:${String(10 + ((i * 7) % 50)).padStart(2, '0')}`, uid: fid, name: p.foremanName,
            photos: pics.map((x) => x.photo), thumbs: pics.map((x) => x.thumb), source: 'app' }),
          materialsUsed: materialsUsed(materialLogs.map((l) => l.doc as never).filter((l: { date: string }) => l.date === date)),
        },
      });
    });
    const last = reports[0];

    // The project drawing (scripts/demo-drawings.mjs): areas linked to programme stages, issues pinned
    const spec = DEMO_DRAWINGS.find((d) => d.key === p.key);
    const drawingId = `${sid}-dwg1`;
    const pinFor = (i: number) => { const q = spec?.pins.find((x) => x.issue === i); return q ? { drawingId, x: q.x, y: q.y } : null; };
    const issues = p.issues.map((x, i) => {
      const date = key(addDays(now, -x.daysAgo));
      const pic = i === 0 ? photo(p.photos[i % p.photos.length]) : null;
      const base = issueDoc({ title: x.title, description: x.description, priority: x.priority, category: x.category, location: x.location },
        { companyId, siteId: sid, siteName: p.name, uid: fid, name: p.foremanName, date, photos: pic ? [pic.photo] : [], thumbs: pic ? [pic.thumb] : [] });
      return {
        id: `${sid}-i${i + 1}`,
        doc: {
          ...base, status: x.status, ...(pinFor(i) ? { pin: pinFor(i) } : {}),
          ...(x.status === 'resolved' || x.status === 'closed' ? { resolution: x.description, resolvedBy: fid, resolvedByName: p.foremanName } : {}),
          ...(x.status === 'in_progress' ? { assignedTo: fid, assignedToName: p.foremanName } : {}),
        },
      };
    });

    const site = {
      ...siteFields({ name: p.name, location: p.location, stage, foremanName: p.foremanName, foremanPhone: p.foremanPhone, planStart, planEnd,
        clientName: p.client.name, clientPhone: p.client.phone, clientEmail: p.client.email }),
      progress, status: 'active', sample: true, overviewDrawingId: spec ? drawingId : null,
      lastReportDate: last?.doc.date ?? null, lastReportTime: last?.doc.time ?? null,
    };
    const totals = { Materials: 0.55, Labour: 0.25, Equipment: 0.12, Transport: 0.08 };
    return {
      id: sid, site,
      finance: { budget: p.budget, budgetByCategory: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(p.budget * v)])) },
      workers, attendance, materials, materialLogs, expenses, reports, issues,
      milestones: ms.map((m, i) => ({ id: `${sid}-ms${i + 1}`, doc: m })),
      drawings: spec ? [{
        id: drawingId,
        doc: {
          title: spec.title, sheet: spec.sheet, discipline: spec.discipline, fileType: 'image/png',
          file: `${photoBase}/plans/${spec.file}.png`, image: `${photoBase}/plans/${spec.file}.png`, width: spec.width * 2, height: spec.height * 2,
          zones: spec.zones.map((z, i) => {
            const at = (stages as readonly string[]).indexOf(z.stage);
            return { id: `z${i + 1}`, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, milestoneId: at >= 0 ? `${sid}-ms${at + 1}` : null };
          }),
          createdBy: fid, createdByName: 'SiteFlow sample',
        },
      }] : [],
    };
  });
}

// How old a sample record is, for its createdAt (so feeds and timelines read in order)
export const sampleTime = (date: string, time = '17:00') => new Date(`${date}T${time}:00`).getTime() || Date.now() - DAY;

// Money looks local: scaled from cedis by rough exchange rates, then rounded the way people quote
// prices (3 significant figures; budgets 2). Names and places follow the country's cities.
const nice = (n: number, sig = 3) => {
  if (!(n > 0)) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - (sig - 1));
  return Math.round(n / step) * step;
};
const place = (city: string) => city.split(',')[0];
// People in the sample projects, by region (same order as the Ghana set: 3 foremen, then each crew)
const PEOPLE: Record<string, string[]> = {
  'west': [
    'Chinedu Okafor',
    'Babatunde Adeyemi',
    'Ngozi Eze',
    'Emeka Nwosu',
    'Tunde Bakare',
    'Ibrahim Musa',
    'Femi Adebayo',
    'Uche Obi',
    'Sani Bello',
    'Kelechi Udeh',
    'Segun Ojo',
    'Aliyu Danjuma',
    'Yusuf Garba',
    'Chioma Okeke',
    'Bayo Alade',
    'Obinna Eze',
    'Musa Abdullahi',
    'Ifeanyi Nnaji',
    'Blessing Okon',
    'Danladi Haruna',
    'Funmi Ogunleye',
    'Gbenga Akin'
  ],
  'east': [
    'James Mwangi',
    'Peter Otieno',
    'Grace Wanjiku',
    'Brian Kiprop',
    'Joseph Kamau',
    'Daniel Ochieng',
    'Samuel Mutua',
    'Faith Achieng',
    'John Njoroge',
    'Kevin Omondi',
    'David Kariuki',
    'Hassan Juma',
    'Moses Wekesa',
    'Mercy Chebet',
    'Paul Mugo',
    'Eric Barasa',
    'Dennis Kibet',
    'Joyce Nyambura',
    'Collins Odhiambo',
    'Isaac Maina',
    'Felix Ruto',
    'Ann Wairimu'
  ],
  'south': [
    'Sipho Ndlovu',
    'Thabo Mokoena',
    'Lerato Dlamini',
    'Bongani Khumalo',
    'Mandla Zulu',
    'Themba Nkosi',
    'Kagiso Molefe',
    'Nomsa Mthembu',
    'Pieter van Wyk',
    'Lwazi Mahlangu',
    'Tshepo Sithole',
    'Johan Botha',
    'Vusi Mabaso',
    'Zanele Ngcobo',
    'Sibusiso Shabalala',
    'Neo Phiri',
    'Teboho Radebe',
    'Ayanda Cele',
    'Musa Banda',
    'Kabelo Seabi',
    'Ruan Pretorius',
    'Palesa Mokoena'
  ],
  'mena': [
    'Ahmed Hassan',
    'Omar Khalil',
    'Youssef Benali',
    'Mohamed Ali',
    'Khaled Mansour',
    'Tariq Aziz',
    'Hamza Saleh',
    'Karim Haddad',
    'Mustafa Nour',
    'Ali Rahman',
    'Samir Fathi',
    'Rashid Omar',
    'Bilal Yusuf',
    'Nabil Kamal',
    'Hassan Farouk',
    'Imran Qureshi',
    'Faisal Hamid',
    'Walid Said',
    'Adel Mahmoud',
    'Zaid Kareem',
    'Sami Darwish',
    'Majid Salem'
  ],
  'southasia': [
    'Rajesh Kumar',
    'Imran Khan',
    'Suresh Patel',
    'Amit Sharma',
    'Vikram Singh',
    'Ravi Verma',
    'Mohammed Asif',
    'Sunil Yadav',
    'Deepak Joshi',
    'Arjun Reddy',
    'Sanjay Gupta',
    'Farhan Ali',
    'Manoj Nair',
    'Rahul Mehta',
    'Ajay Chauhan',
    'Kiran Rao',
    'Naveen Pillai',
    'Pradeep Das',
    'Usman Tariq',
    'Vijay Iyer',
    'Harish Shetty',
    'Anil Desai'
  ],
  'ph': [
    'Jose Santos',
    'Mark Reyes',
    'Maria Cruz',
    'Juan dela Cruz',
    'Ramon Garcia',
    'Paolo Bautista',
    'Carlo Mendoza',
    'Rodel Aquino',
    'Jun Villanueva',
    'Allan Ramos',
    'Dennis Castillo',
    'Rey Navarro',
    'Arnel Torres',
    'Jessa Flores',
    'Noel Pascual',
    'Ricky Domingo',
    'Joel Fernandez',
    'Gilbert Morales',
    'Ronnie Salazar',
    'Edwin Lopez',
    'Ana Rivera',
    'Marvin Gomez'
  ],
  'caribbean': [
    'Andre Campbell',
    'Marlon Brown',
    'Keisha Williams',
    'Devon Thompson',
    'Ricardo Clarke',
    'Shane Henry',
    'Omar Gordon',
    'Dwayne Morgan',
    'Kemar Reid',
    'Damian Lewis',
    'Jermaine Grant',
    'Ravi Maharaj',
    'Kevin Ali',
    'Tricia Joseph',
    'Anthony Baptiste',
    'Jason Charles',
    'Rohan Persad',
    'Dexter Phillip',
    'Nigel Samuel',
    'Curtis Bailey',
    'Shanice Walker',
    'Garfield Hall'
  ],
  'anglo': [
    'Mike Thompson',
    "Dave O'Connor",
    'Sarah Mitchell',
    'Tom Harris',
    'Chris Walker',
    'Liam Murphy',
    'Jake Wilson',
    'Emma Clarke',
    'Ryan Hughes',
    'Ben Taylor',
    'Sean Kelly',
    'Matt Robinson',
    'Josh Turner',
    'Kate Bennett',
    'Dan Cooper',
    'Luke Edwards',
    'Sam Wright',
    'Connor Doyle',
    'Nick Stewart',
    'Adam Price',
    'Laura Brooks',
    'Jack Morris'
  ]
};
const REGION: Record<string, string> = {'NG':'west', 'SL':'west', 'LR':'west', 'GM':'west', 'CI':'west', 'SN':'west', 'CM':'west', 'KE':'east', 'UG':'east', 'TZ':'east', 'RW':'east', 'ET':'east', 'ZA':'south', 'ZM':'south', 'BW':'south', 'NA':'south', 'MW':'south', 'EG':'mena', 'MA':'mena', 'AE':'mena', 'SA':'mena', 'IN':'southasia', 'PK':'southasia', 'PH':'ph', 'JM':'caribbean', 'TT':'caribbean', 'GB':'anglo', 'IE':'anglo', 'US':'anglo', 'CA':'anglo', 'AU':'anglo'};
function nameMap(code: string) {
  const local = PEOPLE[REGION[code]];
  if (!local) return new Map<string, string>();
  const ghana = [...PLANS.map((p) => p.foremanName), ...PLANS.flatMap((p) => p.crew.map(([n]) => n))];
  return new Map(ghana.map((n, i) => [n, local[i] ?? n]));
}

function localiseDemo(sites: DemoSite[], c: Country): DemoSite[] {
  const ghana = countryOf(DEFAULT_COUNTRY);
  const who = nameMap(c.code);
  // Every name field on a record (createdByName, assignedToName, resolvedByName, a worker's name)
  const rename = <T extends { doc: Record<string, unknown> }>(x: T): T => ({
    ...x, doc: Object.fromEntries(Object.entries(x.doc).map(([key, v]) => [key, (key === 'name' || key.endsWith('Name')) && typeof v === 'string' && who.has(v) ? who.get(v) : v])),
  });
  const k = c.perUSD / ghana.perUSD;
  const names = [`${place(c.cities[0])} 4-bedroom residence`, `${place(c.cities[1])} office complex`, `${place(c.cities[2])} road drainage, phase 2`];
  const generic: Record<string, string> = { 'Ghacem depot, Tema': 'Cement depot', 'Kasoa building materials': 'Building materials yard', 'Department of Urban Roads': 'Roads authority' };
  return sites.map((s, i) => {
    const siteName = names[i] ?? (s.site.name as string);
    const withName = <T extends { doc: Record<string, unknown> }>(x: T): T => { const r = rename(x); return { ...r, doc: { ...r.doc, ...('siteName' in r.doc ? { siteName } : {}) } }; };
    const client = s.site.client as { name: string } | null;
    return {
      ...s,
      site: { ...s.site, name: siteName, location: c.cities[i] ?? s.site.location, foremanName: who.get(s.site.foremanName as string) ?? s.site.foremanName, client: client ? { ...client, name: generic[client.name] ?? client.name } : null },
      finance: { budget: nice(s.finance.budget * k, 2), budgetByCategory: Object.fromEntries(Object.entries(s.finance.budgetByCategory).map(([cat, v]) => [cat, nice(v * k, 2)])) },
      workers: s.workers.map((w) => ({ ...rename(w), dailyRate: nice(w.dailyRate * k, 2) })),
      materialLogs: s.materialLogs.map((l0) => rename(l0)).map((l) => ({ ...l, doc: { ...l.doc, cost: nice((l.doc.cost as number) * k), supplier: generic[l.doc.supplier as string] ?? l.doc.supplier } })),
      expenses: s.expenses.map((e0) => rename(e0)).map((e) => ({ ...e, doc: { ...e.doc, amount: nice((e.doc.amount as number) * k), payee: generic[e.doc.payee as string] ?? e.doc.payee } })),
      reports: s.reports.map(withName),
      issues: s.issues.map(withName),
    };
  });
}
