/*
 * Downloads Kolkata-wide context from OpenStreetMap (Overpass API) for the map
 * and search: the suburban railway and Metro lines, and important named places
 * across the region. Writes map-data/region-rails.json and region-places.json;
 * npm run build:map folds them into src/data/kolkata.json.
 *
 *   node tools/fetch-region.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BBOX = '22.38,88.18,22.78,88.55'; // Garia to Barrackpore, Santragachi to New Town
const URL = 'https://overpass-api.de/api/interpreter';
async function query(q) {
  const res = await fetch(URL, { method: 'POST', headers: { 'User-Agent': 'kolkata-browser-game/1.0 (map data for a personal game)', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
const rails = await query(`[out:json][timeout:180][bbox:${BBOX}];
(way["railway"~"^(rail|subway|light_rail)$"][!"service"];);
out tags geom;`);
fs.writeFileSync(path.join(ROOT, 'map-data', 'region-rails.json'), JSON.stringify(rails));
console.log('rail ways', rails.elements.length);
const places = await query(`[out:json][timeout:180][bbox:${BBOX}];
(
  node["place"~"^(city|town|suburb|neighbourhood|quarter|village)$"]["name"];
  nwr["railway"~"^(station|halt)$"]["name"];
  nwr["station"="subway"]["name"];
  nwr["tourism"~"^(attraction|museum|zoo|theme_park|gallery|viewpoint)$"]["name"];
  nwr["historic"]["name"]["wikidata"];
  nwr["amenity"~"^(hospital|university|college|bus_station|ferry_terminal|marketplace|cinema|theatre|library|stadium)$"]["name"];
  nwr["shop"="mall"]["name"];
  nwr["leisure"~"^(stadium|park|garden|golf_course|water_park|sports_centre)$"]["name"]["wikidata"];
  nwr["amenity"="place_of_worship"]["name"]["wikidata"];
  nwr["aeroway"="aerodrome"]["name"];
  nwr["man_made"="bridge"]["name"];
  nwr["landuse"="retail"]["name"]["wikidata"];
);
out center tags;`);
fs.writeFileSync(path.join(ROOT, 'map-data', 'region-places.json'), JSON.stringify(places));
console.log('places', places.elements.length);
