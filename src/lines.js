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
};

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
