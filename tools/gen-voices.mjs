/*
 * Records every Bengali line in src/lines.js with the macOS Bengali voice
 * (Piya, bn-IN) into public/voices/<id>.m4a, and writes public/voices/index.json
 * mapping the romanised text to its clip.
 *
 *   node tools/gen-voices.mjs        (or: npm run build:voices; macOS only)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ALL_LINES } from '../src/lines.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'voices');
const VOICE = process.env.VOICE || 'Piya';
fs.mkdirSync(OUT, { recursive: true });
const hash = (s) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return (h >>> 0).toString(36);
};
const index = {};
let made = 0;
for (const [text, bn] of ALL_LINES) {
  const id = hash(bn);
  const file = path.join(OUT, `${id}.m4a`);
  index[text] = `${id}.m4a`;
  if (fs.existsSync(file)) continue;
  const aiff = path.join(OUT, `${id}.aiff`);
  execFileSync('say', ['-v', VOICE, '-r', '175', '-o', aiff, bn]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', aiff, file]);
  fs.unlinkSync(aiff);
  made++;
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(`${ALL_LINES.length} lines, ${made} recorded with ${VOICE}`);
