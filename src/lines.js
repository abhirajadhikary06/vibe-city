/*
 * Everything people say, in Bengali. Each line is [romanised text shown in the
 * speech bubble, Bengali script that is spoken]. tools/gen-voices.mjs records
 * the Bengali with a Bengali voice into public/voices/; voice.js plays them.
 */

const L = {
  greet: [
    ['Nomoshkar!', 'নমস্কার!'],
    ['Ki khobor, dada?', 'কী খবর, দাদা?'],
    ['Kemon achho?', 'কেমন আছো?'],
    ['Bhalo achhi, tumi?', 'ভালো আছি, তুমি?'],
    ['Ki dada, kothay cholle?', 'কী দাদা, কোথায় চললে?'],
    ['Arre, darun jama to!', 'আরে, দারুণ জামা তো!'],
    ['Shubho shondhya!', 'শুভ সন্ধ্যা!'],
  ],
  talk: [
    ['Phuchka kheyechho? Metro-r pasher dokan-ta shera.', 'ফুচকা খেয়েছ? মেট্রোর পাশের দোকানটা সেরা।'],
    ['Howrah Bridge-e kono nut-bolt nei, shudhu rivet.', 'হাওড়া ব্রিজে কোনো নাট বোল্ট নেই, শুধু রিভেট।'],
    ['Mohun Bagan na East Bengal? Bhebe bolo, dada.', 'মোহনবাগান না ইস্টবেঙ্গল? ভেবে বলো, দাদা।'],
    ['Pujo eshe gelo, gota shohor alo-y bhore jabe.', 'পুজো এসে গেল, গোটা শহর আলোয় ভরে যাবে।'],
    ['Metro ekhon Gongar niche diye jay!', 'মেট্রো এখন গঙ্গার নিচে দিয়ে যায়!'],
    ['Borodiner Park Street, tar kono tulona nei.', 'বড়দিনের পার্ক স্ট্রিট, তার কোনো তুলনা নেই।'],
    ['Cha khaben? Station-er dokan kokhono bondho hoy na.', 'চা খাবেন? স্টেশনের দোকান কখনো বন্ধ হয় না।'],
    ['College Street-e prithibir shob boi paben.', 'কলেজ স্ট্রিটে পৃথিবীর সব বই পাবেন।'],
    ['Taxi-wala-r shathe meter niye torko korben na.', 'ট্যাক্সিওয়ালার সাথে মিটার নিয়ে তর্ক করবেন না।'],
    ['Shondhe-belay Victoria-ta swapner moto lage.', 'সন্ধেবেলায় ভিক্টোরিয়াটা স্বপ্নের মতো লাগে।'],
    ['Tram aste chole, kintu taratari kar ache?', 'ট্রাম আস্তে চলে, কিন্তু তাড়াতাড়ি কার আছে?'],
    ['Howrah Ghat theke launch dhorun, bridge-er jam eriye jaben.', 'হাওড়া ঘাট থেকে লঞ্চ ধরুন, ব্রিজের জ্যাম এড়িয়ে যাবেন।'],
    ['Aaj ki gorom, baba!', 'আজ কী গরম, বাবা!'],
    ['Mishti doi kheye jaben kintu.', 'মিষ্টি দই খেয়ে যাবেন কিন্তু।'],
  ],
  tip: [
    ['Nao, kichhu kheye nio.', 'নাও, কিছু খেয়ে নিও।'],
    ['Eta rakho, mon bhalo kore dile.', 'এটা রাখো, মন ভালো করে দিলে।'],
    ['Cha-singara-r jonno, nao.', 'চা সিঙাড়ার জন্য, নাও।'],
  ],
  playerTalk: [
    ['Ki khobor?', 'কী খবর?'],
    ['Nomoshkar, dada!', 'নমস্কার, দাদা!'],
    ['Bhalo mishti doi kothay pabo?', 'ভালো মিষ্টি দই কোথায় পাবো?'],
    ['Ei shohor-ta darun.', 'এই শহরটা দারুণ।'],
    ['Esplanade kon dike?', 'এসপ্ল্যানেড কোন দিকে?'],
  ],
  flee: [
    ['Bachao!', 'বাঁচাও!'],
    ['Police! Police!', 'পুলিশ! পুলিশ!'],
    ['Pagol naki?!', 'পাগল নাকি?!'],
    ['Palao, palao!', 'পালাও, পালাও!'],
    ['Baba go!', 'বাবা গো!'],
  ],
  hijack: [
    ['Arre! Amar gaari!', 'আরে! আমার গাড়ি!'],
    ['Chor! Chor!', 'চোর! চোর!'],
    ['Gaari-ta ferot dao!', 'গাড়িটা ফেরত দাও!'],
  ],
  honk: [
    ['Dekhe chalao!', 'দেখে চালাও!'],
    ['Arre dada, aste!', 'আরে দাদা, আস্তে!'],
    ['Ki korchho?!', 'কী করছ?!'],
    ['Chokh nei naki?', 'চোখ নেই নাকি?'],
  ],
  punch: [
    ['Uff!', 'উফ!'],
    ['Ki holo?!', 'কী হল?!'],
    ['Aah!', 'আহ!'],
  ],
  fight: [
    ['Esho, dekhi!', 'এসো, দেখি!'],
    ['Bhul korle, dada!', 'ভুল করলে, দাদা!'],
    ['Ebar dekho!', 'এবার দেখো!'],
    ['Bhul parar lok-ke dhorechho!', 'ভুল পাড়ার লোককে ধরেছ!'],
  ],
  draw: [
    ['Sore jao!', 'সরে যাও!'],
    ['Kachhe esho na!', 'কাছে এসো না!'],
    ['Pore pristabe!', 'পরে পস্তাবে!'],
  ],
  calm: [
    ['Haan, jao jao!', 'হ্যাঁ, যাও যাও!'],
    ['Thik achhe, thik achhe.', 'ঠিক আছে, ঠিক আছে।'],
  ],
  dance: [
    ['Dhak baaje!', 'ঢাক বাজে!'],
    ['Cholo, nachi!', 'চলো, নাচি!'],
    ['Pujo-r mood!', 'পুজোর মুড!'],
  ],
  wave: [
    ['Nomoshkar!', 'নমস্কার!'],
    ['Dada!', 'দাদা!'],
    ['Ki khobor!', 'কী খবর!'],
  ],
  cheer: [
    ['Joy!', 'জয়!'],
    ['Darun!', 'দারুণ!'],
    ['Khub bhalo!', 'খুব ভালো!'],
  ],
  flex: [
    ['Baba, ki gaye jor!', 'বাবা, কী গায়ে জোর!'],
    ['Darun!', 'দারুণ!'],
    ['Gym-e jao naki?', 'জিমে যাও নাকি?'],
  ],
  startle: [
    ['Dekhe!', 'দেখে!'],
    ['Arre!', 'আরে!'],
    ['Aste!', 'আস্তে!'],
  ],
  // Howrah Station
  noMoney: [['Taka nei? Tahole hobe na.', 'টাকা নেই? তাহলে হবে না।']],
  ticketSold: [['Ei nin, platform-e jaan.', 'এই নিন, প্ল্যাটফর্মে যান।']],
  comeAgain: [['Abar aschhen!', 'আবার আসবেন!']],
  ticketOk: [['Ticket thik achhe. Jaan.', 'টিকিট ঠিক আছে। যান।']],
  ticketPlease: [['Ticket dekhan! Ticket dekhan!', 'টিকিট দেখান! টিকিট দেখান!']],
  fined: [['Fine diye din. Porer bar ticket kinben!', 'ফাইন দিয়ে দিন। পরের বার টিকিট কিনবেন!']],
  noFine: [['Taka nei?! Jaan, jaan…', 'টাকা নেই?! যান, যান…']],
  cha: [['Gorom cha! Aah.', 'গরম চা! আহ।']],
  mishti: [['Roshogolla! Khub mishti.', 'রসগোল্লা! খুব মিষ্টি।']],
  phuchka: [['Tetul jol… ekdom thik!', 'তেঁতুল জল… একদম ঠিক!']],
  jhalmuri: [['Jhal! Ektu beshi jhal!', 'ঝাল! একটু বেশি ঝাল!']],
  fruit: [['Tatka phol, dada.', 'টাটকা ফল, দাদা।']],
  // Hired rides: taxi, auto, rickshaw
  whereTo: [
    ['Kothay jaben, dada?', 'কোথায় যাবেন, দাদা?'],
    ['Bolun, kothay jabo?', 'বলুন, কোথায় যাবো?'],
  ],
  going: [
    ['Cholun, niye jachchhi.', 'চলুন, নিয়ে যাচ্ছি।'],
    ['Thik achhe, boshun.', 'ঠিক আছে, বসুন।'],
  ],
  tooFar: [['Oto dur jabo na, dada.', 'অত দূর যাবো না, দাদা।']],
  arrived: [
    ['Eshe gechhi, dada. Bhara-ta din.', 'এসে গেছি, দাদা। ভাড়াটা দিন।'],
    ['Pouchhe gelam. Bhara diye din.', 'পৌঁছে গেলাম। ভাড়া দিয়ে দিন।'],
  ],
  thanks: [['Dhonnobad! Abar dakben.', 'ধন্যবাদ! আবার ডাকবেন।']],
  shortChange: [['Eto kom? Thik achhe, jaan.', 'এত কম? ঠিক আছে, যান।']],
  stopHere: [['Achchha, ekhanei namiye dichchhi.', 'আচ্ছা, এখানেই নামিয়ে দিচ্ছি।']],
  jam: [['Ki jam, baba! Ektu dhoirjo dhorun.', 'কী জ্যাম, বাবা! একটু ধৈর্য ধরুন।']],
  // Buses and trams
  conductor: [
    ['Bhara din, bhara din!', 'ভাড়া দিন, ভাড়া দিন!'],
    ['Pechhone egiye jaan!', 'পেছনে এগিয়ে যান!'],
  ],
  busStop: [['Stop esechhe, namun!', 'স্টপ এসেছে, নামুন!']],
  // Taxi jobs: fares the player picks up
  hail: [
    ['Taxi! Ei taxi!', 'ট্যাক্সি! এই ট্যাক্সি!'],
    ['Dada, jaben?', 'দাদা, যাবেন?'],
  ],
  fareIn: [
    ['Taratari cholun, deri hoye gechhe!', 'তাড়াতাড়ি চলুন, দেরি হয়ে গেছে!'],
    ['Aste chalaben, dada. Kono tara nei.', 'আস্তে চালাবেন, দাদা। কোনো তাড়া নেই।'],
    ['Meter-ta chaliye din.', 'মিটারটা চালিয়ে দিন।'],
  ],
  hurry: [
    ['Ektu taratari, dada!', 'একটু তাড়াতাড়ি, দাদা!'],
    ['Aar koto dur?', 'আর কত দূর?'],
  ],
  bump: [
    ['Arre, dekhe chalan!', 'আরে, দেখে চালান!'],
    ['Baba re! Aste!', 'বাবা রে! আস্তে!'],
  ],
  happy: [['Darun chalalen! Ei nin, rakhun.', 'দারুণ চালালেন! এই নিন, রাখুন।']],
  late: [['Eto deri? Thik achhe…', 'এত দেরি? ঠিক আছে…']],
  quit: [['Thak, ami nemey jachchhi!', 'থাক, আমি নেমে যাচ্ছি!']],
};

/*
 * Conversations: what the player asks, and answers that actually fit.
 * `dir` answers are worked out from where you're standing (see directions()).
 */
const CONVO = [
  { q: ['Ki khobor, dada?', 'কী খবর, দাদা?'], a: [['Bhalo, tomar ki khobor?', 'ভালো, তোমার কী খবর?'], ['Ei cholchhe, dada. Tumi bolo?', 'এই চলছে, দাদা। তুমি বলো?']] },
  { q: ['Kemon achhen?', 'কেমন আছেন?'], a: [['Bhalo achhi, apni kemon achhen?', 'ভালো আছি, আপনি কেমন আছেন?'], ['Ei to, cholchhe. Dhonnobad!', 'এই তো, চলছে। ধন্যবাদ!']] },
  { q: ['Bhalo mishti doi kothay pabo?', 'ভালো মিষ্টি দই কোথায় পাবো?'], a: [['Ganguram-e jan, darun mishti doi.', 'গাঙ্গুরামে যান, দারুণ মিষ্টি দই।'], ['Parar mishtir dokan-e paben, ekdom tatka.', 'পাড়ার মিষ্টির দোকানে পাবেন, একদম টাটকা।']] },
  { q: ['Ekhane bhalo phuchka kothay?', 'এখানে ভালো ফুচকা কোথায়?'], a: [['Metro-r pashe phuchka-wala achhe, darun!', 'মেট্রোর পাশে ফুচকাওয়ালা আছে, দারুণ!'], ['Moidan-er dhare, shondhe-belay jan.', 'ময়দানের ধারে, সন্ধেবেলায় যান।']] },
  { q: ['Aaj Eden-e khela achhe?', 'আজ ইডেনে খেলা আছে?'], a: [['Haan, shondhe-belay match. Tikit pele jan!', 'হ্যাঁ, সন্ধেবেলায় ম্যাচ। টিকিট পেলে যান!'], ['Aaj nei, porer shoptahe.', 'আজ নেই, পরের সপ্তাহে।']] },
  { q: ['Ki gorom aaj, na?', 'কী গরম আজ, না?'], a: [['Ar bolben na! Ekta cha khaben?', 'আর বলবেন না! একটা চা খাবেন?'], ['Haan, ghame bhije gechhi.', 'হ্যাঁ, ঘামে ভিজে গেছি।']] },
  { q: ['Pujo-y ki plan?', 'পুজোয় কী প্ল্যান?'], a: [['Pandal hopping, shara raat!', 'প্যান্ডেল হপিং, সারা রাত!'], ['Barir pujo, shobai ashbe.', 'বাড়ির পুজো, সবাই আসবে।']] },
  { q: ['Mohun Bagan na East Bengal?', 'মোহনবাগান না ইস্টবেঙ্গল?'], a: [['Mohun Bagan, chirokal!', 'মোহনবাগান, চিরকাল!'], ['East Bengal chhara kichhu nei!', 'ইস্টবেঙ্গল ছাড়া কিছু নেই!']] },
  { q: ['Taxi kothay pabo?', 'ট্যাক্সি কোথায় পাবো?'], a: [['Rastay haat dekhan, peye jaben.', 'রাস্তায় হাত দেখান, পেয়ে যাবেন।'], ['Howrah-r samne line kore dNariye thake.', 'হাওড়ার সামনে লাইন করে দাঁড়িয়ে থাকে।']] },
  { q: ['Ekhane kotodin achhen?', 'এখানে কতদিন আছেন?'], a: [['Jonmo theke, ei parar chhele.', 'জন্ম থেকে, এই পাড়ার ছেলে।'], ['Bish bochhor holo.', 'বিশ বছর হলো।']] },
  { q: ['Esplanade kon dike?', 'এসপ্ল্যানেড কোন দিকে?'], dir: 'Esplanade' },
  { q: ['Howrah Station kon dike?', 'হাওড়া স্টেশন কোন দিকে?'], dir: 'Howrah' },
  { q: ['Park Street kon dike?', 'পার্ক স্ট্রিট কোন দিকে?'], dir: 'Park Street' },
];
const DIRS = { north: ['uttor', 'উত্তর'], south: ['dokkhin', 'দক্ষিণ'], east: ['purbo', 'পূর্ব'], west: ['poshchim', 'পশ্চিম'] };
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const DIR_LINES = {};
for (const [k, [r, b]] of Object.entries(DIRS)) {
  DIR_LINES[k] = {
    near: [`Kachhei, ${r} dike hNete chole jan.`, `কাছেই, ${b} দিকে হেঁটে চলে যান।`],
    mid: [`${cap(r)} dike, ektu dur. Auto niye nin.`, `${b} দিকে, একটু দূর। অটো নিয়ে নিন।`],
    far: [`Onek dur, ${r} dike. Taxi dhorun.`, `অনেক দূর, ${b} দিকে। ট্যাক্সি ধরুন।`],
  };
}
L.convoQ = CONVO.map((c) => c.q);
for (const c of CONVO) if (c.a) L['a:' + c.q[0]] = c.a;
for (const d of Object.values(DIR_LINES)) L['dir:' + d.near[0]] = [d.near, d.mid, d.far];
L.tipAnswer = [
  ['Bhalo! Eta rakho, kichhu kheye nio.', 'ভালো! এটা রাখো, কিছু খেয়ে নিও।'],
  ['Tumi to bhalo chhele! Nao, cha kheyo.', 'তুমি তো ভালো ছেলে! নাও, চা খেয়ো।'],
];

/** A conversation: { q: what the player says, answer(x, z, place) -> what they hear back, tip }. */
export function conversation(tip = false) {
  const c = CONVO[Math.floor(Math.random() * CONVO.length)];
  return {
    q: c.q[0],
    dir: c.dir || null,
    answer(dx, dz) {
      if (tip) return pick(L.tipAnswer)[0];
      if (!c.dir) return pick(c.a)[0];
      // dx, dz: from the speaker to the place (x east, z south)
      const k = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north';
      const d = Math.hypot(dx, dz);
      return DIR_LINES[k][d < 600 ? 'near' : d < 2000 ? 'mid' : 'far'][0];
    },
  };
}

export const LINES = {};
const BN = new Map();
for (const [k, list] of Object.entries(L)) {
  LINES[k] = list.map(([t]) => t);
  for (const [t, bn] of list) BN.set(t, bn);
}
/** Bengali script for a line, or null. */
export const bengali = (text) => BN.get(text) || null;
/** All [text, bengali] pairs (for the recorder). */
export const ALL_LINES = [...BN.entries()];
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
