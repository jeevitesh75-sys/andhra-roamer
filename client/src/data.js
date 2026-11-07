// ============================================================================
//  ANDHRA PRADESH MAP DATA  -  edit this file to change the world.
//  Coordinates are real latitude / longitude. The game compresses real distance
//  by SCALE (see geo.js): 1 game metre = 25 real metres. It is a stylised map,
//  not a survey: a few places (e.g. Tirumala) are nudged so ghat roads have room.
//  tier: 3 = big city, 2 = city, 1 = town, 0 = small town.
// ============================================================================
export const CITIES = [
  { name: 'Visakhapatnam', te: 'విశాఖపట్నం', lat: 17.6868, lon: 83.2185, tier: 3, R: 700 },
  { name: 'Vijayawada', te: 'విజయవాడ', lat: 16.5062, lon: 80.6480, tier: 3, R: 600 },
  { name: 'Guntur', te: 'గుంటూరు', lat: 16.3067, lon: 80.4365, tier: 2, R: 480 },
  { name: 'Tirupati', te: 'తిరుపతి', lat: 13.6288, lon: 79.4192, tier: 2, R: 420 },
  { name: 'Kurnool', te: 'కర్నూలు', lat: 15.8281, lon: 78.0373, tier: 2, R: 400 },
  { name: 'Nellore', te: 'నెల్లూరు', lat: 14.4426, lon: 79.9865, tier: 2, R: 400 },
  { name: 'Kakinada', te: 'కాకినాడ', lat: 16.9891, lon: 82.2475, tier: 2, R: 400 },
  { name: 'Rajahmundry', te: 'రాజమహేంద్రవరం', lat: 17.0005, lon: 81.8040, tier: 2, R: 400 },
  { name: 'Anantapur', te: 'అనంతపురం', lat: 14.6819, lon: 77.6006, tier: 2, R: 380 },
  { name: 'Kadapa', te: 'కడప', lat: 14.4673, lon: 78.8242, tier: 2, R: 360 },
  { name: 'Ongole', te: 'ఒంగోలు', lat: 15.5057, lon: 80.0499, tier: 1, R: 300 },
  { name: 'Amaravati', te: 'అమరావతి', lat: 16.5730, lon: 80.3575, tier: 1, R: 260 },
  { name: 'Srikakulam', te: 'శ్రీకాకుళం', lat: 18.2949, lon: 83.8938, tier: 1, R: 280 },
  { name: 'Vizianagaram', te: 'విజయనగరం', lat: 18.1067, lon: 83.3956, tier: 1, R: 280 },
  { name: 'Eluru', te: 'ఏలూరు', lat: 16.7107, lon: 81.0952, tier: 1, R: 290 },
  { name: 'Machilipatnam', te: 'మచిలీపట్నం', lat: 16.1875, lon: 81.1389, tier: 1, R: 270 },
  { name: 'Chittoor', te: 'చిత్తూరు', lat: 13.2172, lon: 79.1003, tier: 1, R: 260 },
  { name: 'Nandyal', te: 'నంద్యాల', lat: 15.4786, lon: 78.4836, tier: 1, R: 250 },
  { name: 'Puttaparthi', te: 'పుట్టపర్తి', lat: 14.1652, lon: 77.8115, tier: 0, R: 190 },
  { name: 'Araku', te: 'అరకు', lat: 18.3273, lon: 82.8775, tier: 0, R: 160 },
  { name: 'Tirumala', te: 'తిరుమల', lat: 13.7800, lon: 79.2800, tier: 0, R: 140 },
  { name: 'Bhimavaram', te: 'భీమవరం', lat: 16.5449, lon: 81.5212, tier: 0, R: 200 },
  { name: 'Hindupur', te: 'హిందూపురం', lat: 13.8283, lon: 77.4914, tier: 0, R: 190 },
  { name: 'Madanapalle', te: 'మదనపల్లె', lat: 13.5503, lon: 78.5029, tier: 0, R: 190 },
  { name: 'Proddatur', te: 'ప్రొద్దుటూరు', lat: 14.7502, lon: 78.5481, tier: 0, R: 200 },
  { name: 'Tuni', te: 'తుని', lat: 17.3573, lon: 82.5469, tier: 0, R: 160 },
  { name: 'Anakapalle', te: 'అనకాపల్లి', lat: 17.6913, lon: 83.0037, tier: 0, R: 160 },
  { name: 'Palasa', te: 'పలాస', lat: 18.7728, lon: 84.4103, tier: 0, R: 160 },
  { name: 'Ichchapuram', te: 'ఇచ్ఛాపురం', lat: 19.1117, lon: 84.6911, tier: 0, R: 150 },
  { name: 'Chirala', te: 'చీరాల', lat: 15.8238, lon: 80.3520, tier: 0, R: 180 },
  { name: 'Kavali', te: 'కావలి', lat: 14.9150, lon: 79.9930, tier: 0, R: 170 },
  { name: 'Gudur', te: 'గూడూరు', lat: 14.1500, lon: 79.8500, tier: 0, R: 170 },
  { name: 'Tadipatri', te: 'తాడిపత్రి', lat: 14.9091, lon: 78.0094, tier: 0, R: 170 },
  { name: 'Giddalur', te: 'గిద్దలూరు', lat: 15.3770, lon: 78.9250, tier: 0, R: 160 },
  { name: 'Gudivada', te: 'గుడివాడ', lat: 16.4350, lon: 80.9930, tier: 0, R: 200 },
  { name: 'Tadepalligudem', te: 'తాడేపల్లిగూడెం', lat: 16.8139, lon: 81.5264, tier: 0, R: 180 },
  { name: 'Rajampet', te: 'రాజంపేట', lat: 14.1900, lon: 79.1600, tier: 0, R: 170 },
  { name: 'Chilakaluripet', te: 'చిలకలూరిపేట', lat: 16.0892, lon: 80.1672, tier: 0, R: 170 },
];

// Roads are lists of city names and/or [lat, lon] waypoints. kind: 'nh' | 'sh' | 'ghat'
export const ROADS = [
  { ref: 'NH 16', kind: 'nh', via: ['Ichchapuram', 'Palasa', 'Srikakulam', 'Vizianagaram', 'Visakhapatnam', 'Anakapalle', 'Tuni',
      [17.18, 82.18], 'Rajahmundry', 'Tadepalligudem', 'Eluru', 'Vijayawada', 'Guntur', 'Chilakaluripet', 'Ongole', 'Kavali',
      'Nellore', 'Gudur', [13.52, 80.08]] },
  { ref: 'NH 44', kind: 'nh', via: ['Kurnool', [15.40, 77.87], [15.11, 77.64], 'Anantapur', [14.08, 77.60], 'Hindupur', [13.50, 77.42]] },
  { ref: 'NH 40', kind: 'nh', via: ['Kurnool', 'Nandyal', 'Giddalur', 'Ongole'] },
  { ref: 'NH 67', kind: 'nh', via: ['Anantapur', 'Tadipatri', 'Proddatur', 'Kadapa'] },
  { ref: 'NH 716', kind: 'nh', via: ['Kadapa', 'Rajampet', 'Tirupati'] },
  { ref: 'NH 71', kind: 'nh', via: ['Tirupati', [13.95, 79.65], 'Gudur'] },
  { ref: 'NH 40', kind: 'nh', via: ['Tirupati', 'Chittoor'] },
  { ref: 'SH 31', kind: 'sh', via: ['Chittoor', 'Madanapalle', 'Hindupur'] },
  { ref: 'SH 7', kind: 'sh', via: ['Anantapur', 'Puttaparthi', 'Hindupur'] },
  { ref: 'NH 65', kind: 'nh', via: ['Vijayawada', 'Gudivada', 'Machilipatnam'] },
  { ref: 'SH 2', kind: 'sh', via: ['Vijayawada', 'Amaravati', 'Guntur'] },
  { ref: 'SH 4', kind: 'sh', via: ['Rajahmundry', [17.03, 82.05], 'Kakinada'] },
  { ref: 'SH 18', kind: 'sh', via: ['Tadepalligudem', 'Bhimavaram'] },
  { ref: 'SH 11', kind: 'sh', via: ['Chilakaluripet', 'Chirala', 'Ongole'] },
  { ref: 'SH 26', kind: 'sh', via: ['Kadapa', [14.50, 79.40], 'Nellore'] },
  { ref: 'Tirumala Ghat', kind: 'ghat', via: ['Tirupati', 'Tirumala'] },
  { ref: 'Araku Ghat', kind: 'ghat', via: ['Visakhapatnam', [17.80, 83.10], [18.06, 82.98], 'Araku'] },
];

// Water: stylised paths (they run beside, not through, cities)
export const RIVERS = [
  { name: 'Godavari', w: 70, via: [[17.40, 82.00], [17.15, 81.98], [17.00, 81.96], [16.85, 82.00], [16.72, 82.08], [16.62, 82.25]] },
  { name: 'Krishna', w: 55, via: [[16.74, 80.15], [16.70, 80.45], [16.66, 80.72], [16.50, 80.95], [16.25, 81.05], [16.05, 81.22]] },
];

// Coastline, north -> south (latitude must strictly decrease). Sea lies east of it.
export const COAST = [
  [19.60, 85.30], [19.11, 84.80], [18.88, 84.58], [18.50, 84.20], [18.33, 84.12], [17.95, 83.60], [17.70, 83.30],
  [17.52, 82.95], [17.30, 82.62], [17.05, 82.35], [16.85, 82.30], [16.65, 82.25], [16.40, 81.95], [16.30, 81.73],
  [16.15, 81.28], [15.98, 80.92], [15.88, 80.68], [15.82, 80.50], [15.78, 80.36], [15.45, 80.17], [15.03, 80.08],
  [14.60, 80.12], [14.25, 80.20], [13.80, 80.28], [13.40, 80.33],
];

// Hills / ghats / plateaus: gaussian bumps. r and h in game metres.
export const HILLS = [
  { lat: 18.33, lon: 82.88, r: 2600, h: 85 }, { lat: 18.10, lon: 83.05, r: 1800, h: 65 }, { lat: 17.90, lon: 82.60, r: 2200, h: 70 },
  { lat: 17.50, lon: 82.20, r: 2000, h: 60 }, { lat: 18.70, lon: 83.60, r: 2200, h: 70 }, { lat: 17.55, lon: 81.55, r: 1800, h: 55 },
  { lat: 15.90, lon: 79.00, r: 2800, h: 80 }, { lat: 15.40, lon: 79.10, r: 2400, h: 70 }, { lat: 16.20, lon: 79.20, r: 2200, h: 60 },
  { lat: 14.90, lon: 79.00, r: 2000, h: 55 }, { lat: 13.78, lon: 79.28, r: 700, h: 48, coastal: true }, { lat: 13.85, lon: 79.20, r: 2200, h: 25 },
  { lat: 14.15, lon: 79.20, r: 2000, h: 30 }, { lat: 13.65, lon: 78.40, r: 1100, h: 45 }, { lat: 14.80, lon: 78.30, r: 1500, h: 35 },
  { lat: 14.70, lon: 77.60, r: 900, h: 18 }, { lat: 17.752, lon: 83.350, r: 260, h: 45, coastal: true },
];

// Landmarks placed relative to a city plaza (dx, dz in metres) or at lat/lon
export const LANDMARKS = [
  { type: 'gopuram', city: 'Tirumala', dx: 0, dz: -30, label: 'Sri Venkateswara Temple' },
  { type: 'gopuram', city: 'Tirupati', dx: 60, dz: 40, label: 'Govindaraja Temple' },
  { type: 'lighthouse', lat: 17.715, lon: 83.318, label: 'Vizag Lighthouse' },
  { type: 'chimneys', lat: 17.640, lon: 83.130, label: 'Steel Plant' },
  { type: 'stupa', city: 'Amaravati', dx: 70, dz: 50, label: 'Amaravati Stupa' },
  { type: 'fort', city: 'Kurnool', dx: -80, dz: 60, label: 'Konda Reddy Fort' },
];
