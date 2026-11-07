// Job board + delivery state machine. Pure logic.
import { mulberry32, strHash } from './noise.js';
import { SPECS } from './physics.js';

export const FUEL_PRICE = 105; // rupees per litre
const SCALE_KM = 0.001;        // 1 game metre = 1 real metre
const AVG_SPEED = { car: 13, bus: 10, lorry: 8 };

const CARGO = {
  Guntur: ['Guntur red chillies', 'Turmeric sacks'], Vijayawada: ['Mango crates', 'Electronics'], Visakhapatnam: ['Steel coils', 'Fishing nets'],
  Kakinada: ['Fresh fish crates', 'Prawns (iced)'], Rajahmundry: ['Rice sacks', 'Banana bunches'], Nellore: ['Aqua shrimp', 'Paddy sacks'],
  Tirupati: ['Laddu prasadam boxes', 'Sweets'], Kurnool: ['Onion sacks', 'Groundnut oil'], Anantapur: ['Groundnut sacks', 'Sunflower seeds'],
  Kadapa: ['Cement bags', 'Limestone slabs'], Ongole: ['Granite slabs', 'Tobacco bundles'], Chittoor: ['Mangoes', 'Tomato crates'],
  Eluru: ['Rice sacks', 'Coconuts'], Machilipatnam: ['Fish crates', 'Salt bags'], Araku: ['Araku coffee beans', 'Spice sacks'],
  Tirumala: ['Laddu prasadam boxes'], Srikakulam: ['Cashew sacks', 'Jute bales'], Amaravati: ['Building materials', 'Bricks'],
};
const GENERIC = ['Cotton bales', 'Bricks', 'Cement bags', 'Rice sacks', 'Fertiliser', 'Farm produce'];

function pickDrop(city, rnd) { return city.dropPoints[Math.floor(rnd() * city.dropPoints.length)]; }

export function generateOffers(world, vehType, nearCity, seed = 1, count = 3) {
  const rnd = mulberry32(strHash(vehType + nearCity.name) ^ (seed * 2654435761));
  const [minD, maxD] = vehType === 'car' ? [1500, 9000] : vehType === 'bus' ? [3000, 16000] : [3500, 26000];
  const cities = world.cities.filter(c => c !== nearCity && !(c.name === 'Tirumala' && vehType === 'bus'));
  const offers = [];
  let tries = 0;
  while (offers.length < count && tries++ < 60) {
    const to = cities[Math.floor(rnd() * cities.length)];
    const d = Math.hypot(to.x - nearCity.x, to.z - nearCity.z);
    if (d < minD * 0.7 || d > maxD) continue;
    const from = pickDrop(nearCity, rnd), drop = pickDrop(to, rnd);
    const stops = [{ city: nearCity, ...from, label: 'Pickup' }];
    if (vehType === 'bus') { // passenger route: add a middle stop in a city roughly between
      const mid = cities.filter(c => c !== to && Math.hypot(c.x - nearCity.x, c.z - nearCity.z) + Math.hypot(c.x - to.x, c.z - to.z) < d * 1.3)[0];
      if (mid) stops.push({ city: mid, ...pickDrop(mid, rnd), label: 'Bus stop' });
    }
    stops.push({ city: to, ...drop, label: vehType === 'lorry' ? 'Unload' : vehType === 'bus' ? 'Final stop' : 'Drop-off' });
    let dist = 0; for (let i = 1; i < stops.length; i++) dist += Math.hypot(stops[i].x - stops[i - 1].x, stops[i].z - stops[i - 1].z);
    dist *= 1.12; // roads are not straight lines
    const ghat = stops.some(s => s.city.name === 'Araku' || s.city.name === 'Tirumala');
    const km = dist * SCALE_KM;
    const base = Math.round((km * SPECS[vehType].rate * (ghat ? 1.3 : 1) + 150) / 10) * 10;
    const limit = Math.round(dist / AVG_SPEED[vehType] + 60);
    const cargoList = CARGO[nearCity.name] || GENERIC;
    const title = vehType === 'lorry' ? cargoList[Math.floor(rnd() * cargoList.length)]
      : vehType === 'bus' ? `${nearCity.name} - ${to.name} service` : `Taxi fare to ${to.name}`;
    offers.push({ id: `${vehType}-${nearCity.id}-${seed}-${offers.length}`, vehType, title, stops, dist, km: Math.round(km), pay: base, bonus: Math.round(base * 0.2), limit, ghat });
  }
  if (!offers.length) { const others = world.cities.filter(c => c !== nearCity); for (let i = 0; i < Math.min(count, others.length); i++) { const to = others[Math.floor(rnd() * others.length)], from = pickDrop(nearCity, rnd), drop = pickDrop(to, rnd); const dist = Math.hypot(drop.x - from.x, drop.z - from.z) * 1.15, km = dist * SCALE_KM; offers.push({ id: `${vehType}-${nearCity.id}-${seed}-f${i}`, vehType, title: vehType === 'lorry' ? 'Local delivery' : vehType === 'bus' ? `${nearCity.name} - ${to.name} service` : `Taxi fare to ${to.name}`, stops: [{ city: nearCity, ...from, label: 'Pickup' }, { city: to, ...drop, label: 'Drop-off' }], dist, km: Math.max(1, Math.round(km)), pay: Math.round((km * SPECS[vehType].rate + 150) / 10) * 10, bonus: 40, limit: Math.round(dist / AVG_SPEED[vehType] + 60), ghat: false }); } }
  return offers;
}

/** Runs one accepted job. update() returns events: 'stop' (index reached), 'done'. */
export class JobRunner {
  constructor(job) { this.job = job; this.index = 0; this.timeLeft = job.limit; this.dwell = 0; this.elapsed = 0; this.done = false; this.onTime = true; }
  get target() { return this.job.stops[this.index]; }
  update(dt, veh) {
    if (this.done) return null;
    this.elapsed += dt; this.timeLeft -= dt;
    const t = this.target;
    const inside = Math.hypot(veh.x - t.x, veh.z - t.z) < 16 && veh.speed < 4;
    this.dwell = inside ? this.dwell + dt : 0;
    if (this.dwell > (this.job.vehType === 'bus' ? 2.0 : 1.0)) {
      this.dwell = 0;
      const reached = this.index;
      this.index++;
      if (this.index >= this.job.stops.length) {
        this.done = true; this.onTime = this.timeLeft >= 0;
        return { type: 'done', pay: this.job.pay + (this.onTime ? this.job.bonus : 0), onTime: this.onTime, index: reached };
      }
      return { type: 'stop', index: reached };
    }
    return null;
  }
  get distanceToTarget() { return 0; }
}

export const RANKS = [[0, 'Learner'], [5000, 'Auto Driver'], [25000, 'Highway Pilot'], [80000, 'Ghat Master'], [250000, 'Road King of Andhra']];
export const rankFor = earned => { let r = RANKS[0][1]; for (const [v, n] of RANKS) if (earned >= v) r = n; return r; };
