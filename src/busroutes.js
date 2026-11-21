import { MAP, Grid, nodeXZ } from './geo.js';
import { busRouteBoard } from './fleet.js';

/*
 * Kolkata's numbered bus routes, from the OpenStreetMap route relations: the
 * number and the two ends painted on the board, and the streets the route
 * really takes, laid onto the street graph so a bus showing that board drives
 * exactly that way. A route runs from its `from` end to its `to` end; the trip
 * back takes the map's return relation where there is one, else the same
 * streets the other way round (going round the one-way streets where it must).
 */

/** Bengali names of the termini, for the boards. */
const BN = {
  'howrah station': 'হাওড়া স্টেশন', howrah: 'হাওড়া', 'howrah maidan': 'হাওড়া ময়দান', 'howrah fire station': 'হাওড়া ফায়ার স্টেশন',
  esplanade: 'ধর্মতলা', babughat: 'বাবুঘাট', 'b.b.d. bagh': 'বি.বা.দী. বাগ', 'b. b. d. bagh': 'বি.বা.দী. বাগ', 'high court': 'হাইকোর্ট',
  'sealdah station': 'শিয়ালদহ স্টেশন', sealdah: 'শিয়ালদহ', shyambazar: 'শ্যামবাজার', shaymbazar: 'শ্যামবাজার', bagbazar: 'বাগবাজার',
  ahiritola: 'আহিরীটোলা', rajabazar: 'রাজাবাজার', paikpara: 'পাইকপাড়া', sinthee: 'সিঁথি', nagerbazar: 'নাগেরবাজার',
  'dum dum cant': 'দমদম ক্যান্টনমেন্ট', 'dum dum airport': 'দমদম এয়ারপোর্ট', airport: 'এয়ারপোর্ট', 'airport gate 1': 'এয়ারপোর্ট ১ নং গেট',
  'airport terminal': 'এয়ারপোর্ট টার্মিনাল', baguiati: 'বাগুইআটি', teghoria: 'তেঘরিয়া', 'lake town': 'লেকটাউন', 'bangur avenue': 'বাঙ্গুর অ্যাভিনিউ',
  'salt lake': 'সল্টলেক', 'salt lake sector v': 'সল্টলেক সেক্টর ৫', 'salt lake stadium': 'সল্টলেক স্টেডিয়াম', 'salt lake karunamoyee': 'করুণাময়ী',
  'new town bus stand': 'নিউটাউন বাসস্ট্যান্ড', kankurgachi: 'কাঁকুড়গাছি', phoolbagan: 'ফুলবাগান', tangra: 'ট্যাংরা', topsia: 'তপসিয়া',
  'park circus': 'পার্ক সার্কাস', 'picnic garden': 'পিকনিক গার্ডেন', kasba: 'কসবা', 'kasba rathtala': 'কসবা রথতলা', anandapur: 'আনন্দপুর',
  mukundapur: 'মুকুন্দপুর', patuli: 'পাটুলি', 'garia station': 'গড়িয়া স্টেশন', garia: 'গড়িয়া', 'garia more': 'গড়িয়া মোড়',
  jadavpur: 'যাদবপুর', dhakuria: 'ঢাকুরিয়া', golpark: 'গোলপার্ক', 'jodhpur park': 'যোধপুর পার্ক', 'ballygunge station': 'বালিগঞ্জ স্টেশন',
  'rabindra sadan': 'রবীন্দ্র সদন', 'science city': 'সায়েন্স সিটি', tollygunge: 'টালিগঞ্জ', 'golf green': 'গল্ফগ্রিন', bansdroni: 'বাঁশদ্রোণী',
  kudghat: 'কুঁদঘাট', 'alipore zoo': 'আলিপুর চিড়িয়াখানা', 'new alipore': 'নিউ আলিপুর', chetla: 'চেতলা', 'chetla park': 'চেতলা পার্ক',
  khidirpur: 'খিদিরপুর', metiabruz: 'মেটিয়াবুরুজ', 'behala chowrasta': 'বেহালা চৌরাস্তা', 'behala 14 no': 'বেহালা ১৪ নং', sarsuna: 'সরশুনা',
  barisha: 'বড়িশা', 'sakher bazar': 'সখেরবাজার', thakurpukur: 'ঠাকুরপুকুর', parnasree: 'পর্ণশ্রী', haridevpur: 'হরিদেবপুর', pailan: 'পৈলান',
  amtala: 'আমতলা', batanagar: 'বাটানগর', baruipur: 'বারুইপুর', shibrampur: 'শিবরামপুর', 'netaji nagar': 'নেতাজিনগর',
  dakshineswar: 'দক্ষিণেশ্বর', ariadaha: 'আড়িয়াদহ', kamarhati: 'কামারহাটি', belgharia: 'বেলঘরিয়া', 'belgharia station': 'বেলঘরিয়া স্টেশন',
  'agarpara station': 'আগরপাড়া স্টেশন', dunlop: 'ডানলপ', 'dunlop more': 'ডানলপ মোড়', nimta: 'নিমতা', 'birati station': 'বিরাটি স্টেশন',
  noapara: 'নোয়াপাড়া', barrackpore: 'ব্যারাকপুর', 'new barrackpore': 'নিউ ব্যারাকপুর', barasat: 'বারাসত', 'milk colony': 'মিল্ক কলোনি',
  hatiara: 'হাতিয়াড়া', santragachi: 'সাঁতরাগাছি', santragatchhi: 'সাঁতরাগাছি', 'salkia chowrasta': 'সালকিয়া চৌরাস্তা', 'akra phatak': 'আকড়া ফটক',
  'belur math': 'বেলুড় মঠ', 'botanical garden': 'বোটানিক্যাল গার্ডেন', mourigram: 'মৌড়িগ্রাম', 'kona more': 'কোনা মোড়', tikiapara: 'টিকিয়াপাড়া',
  'bally khal': 'বালি খাল', dasnagar: 'দাশনগর', kadamtala: 'কদমতলা', bankra: 'বাঁকড়া', nabanna: 'নবান্ন', ramnagar: 'রামনগর',
  'kolkata station': 'কলকাতা স্টেশন', 'sodepur girja': 'সোদপুর গির্জা', mathpukur: 'মাঠপুকুর', badartala: 'বদরতলা', bandhaghat: 'বাঁধাঘাট',
};
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const upper = (s) => s.toUpperCase().replace(/\bSTATION\b/, 'STN').replace(/\bB\. B\. D\./, 'B.B.D.');
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// Government (WBTC / CSTC) services and their lettered series run in the blue-and-white;
// the numbered private routes in the painted yellow-and-blue or red-roofed liveries.
const GOVT = 0x2f5fb3;
const PRIVATE = [0xd99a22, 0xc8382c];
const isGovt = (r) => /WBSTC|WBTC|CSTC|Surface Transport/i.test(r.net || '') || /^(S-|AC|E-|VS|L\d|MW|SD)/.test(r.ref);

export const BUS_ROUTES = (MAP.busRoutes || []).map((r, i) => {
  const bnFrom = BN[norm(r.from)];
  const bnTo = BN[norm(r.to)];
  return {
    i,
    no: r.ref,
    from: r.from,
    to: r.to,
    ends: [upper(r.from), upper(r.to)],
    en: `${upper(r.from)} - ${upper(r.to)}`,
    bn: bnFrom && bnTo ? `${bnFrom} – ${bnTo}` : '',
    livery: isGovt(r) ? GOVT : PRIVATE[hash(r.ref) % PRIVATE.length],
    runs: r.p,
    back: null,
  };
});
// the return trip, where the map has it as its own relation
for (const r of BUS_ROUTES) r.back = BUS_ROUTES.find((o) => o !== r && o.no === r.no && norm(o.from) === norm(r.to) && norm(o.to) === norm(r.from)) || null;

/** Where a bus on this route is heading, upper case for the board and the HUD. */
export const busHeading = (route, back) => route.ends[back ? 0 : 1];

/* ---------- Which routes pass where (for putting buses on the streets round the player) ---------- */
const NEAR = new Grid(200);
for (const r of BUS_ROUTES) {
  for (const run of r.runs) {
    for (let k = 0; k < run.length; k += 4) {
      const [x, z] = nodeXZ(run[k]);
      NEAR.insert(r, x, x, z, z);
    }
  }
}
/** Routes with streets within about r metres of (x, z). */
export function routesNear(x, z, r) {
  const out = [];
  NEAR.query(x - r, x + r, z - r, z + r, (o) => out.push(o));
  return out;
}

/* ---------- A route laid onto the street graph ---------- */
const inMap = (x, z, m) => MAP.tiles.some(([x0, z0, x1, z1]) => x > x0 + m && x < x1 - m && z > z0 + m && z < z1 - m);
const abbrev = (name) => {
  const w = name.replace(/\b(Road)\b/g, 'Rd').replace(/\b(Street)\b/g, 'St').replace(/\b(Avenue)\b/g, 'Ave').split(/\s+/);
  // "Mahatma Gandhi Rd" -> "M.G. RD", the way the boards write it
  const s = w.length >= 3 ? `${w.slice(0, -1).map((x) => x[0]).join('.')}. ${w[w.length - 1]}` : w.join(' ');
  return s.toUpperCase();
};

const PLANS = new Map();
/**
 * The route as street-graph links [{ e, dir }] in running order, with its total length, the
 * main streets it goes by (the VIA on the board) and whether it ends at its terminus inside
 * the map (or runs on past the edge of it). back: the return trip.
 */
export function routePlan(graph, route, back = false) {
  const key = route.i * 2 + (back ? 1 : 0);
  if (PLANS.has(key)) return PLANS.get(key);
  const runs = !back ? route.runs : route.back ? route.back.runs : route.runs.map((run) => run.slice().reverse()).reverse();
  // Step along the route's map nodes, one graph edge at a time. A step the street graph doesn't
  // have (a footpath) or a gap between runs is bridged by the shortest legal drive. Where the
  // next street can't be reached, the bus skips on to a later one of the route that it can;
  // only when nothing within a couple of kilometres can be reached does a new piece start.
  // On a trip back made by reversing the route, its one-way streets can't be driven the other
  // way: there the bus keeps to their corridor instead, making every 500 m or so for anywhere
  // near them by the legal way round (the other carriageway, the parallel one-way street).
  const made = back && !route.back;
  const pieces = [];
  let links = [];
  let node = -1;
  let stuck = null; // where the last link that could be reached ended
  for (const run of runs) {
    for (let k = 1; k < run.length; k++) {
      const l = graph.step(run[k - 1], run[k]);
      if (!l) continue;
      if (!l.e.lanes[l.dir] || (made && l.e.o !== 0)) {
        if (!made) continue;
        // starting on one (or stuck where it started): from its near end, whichever way the streets allow
        if (!links.length && node < 0) node = l.dir > 0 ? l.e.a : l.e.b;
        const ahead = graph.nodes[l.dir > 0 ? l.e.b : l.e.a];
        const a = graph.nodes[node];
        const d = Math.hypot(a.x - ahead.x, a.z - ahead.z);
        if (d < 500) continue;
        const gap = graph.links(node, ahead.id, Math.max(1500, d * 3 + 500), 150);
        if (!gap || !gap.length) {
          if (!links.length) node = l.dir > 0 ? l.e.a : l.e.b;
          continue;
        }
        links.push(...gap);
        const end = gap[gap.length - 1];
        node = end.dir > 0 ? end.e.b : end.e.a;
        stuck = null;
        continue;
      }
      const last = links[links.length - 1];
      if (last && last.e === l.e && last.dir === l.dir) continue;
      const start = l.dir > 0 ? l.e.a : l.e.b;
      if (links.length && start !== node) {
        const a = graph.nodes[node];
        const b = graph.nodes[start];
        const gap = graph.links(node, start, Math.max(1500, Math.hypot(a.x - b.x, a.z - b.z) * 3 + 500));
        if (gap) links.push(...gap);
        else {
          if (!stuck) stuck = a;
          if (Math.hypot(stuck.x - b.x, stuck.z - b.z) < 2000) continue;
          pieces.push(links);
          links = [];
        }
      }
      stuck = null;
      links.push(l);
      node = l.dir > 0 ? l.e.b : l.e.a;
    }
  }
  pieces.push(links);
  // the bus runs the longest stretch of the route the map has
  const len = (ls) => ls.reduce((s, l) => s + l.e.len, 0);
  let best = pieces[0];
  for (const p of pieces) if (len(p) > len(best)) best = p;
  // VIA: the two streets it spends longest on, in the order it takes them
  const byName = new Map();
  for (const l of best) if (l.e.name) byName.set(l.e.name, (byName.get(l.e.name) || 0) + l.e.len);
  const main = [...byName].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n);
  const order = [...byName.keys()].filter((n) => main.includes(n));
  const end = best.length ? best[best.length - 1] : null;
  const ex = end ? (end.dir > 0 ? end.e.pts.slice(-2) : end.e.pts.slice(0, 2)) : null;
  const plan = { links: best, len: len(best), via: order.map(abbrev).join(' · '), terminus: !!ex && inMap(ex[0], ex[1], 150) };
  PLANS.set(key, plan);
  return plan;
}

/** The index of the plan's link closest to (x, z). */
export function nearestLink(plan, x, z) {
  let bi = 0;
  let bd = Infinity;
  plan.links.forEach((l, i) => {
    const d = l.e.poly.project(x, z).d;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return { i: bi, d: bd };
}

/** The street path [[x, z], ...] of the rest of the route, from link i on. */
export function planPath(plan, i) {
  const pts = [];
  const push = (x, z) => {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(q[0] - x, q[1] - z) > 0.5) pts.push([x, z]);
  };
  for (const { e, dir } of plan.links.slice(i)) {
    if (dir > 0) for (let k = 0; k < e.pts.length; k += 2) push(e.pts[k], e.pts[k + 1]);
    else for (let k = e.pts.length - 2; k >= 0; k -= 2) push(e.pts[k], e.pts[k + 1]);
  }
  return pts;
}

/** Put a route's boards on a bus: front, sides and the lettering on the glass. */
export function dressBus(body, graph, route) {
  const via = routePlan(graph, route).via;
  const { board, side, glass } = busRouteBoard(route.livery, { no: route.no, en: route.en, bn: route.bn, via });
  body.traverse((o) => {
    const u = o.isMesh && o.material.userData;
    if (u && u.dest) o.material = board;
    else if (u && u.destSide) o.material = side;
    else if (u && u.destGlass) o.material = glass;
  });
}

/** Up to n routes (distinct numbers) that start or end at a terminus matching re, each set to leave it. */
export function terminusRoutes(graph, re, n) {
  const out = [];
  const seen = new Set();
  for (const route of BUS_ROUTES) {
    if (seen.has(route.no)) continue;
    const back = !re.test(route.from) && re.test(route.to);
    if (!back && !re.test(route.from)) continue;
    if (routePlan(graph, route, back).len < 400) continue;
    seen.add(route.no);
    out.push({ route, back });
    if (out.length >= n) break;
  }
  return out;
}
