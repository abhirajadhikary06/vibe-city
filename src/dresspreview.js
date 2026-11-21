/*
 * Procedural Dress & Attire Previews
 * Renders authentic, high-definition 2D boutique apparel illustrations of each Kolkata outfit:
 * - Vibe City Tropical (Cuban collar floral shirt, white chinos, boat loafers)
 * - Classic Kurta & Dhoti (Ivory tussar Panjabi with Kantha embroidery, pleated Dhoti & Nagra sandals)
 * - Kolkata Yellow Taxi Khaki (Safari bush shirt with epaulettes, KOL-TAXI brass badge & work trousers)
 * - Mohun Bagan AC (Maroon & green vertical stripes, boat crest, gold No. 10 & white shorts)
 * - East Bengal FC (Red & gold 50/50 split, Mashal torch crest, No. 7 & black shorts)
 * - College Street Scholar (Black Nehru waistcoat, fountain pen, white khadi Panjabi & dhoti)
 *
 * Zero-load compliance: Pure HTML5 Canvas 2D vector graphics. 0 external image downloads.
 */

export function drawDressPreview(canvas, outfit) {
  if (!canvas || !outfit) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = 260;
  const h = 240;

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;

  // 1. Ambient boutique studio background & soft spotlight
  drawStudioBackground(ctx, w, h, cx, outfit.id);

  // 2. Floor contact shadow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, 218, 54, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.filter = 'blur(4px)';
  ctx.fill();
  ctx.restore();

  // 3. Draw ensemble by outfit ID
  switch (outfit.id) {
    case 'kurta_dhoti':
      drawKurtaDhoti(ctx, cx);
      break;
    case 'taxi_khaki':
      drawTaxiKhaki(ctx, cx);
      break;
    case 'mohun_bagan':
      drawMohunBagan(ctx, cx);
      break;
    case 'east_bengal':
      drawEastBengal(ctx, cx);
      break;
    case 'scholar':
      drawScholar(ctx, cx);
      break;
    case 'default':
    default:
      drawTropical(ctx, cx);
      break;
  }

  ctx.restore();
}

function drawStudioBackground(ctx, w, h, cx, outfitId) {
  const glowColors = {
    default: ['rgba(31, 181, 176, 0.22)', 'rgba(255, 79, 154, 0.08)'],
    kurta_dhoti: ['rgba(212, 175, 55, 0.25)', 'rgba(253, 251, 247, 0.08)'],
    taxi_khaki: ['rgba(244, 197, 28, 0.22)', 'rgba(195, 162, 112, 0.08)'],
    mohun_bagan: ['rgba(0, 106, 59, 0.25)', 'rgba(120, 20, 40, 0.15)'],
    east_bengal: ['rgba(196, 21, 40, 0.25)', 'rgba(255, 204, 0, 0.15)'],
    scholar: ['rgba(212, 175, 55, 0.18)', 'rgba(40, 45, 55, 0.25)'],
  };

  const [c1, c2] = glowColors[outfitId] || glowColors.default;

  // Background radial glow
  const grad = ctx.createRadialGradient(cx, 95, 10, cx, 110, 125);
  grad.addColorStop(0, c1);
  grad.addColorStop(0.65, c2);
  grad.addColorStop(1, 'rgba(12, 16, 24, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle decorative mannequin hanger neck hook at top
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 211, 107, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, 16, 8, Math.PI * 0.9, Math.PI * 2.2);
  ctx.lineTo(cx, 28);
  ctx.stroke();
  ctx.restore();
}

/* =========================================================================
 * 1. VIBE CITY TROPICAL (Default)
 * ========================================================================= */
function drawTropical(ctx, cx) {
  // Shoes: Tan boat loafers
  drawShoes(ctx, cx, '#d9c3a1', '#7a5a3a');

  // Pants: White tailored chinos
  drawTrousers(ctx, cx, 116, 206, '#f4f2ec', '#dcd8cb', true);

  // Belt: Brown leather with gold buckle
  drawBelt(ctx, cx, 116, '#3a2416', '#ffd700');

  // Shirt body outline
  ctx.save();
  ctx.beginPath();
  // Collar neck opening
  ctx.moveTo(cx - 16, 28);
  ctx.lineTo(cx - 44, 34); // left shoulder
  ctx.lineTo(cx - 68, 74); // left short sleeve outer
  ctx.lineTo(cx - 52, 82); // left sleeve cuff
  ctx.lineTo(cx - 40, 68); // left armpit
  ctx.lineTo(cx - 36, 118); // left waist
  ctx.lineTo(cx + 36, 118); // right waist
  ctx.lineTo(cx + 40, 68); // right armpit
  ctx.lineTo(cx + 52, 82); // right sleeve cuff
  ctx.lineTo(cx + 68, 74); // right sleeve outer
  ctx.lineTo(cx + 44, 34); // right shoulder
  ctx.lineTo(cx + 16, 28); // right collar
  ctx.closePath();

  // Cyan tropical base
  ctx.fillStyle = '#1fb5b0';
  ctx.fill();
  ctx.clip();

  // Tropical floral & palm leaves print
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Palm leaves
  for (let i = 0; i < 18; i++) {
    const lx = cx - 55 + rnd() * 110;
    const ly = 32 + rnd() * 85;
    const la = rnd() * Math.PI;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(la);
    ctx.fillStyle = '#0d6f62';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Hibiscus flowers
  const fCols = ['#ff4f9a', '#ffd166', '#ff8a5b', '#ffffff'];
  for (let i = 0; i < 14; i++) {
    const fx = cx - 50 + rnd() * 100;
    const fy = 35 + rnd() * 80;
    const fr = 5 + rnd() * 4;
    ctx.fillStyle = fCols[i % fCols.length];
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2 + i;
      ctx.beginPath();
      ctx.ellipse(fx + Math.cos(pa) * fr * 0.7, fy + Math.sin(pa) * fr * 0.7, fr * 0.55, fr * 0.35, pa, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Central button placket & buttons
  ctx.fillStyle = 'rgba(15, 110, 100, 0.4)';
  ctx.fillRect(cx - 3, 38, 6, 80);
  for (const by of [50, 68, 86, 104]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, by, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cuban notch collar
  drawCubanCollar(ctx, cx, 28, '#1fb5b0', '#159692');

  // Sleeve cuff hems
  ctx.strokeStyle = '#159692';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 68, 74);
  ctx.lineTo(cx - 52, 82);
  ctx.moveTo(cx + 68, 74);
  ctx.lineTo(cx + 52, 82);
  ctx.stroke();
}

/* =========================================================================
 * 2. CLASSIC KURTA & DHOTI (Bengali Babu)
 * ========================================================================= */
function drawKurtaDhoti(ctx, cx) {
  // Nagra sandals
  drawNagraShoes(ctx, cx, '#6a3e1f', '#d4af37');

  // Pleated Bengali Dhoti (Kochano Dhoti)
  drawBengaliDhoti(ctx, cx, 140, 206);

  // Kurta (Panjabi) Body - longer, flows down to mid-thigh (y = 146)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 14, 28);
  ctx.lineTo(cx - 42, 34); // left shoulder
  ctx.lineTo(cx - 66, 72); // left elbow
  ctx.lineTo(cx - 62, 114); // left wrist
  ctx.lineTo(cx - 48, 114); // left inner wrist
  ctx.lineTo(cx - 42, 70); // left inner arm
  ctx.lineTo(cx - 36, 142); // left hip
  // Curved lower hem
  ctx.quadraticCurveTo(cx, 149, cx + 36, 142);
  ctx.lineTo(cx + 42, 70); // right inner arm
  ctx.lineTo(cx + 48, 114); // right inner wrist
  ctx.lineTo(cx + 62, 114); // right wrist
  ctx.lineTo(cx + 66, 72); // right elbow
  ctx.lineTo(cx + 42, 34); // right shoulder
  ctx.lineTo(cx + 14, 28); // right collar
  ctx.closePath();

  // Ivory tussar silk base
  ctx.fillStyle = '#fdfbf7';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Silk weave fine vertical threads
  ctx.strokeStyle = '#eee5d3';
  ctx.lineWidth = 0.6;
  for (let x = cx - 36; x <= cx + 36; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, 34);
    ctx.lineTo(x, 145);
    ctx.stroke();
  }

  // Gold zari border along the curved lower hemline
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 36, 140);
  ctx.quadraticCurveTo(cx, 147, cx + 36, 140);
  ctx.stroke();

  // Zari wrist cuffs
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 62, 113);
  ctx.lineTo(cx - 48, 113);
  ctx.moveTo(cx + 48, 113);
  ctx.lineTo(cx + 62, 113);
  ctx.stroke();

  // Central Panjabi Placket with Gold Zari Border
  ctx.fillStyle = '#f7eedd';
  ctx.fillRect(cx - 4, 30, 8, 75);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cx - 4, 30, 8, 75);

  // 5 Golden ball buttons
  for (const by of [38, 52, 66, 80, 94]) {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx, by, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8c6815';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // Golden Kantha Paisley Motifs (Kalka) on chest
  drawPaisley(ctx, cx - 18, 54, -1);
  drawPaisley(ctx, cx + 18, 54, 1);
  drawPaisley(ctx, cx - 22, 78, -1);
  drawPaisley(ctx, cx + 22, 78, 1);

  // Mandarin collar
  drawMandarinCollar(ctx, cx, 28, '#fdfbf7', '#d4af37');

  ctx.restore();
}

/* =========================================================================
 * 3. KOLKATA YELLOW TAXI KHAKI
 * ========================================================================= */
function drawTaxiKhaki(ctx, cx) {
  // Black driver boots
  drawShoes(ctx, cx, '#1e1e1e', '#111111');

  // Khaki uniform trousers
  drawTrousers(ctx, cx, 116, 206, '#a88752', '#8d6e3f', true);

  // Utility belt
  drawBelt(ctx, cx, 116, '#2a221a', '#8d6e3f');

  // Safari shirt body
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 15, 28);
  ctx.lineTo(cx - 44, 34); // left shoulder
  ctx.lineTo(cx - 68, 76); // left sleeve outer
  ctx.lineTo(cx - 52, 84); // left sleeve cuff
  ctx.lineTo(cx - 40, 70); // left armpit
  ctx.lineTo(cx - 36, 118); // left waist
  ctx.lineTo(cx + 36, 118); // right waist
  ctx.lineTo(cx + 40, 70); // right armpit
  ctx.lineTo(cx + 52, 84); // right sleeve cuff
  ctx.lineTo(cx + 68, 76); // right sleeve outer
  ctx.lineTo(cx + 44, 34); // right shoulder
  ctx.lineTo(cx + 15, 28); // right collar
  ctx.closePath();

  // Khaki base
  ctx.fillStyle = '#c3a270';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Fabric horizontal texture
  ctx.strokeStyle = '#b5935b';
  ctx.lineWidth = 0.8;
  for (let y = 36; y <= 116; y += 6) {
    ctx.beginPath();
    ctx.moveTo(cx - 36, y);
    ctx.lineTo(cx + 36, y);
    ctx.stroke();
  }

  // Shoulder Epaulettes with brass button
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#a88752';
    ctx.beginPath();
    ctx.moveTo(cx + side * 44, 34);
    ctx.lineTo(cx + side * 22, 30);
    ctx.lineTo(cx + side * 22, 34);
    ctx.lineTo(cx + side * 44, 38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx + side * 26, 32, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dual Chest Pockets with pointed flap & button
  drawChestPocket(ctx, cx - 22, 60, true);
  drawChestPocket(ctx, cx + 22, 60, false);

  // Polished Brass "KOL-TAXI" Badge on left chest
  ctx.fillStyle = '#ffd700';
  ctx.strokeStyle = '#634718';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx - 32, 48, 22, 9, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 5px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('KOL-TAXI', cx - 21, 53);

  // Central button placket & horn buttons
  ctx.fillStyle = '#b5935b';
  ctx.fillRect(cx - 3, 34, 6, 84);
  for (const by of [46, 62, 78, 94, 108]) {
    ctx.fillStyle = '#4a3219';
    ctx.beginPath();
    ctx.arc(cx, by, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx, by, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Notched safari collar
  drawSafariCollar(ctx, cx, 28, '#c3a270', '#8d6e3f');

  ctx.restore();
}

/* =========================================================================
 * 4. MOHUN BAGAN AC (Green & Maroon)
 * ========================================================================= */
function drawMohunBagan(ctx, cx) {
  // Football boots with silver studs
  drawCleats(ctx, cx, '#111111', '#006a3b', '#e0e0e0');

  // Football socks (Green & maroon stripes)
  drawSocks(ctx, cx, 166, 204, ['#006a3b', '#781428']);

  // White athletic shorts with green/maroon side stripe
  drawShorts(ctx, cx, 114, 168, '#ffffff', ['#006a3b', '#781428']);

  // Jersey body
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 15, 28);
  ctx.lineTo(cx - 44, 34); // left shoulder
  ctx.lineTo(cx - 68, 74); // left sleeve outer
  ctx.lineTo(cx - 52, 82); // left sleeve cuff
  ctx.lineTo(cx - 40, 68); // left armpit
  ctx.lineTo(cx - 36, 116); // left waist
  ctx.lineTo(cx + 36, 116); // right waist
  ctx.lineTo(cx + 40, 68); // right armpit
  ctx.lineTo(cx + 52, 82); // right sleeve cuff
  ctx.lineTo(cx + 68, 74); // right sleeve outer
  ctx.lineTo(cx + 44, 34); // right shoulder
  ctx.lineTo(cx + 15, 28); // right collar
  ctx.closePath();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#006a3b';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();

  // Vertical green & maroon alternating stripes with gold pinstripes
  const stripeW = 10;
  for (let i = -8; i <= 8; i++) {
    const sx = cx + i * stripeW;
    ctx.fillStyle = Math.abs(i) % 2 === 0 ? '#006a3b' : '#781428';
    ctx.fillRect(sx, 20, stripeW, 105);
    // Gold separator line
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(sx, 20);
    ctx.lineTo(sx, 125);
    ctx.stroke();
  }

  // Left chest: Official Mohun Bagan Sailing Boat Crest
  drawMohunBaganCrest(ctx, cx - 18, 56);

  // Right chest: Bold Gold Number 10
  ctx.save();
  ctx.fillStyle = '#ffd700';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.8;
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText('10', cx + 18, 56);
  ctx.fillText('10', cx + 18, 56);
  ctx.restore();

  // Round ribbed collar in maroon with gold trim
  ctx.restore();
  drawCrewNeck(ctx, cx, 28, '#781428', '#ffd700');
}

/* =========================================================================
 * 5. EAST BENGAL FC (Red & Gold)
 * ========================================================================= */
function drawEastBengal(ctx, cx) {
  // Football boots with silver studs
  drawCleats(ctx, cx, '#c41528', '#ffd700', '#1a1a1a');

  // Red & Gold striped socks
  drawSocks(ctx, cx, 166, 204, ['#c41528', '#ffcc00']);

  // Athletic black shorts with red/gold side stripe
  drawShorts(ctx, cx, 114, 168, '#18181c', ['#c41528', '#ffcc00']);

  // Jersey body
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 15, 28);
  ctx.lineTo(cx - 44, 34);
  ctx.lineTo(cx - 68, 74);
  ctx.lineTo(cx - 52, 82);
  ctx.lineTo(cx - 40, 68);
  ctx.lineTo(cx - 36, 116);
  ctx.lineTo(cx + 36, 116);
  ctx.lineTo(cx + 40, 68);
  ctx.lineTo(cx + 52, 82);
  ctx.lineTo(cx + 68, 74);
  ctx.lineTo(cx + 44, 34);
  ctx.lineTo(cx + 15, 28);
  ctx.closePath();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#c41528';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();

  // 50/50 vertical split: Red on left, Gold on right
  ctx.fillStyle = '#c41528';
  ctx.fillRect(cx - 80, 20, 80, 110);
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(cx, 20, 80, 110);

  // Dynamic flame transition in the center
  ctx.fillStyle = '#ff6d00';
  ctx.beginPath();
  ctx.moveTo(cx - 2, 28);
  ctx.lineTo(cx + 3, 116);
  ctx.lineTo(cx - 1, 116);
  ctx.lineTo(cx - 5, 28);
  ctx.closePath();
  ctx.fill();

  // Left chest: Official East Bengal Flaming Torch Crest (Mashal)
  drawEastBengalCrest(ctx, cx - 18, 56);

  // Right chest: Bold Athletic Number 7
  ctx.save();
  ctx.fillStyle = '#c41528';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText('7', cx + 18, 56);
  ctx.fillText('7', cx + 18, 56);
  ctx.restore();

  // V-neck collar in red/gold
  ctx.restore();
  drawVNeck(ctx, cx, 28, '#ffcc00', '#c41528');
}

/* =========================================================================
 * 6. COLLEGE STREET SCHOLAR
 * ========================================================================= */
function drawScholar(ctx, cx) {
  // Polished Oxford shoes
  drawShoes(ctx, cx, '#5c3a21', '#321c0e');

  // White dhoti / pyjama
  drawBengaliDhoti(ctx, cx, 138, 206, '#f4f1ea', '#dfdacd', false);

  // White Khadi Kurta peeking through at sleeves and hem
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 14, 28);
  ctx.lineTo(cx - 42, 34);
  ctx.lineTo(cx - 66, 72);
  ctx.lineTo(cx - 62, 114);
  ctx.lineTo(cx - 48, 114);
  ctx.lineTo(cx - 42, 70);
  ctx.lineTo(cx - 36, 136);
  ctx.quadraticCurveTo(cx, 142, cx + 36, 136);
  ctx.lineTo(cx + 42, 70);
  ctx.lineTo(cx + 48, 114);
  ctx.lineTo(cx + 62, 114);
  ctx.lineTo(cx + 66, 72);
  ctx.lineTo(cx + 42, 34);
  ctx.lineTo(cx + 14, 28);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // Black Nehru Waistcoat / Modi Jacket over the kurta
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 14, 28);
  ctx.lineTo(cx - 40, 34);
  ctx.lineTo(cx - 38, 68);
  ctx.lineTo(cx - 34, 122);
  ctx.lineTo(cx - 10, 124);
  ctx.lineTo(cx, 120); // cutaway slit at waist
  ctx.lineTo(cx + 10, 124);
  ctx.lineTo(cx + 34, 122);
  ctx.lineTo(cx + 38, 68);
  ctx.lineTo(cx + 40, 34);
  ctx.lineTo(cx + 14, 28);
  ctx.closePath();

  ctx.fillStyle = '#1c1c1f';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Front closure placket & buttons
  ctx.strokeStyle = '#2d2d32';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 32);
  ctx.lineTo(cx, 120);
  ctx.stroke();

  for (const by of [42, 58, 74, 90, 106]) {
    ctx.fillStyle = '#3a3a40';
    ctx.beginPath();
    ctx.arc(cx, by, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Left breast welt pocket with clipped Gold Fountain Pen
  ctx.fillStyle = '#262629';
  ctx.fillRect(cx - 28, 54, 16, 2.5);
  // Gold fountain pen clip & top
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(cx - 22, 50, 2.5, 9);
  ctx.beginPath();
  ctx.arc(cx - 20.8, 59, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Lower welt pockets
  ctx.fillStyle = '#262629';
  ctx.fillRect(cx - 28, 92, 16, 2);
  ctx.fillRect(cx + 12, 92, 16, 2);

  // High Mandarin Collar in black with white inner shirt collar visible
  drawMandarinCollar(ctx, cx, 28, '#1c1c1f', '#3a3a40', '#ffffff');

  ctx.restore();
}

/* =========================================================================
 * HELPER DRAWING FUNCTIONS
 * ========================================================================= */

function drawTrousers(ctx, cx, topY, bottomY, mainColor, seamColor, hasCrease = true) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 36, topY);
  ctx.lineTo(cx - 33, bottomY); // left ankle outer
  ctx.lineTo(cx - 6, bottomY); // left ankle inner
  ctx.lineTo(cx, topY + 40); // crotch
  ctx.lineTo(cx + 6, bottomY); // right ankle inner
  ctx.lineTo(cx + 33, bottomY); // right ankle outer
  ctx.lineTo(cx + 36, topY); // right waist
  ctx.closePath();

  ctx.fillStyle = mainColor;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Seam & center crease
  ctx.strokeStyle = seamColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx, topY + 40);
  ctx.stroke();

  if (hasCrease) {
    ctx.strokeStyle = seamColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 19, topY + 12);
    ctx.lineTo(cx - 19, bottomY);
    ctx.moveTo(cx + 19, topY + 12);
    ctx.lineTo(cx + 19, bottomY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBengaliDhoti(ctx, cx, topY, bottomY, color = '#f5f2e9', shadowColor = '#e3ded0', hasZari = true) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 36, topY);
  ctx.bezierCurveTo(cx - 40, topY + 25, cx - 38, bottomY - 10, cx - 26, bottomY);
  ctx.lineTo(cx - 5, bottomY);
  ctx.lineTo(cx - 2, topY + 35);
  ctx.lineTo(cx + 5, bottomY);
  ctx.lineTo(cx + 26, bottomY);
  ctx.bezierCurveTo(cx + 38, bottomY - 10, cx + 40, topY + 25, cx + 36, topY);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Traditional Kochano Dhoti front center pleats
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.2;
  for (let ox of [-14, -8, -2, 4, 10, 16]) {
    ctx.beginPath();
    ctx.moveTo(cx + ox, topY + 5);
    ctx.quadraticCurveTo(cx + ox + 3, topY + 35, cx + ox - 2, bottomY - 2);
    ctx.stroke();
  }

  // Gold zari border along the dhoti pleats & lower hem
  if (hasZari) {
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Central pleat golden border
    ctx.moveTo(cx - 2, topY + 15);
    ctx.lineTo(cx - 2, bottomY);
    // Lower dhoti hem borders
    ctx.moveTo(cx - 26, bottomY - 2);
    ctx.lineTo(cx - 5, bottomY - 2);
    ctx.moveTo(cx + 5, bottomY - 2);
    ctx.lineTo(cx + 26, bottomY - 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawShorts(ctx, cx, topY, bottomY, mainColor, sideStripes = []) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 36, topY);
  ctx.lineTo(cx - 34, bottomY);
  ctx.lineTo(cx - 8, bottomY);
  ctx.lineTo(cx, topY + 24); // crotch
  ctx.lineTo(cx + 8, bottomY);
  ctx.lineTo(cx + 34, bottomY);
  ctx.lineTo(cx + 36, topY);
  ctx.closePath();

  ctx.fillStyle = mainColor;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Side racing stripes
  if (sideStripes.length > 0) {
    sideStripes.forEach((sc, idx) => {
      ctx.fillStyle = sc;
      const off = idx * 2.5;
      ctx.fillRect(cx - 34 + off, topY, 2, bottomY - topY);
      ctx.fillRect(cx + 32 - off, topY, 2, bottomY - topY);
    });
  }

  // Bare legs below shorts before socks
  ctx.fillStyle = '#c98e6a';
  ctx.fillRect(cx - 26, bottomY, 16, 8);
  ctx.fillRect(cx + 10, bottomY, 16, 8);

  ctx.restore();
}

function drawSocks(ctx, cx, topY, bottomY, colors) {
  ctx.save();
  const h = (bottomY - topY) / colors.length;
  for (let i = 0; i < colors.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(cx - 27, topY + i * h, 18, h);
    ctx.fillRect(cx + 9, topY + i * h, 18, h);
  }
  ctx.restore();
}

function drawShoes(ctx, cx, color, soleColor) {
  ctx.save();
  for (const side of [-1, 1]) {
    const sx = cx + side * 19;
    // Sole
    ctx.fillStyle = soleColor;
    ctx.beginPath();
    ctx.roundRect(sx - 11, 212, 22, 4, 2);
    ctx.fill();

    // Upper
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(sx, 210, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawNagraShoes(ctx, cx, leatherColor, goldTrim) {
  ctx.save();
  for (const side of [-1, 1]) {
    const sx = cx + side * 19;
    ctx.fillStyle = leatherColor;
    ctx.beginPath();
    ctx.moveTo(sx - 9, 214);
    ctx.lineTo(sx + 9, 214);
    // Pointed curved Nagra toe tip
    ctx.quadraticCurveTo(sx + side * 14, 208, sx + side * 13, 204);
    ctx.lineTo(sx - side * 2, 208);
    ctx.closePath();
    ctx.fill();

    // Gold zari toe embroidery
    ctx.strokeStyle = goldTrim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx + side * 8, 209, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCleats(ctx, cx, mainColor, accentColor, studColor) {
  ctx.save();
  for (const side of [-1, 1]) {
    const sx = cx + side * 19;
    // Cleat body
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.roundRect(sx - 11, 208, 22, 6, 2);
    ctx.fill();

    // Accent swoosh
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - 7, 211);
    ctx.lineTo(sx + 7, 209);
    ctx.stroke();

    // Studs
    ctx.fillStyle = studColor;
    ctx.fillRect(sx - 9, 214, 3, 2);
    ctx.fillRect(sx - 1, 214, 3, 2);
    ctx.fillRect(sx + 6, 214, 3, 2);
  }
  ctx.restore();
}

function drawBelt(ctx, cx, y, leatherColor, buckleColor) {
  ctx.save();
  ctx.fillStyle = leatherColor;
  ctx.fillRect(cx - 36, y - 4, 72, 6);
  ctx.strokeStyle = buckleColor;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(cx - 6, y - 5, 12, 8);
  ctx.fillStyle = buckleColor;
  ctx.fillRect(cx - 1, y - 4, 2, 6);
  ctx.restore();
}

function drawCubanCollar(ctx, cx, y, baseColor, shadowColor) {
  ctx.save();
  // Neck skin
  ctx.fillStyle = '#c98e6a';
  ctx.beginPath();
  ctx.moveTo(cx - 14, y);
  ctx.lineTo(cx, y + 15);
  ctx.lineTo(cx + 14, y);
  ctx.closePath();
  ctx.fill();

  // Left & Right lapels
  for (const side of [-1, 1]) {
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = shadowColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + side * 15, y);
    ctx.lineTo(cx + side * 28, y + 10);
    ctx.lineTo(cx + side * 8, y + 16);
    ctx.lineTo(cx, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawMandarinCollar(ctx, cx, y, baseColor, trimColor, innerColor = null) {
  ctx.save();
  // Standing band collar
  if (innerColor) {
    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.roundRect(cx - 14, y - 3, 28, 9, 3);
    ctx.fill();
  }

  ctx.fillStyle = baseColor;
  ctx.strokeStyle = trimColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cx - 13, y, 26, 8, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSafariCollar(ctx, cx, y, baseColor, trimColor) {
  ctx.save();
  // Open V neck skin
  ctx.fillStyle = '#c98e6a';
  ctx.beginPath();
  ctx.moveTo(cx - 12, y);
  ctx.lineTo(cx, y + 14);
  ctx.lineTo(cx + 12, y);
  ctx.closePath();
  ctx.fill();

  for (const side of [-1, 1]) {
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = trimColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + side * 14, y);
    ctx.lineTo(cx + side * 24, y + 8);
    ctx.lineTo(cx + side * 6, y + 15);
    ctx.lineTo(cx, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawCrewNeck(ctx, cx, y, ribColor, trimColor) {
  ctx.save();
  // Neck skin
  ctx.fillStyle = '#c98e6a';
  ctx.beginPath();
  ctx.ellipse(cx, y + 4, 13, 8, 0, 0, Math.PI);
  ctx.fill();

  // Ribbed ring
  ctx.strokeStyle = ribColor;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(cx, y + 3, 14, 7, 0, 0, Math.PI);
  ctx.stroke();

  // Trim line
  ctx.strokeStyle = trimColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, y + 4.5, 14, 7, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawVNeck(ctx, cx, y, col1, col2) {
  ctx.save();
  // Neck skin
  ctx.fillStyle = '#c98e6a';
  ctx.beginPath();
  ctx.moveTo(cx - 12, y);
  ctx.lineTo(cx, y + 14);
  ctx.lineTo(cx + 12, y);
  ctx.closePath();
  ctx.fill();

  // Left V rib
  ctx.strokeStyle = col1;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 14, y);
  ctx.lineTo(cx, y + 14);
  ctx.stroke();

  // Right V rib
  ctx.strokeStyle = col2;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + 14, y);
  ctx.lineTo(cx, y + 14);
  ctx.stroke();
  ctx.restore();
}

function drawChestPocket(ctx, px, py, isLeft) {
  ctx.save();
  // Pocket body
  ctx.fillStyle = '#b5935b';
  ctx.strokeStyle = '#8d6e3f';
  ctx.lineWidth = 1;
  ctx.fillRect(px - 10, py - 4, 20, 22);
  ctx.strokeRect(px - 10, py - 4, 20, 22);

  // Box pleat vertical center line
  ctx.strokeStyle = '#8d6e3f';
  ctx.beginPath();
  ctx.moveTo(px, py - 4);
  ctx.lineTo(px, py + 18);
  ctx.stroke();

  // Triangular pointed flap
  ctx.fillStyle = '#a88752';
  ctx.beginPath();
  ctx.moveTo(px - 11, py - 4);
  ctx.lineTo(px + 11, py - 4);
  ctx.lineTo(px + 11, py + 2);
  ctx.lineTo(px, py + 7);
  ctx.lineTo(px - 11, py + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Flap button
  ctx.fillStyle = '#4a3219';
  ctx.beginPath();
  ctx.arc(px, py + 2.5, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPaisley(ctx, px, py, dir) {
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = '#c99a2c';
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.bezierCurveTo(dir * 8, 6, dir * 8, -5, 0, -8);
  ctx.bezierCurveTo(dir * -4, -4, dir * -4, 5, 0, 7);
  ctx.fill();
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

function drawMohunBaganCrest(ctx, px, py) {
  ctx.save();
  ctx.translate(px, py);
  // Gold circular outer border
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();

  // Green & Maroon split circle
  ctx.fillStyle = '#781428';
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.fillStyle = '#006a3b';
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, Math.PI / 2, -Math.PI / 2);
  ctx.fill();

  // White Sailing Boat (Palki / Nouka)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-1, 5);
  ctx.lineTo(-1, -5);
  ctx.lineTo(6, 1);
  ctx.closePath();
  ctx.fill();

  // Boat hull
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.ellipse(0, 4, 6, 2, 0, 0, Math.PI);
  ctx.fill();

  ctx.restore();
}

function drawEastBengalCrest(ctx, px, py) {
  ctx.save();
  ctx.translate(px, py);
  // Shield body
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(-9, -9);
  ctx.lineTo(9, -9);
  ctx.lineTo(9, 4);
  ctx.quadraticCurveTo(9, 11, 0, 13);
  ctx.quadraticCurveTo(-9, 11, -9, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Gold torch handle
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(-1.5, 1, 3, 8);
  ctx.fillRect(-3, 1, 6, 2);

  // Roaring flames (Mashal)
  ctx.fillStyle = '#c41528';
  ctx.beginPath();
  ctx.moveTo(-4, 1);
  ctx.lineTo(-6, -4);
  ctx.lineTo(-2, -3);
  ctx.lineTo(0, -8);
  ctx.lineTo(2, -3);
  ctx.lineTo(6, -4);
  ctx.lineTo(4, 1);
  ctx.closePath();
  ctx.fill();

  // Inner gold flame
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  ctx.moveTo(-2.5, 0);
  ctx.lineTo(-3.5, -3);
  ctx.lineTo(-1, -2);
  ctx.lineTo(0, -5.5);
  ctx.lineTo(1, -2);
  ctx.lineTo(3.5, -3);
  ctx.lineTo(2.5, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
