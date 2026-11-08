#!/usr/bin/env python3
"""Convert BBBike/Osmium GeoJSON extracts into compact game data.
usage: osm2game.py <id> "<Name>" <west> <south> <east> <north> <file.geojson> <outdir>
Writes <outdir>/<id>.json (meta), <id>.roads.bin, <id>.bld.bin, <id>.land.bin"""
import sys, json, math, struct, hashlib
import numpy as np
from PIL import Image, ImageDraw

rid, rname, W_, S_, E_, N_, src, out = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7]), sys.argv[7], sys.argv[8]
latc = (S_ + N_) / 2
KX, KZ = 111320 * math.cos(math.radians(latc)), 110574.0
WIDTH, HEIGHT = (E_ - W_) * KX, (N_ - S_) * KZ
def prj(lon, lat): return ((lon - W_) * KX, (N_ - lat) * KZ)
CELL = 20.0
GW, GH = int(math.ceil(WIDTH / CELL)), int(math.ceil(HEIGHT / CELL))

ROAD_CLS = {'motorway': 0, 'motorway_link': 0, 'trunk': 1, 'trunk_link': 1, 'primary': 2, 'primary_link': 2, 'secondary': 3, 'secondary_link': 3,
            'tertiary': 4, 'tertiary_link': 4, 'unclassified': 5, 'residential': 6, 'living_street': 6, 'service': 7, 'track': 8}
LAND = {'farmland': 3, 'farmyard': 3, 'orchard': 3, 'vineyard': 3, 'plant_nursery': 3, 'meadow': 5, 'grass': 5, 'recreation_ground': 5, 'village_green': 5, 'cemetery': 5,
        'forest': 4, 'wood': 4, 'scrub': 4, 'wetland': 4, 'residential': 2, 'commercial': 6, 'retail': 6, 'industrial': 6, 'construction': 8, 'quarry': 8, 'brownfield': 8,
        'beach': 7, 'sand': 7, 'bare_rock': 8, 'park': 5, 'garden': 5, 'pitch': 5, 'playground': 5}
BCLS = {'apartments': 1, 'residential': 1, 'dormitory': 1, 'commercial': 2, 'retail': 2, 'office': 2, 'hotel': 2, 'industrial': 3, 'warehouse': 3, 'factory': 3, 'church': 4, 'temple': 4, 'mosque': 4,
        'shrine': 4, 'school': 5, 'hospital': 5, 'university': 5, 'college': 5, 'public': 5, 'government': 5, 'civic': 5}

def dp(pts, tol):
    n = len(pts)
    if n < 3: return pts
    keep = [False] * n; keep[0] = keep[-1] = True; st = [(0, n - 1)]
    while st:
        a, b = st.pop(); ax, az = pts[a]; bx, bz = pts[b]; dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz) or 1e-9
        md, mi = 0, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L
            if d > md: md, mi = d, i
        if md > tol: keep[mi] = True; st += [(a, mi), (mi, b)]
    return [p for p, k in zip(pts, keep) if k]

def hull(P):
    P = sorted(set(P))
    if len(P) < 3: return P
    def cr(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo = []
    for p in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    up = []
    for p in reversed(P):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

def minrect(ring):
    H = hull(ring)
    if len(H) < 3: return None
    best = None
    for i in range(len(H)):
        ax, az = H[i]; bx, bz = H[(i + 1) % len(H)]; L = math.hypot(bx - ax, bz - az)
        if L < 1e-6: continue
        ux, uz = (bx - ax) / L, (bz - az) / L
        us = [(p[0]-ax)*ux + (p[1]-az)*uz for p in H]; vs = [-(p[0]-ax)*uz + (p[1]-az)*ux for p in H]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs); area = (u1-u0)*(v1-v0)
        if best is None or area < best[0]: best = (area, ux, uz, u0, u1, v0, v1, ax, az)
    if not best: return None
    area, ux, uz, u0, u1, v0, v1, ax, az = best
    mu, mv = (u0 + u1) / 2, (v0 + v1) / 2
    # local z axis in our convention is (-uz_s, ux_c): v axis = (-uz, ux)  => point = a + u*(ux,uz) + v*(-uz,ux)
    cx = ax + mu * ux - mv * uz; cz = az + mu * uz + mv * ux
    ang = math.atan2(uz, ux) % math.pi
    return cx, cz, (u1 - u0) / 2, (v1 - v0) / 2, ang

def hsh(*a): return int(hashlib.md5(repr(a).encode()).hexdigest()[:8], 16)

roads, names, bld, hubs, stations, rails, rstations, police = [], {}, [], [], [], [], [], []
land = Image.new('L', (GW, GH), 0); ld = ImageDraw.Draw(land)
layers = {}   # class -> list of polygons (so draw order is by priority)
water_poly, water_lines = [], []
def ring_px(ring): return [(x / CELL, z / CELL) for x, z in ring]
def poly_rings(g):
    if g['type'] == 'Polygon': return [g['coordinates']]
    if g['type'] == 'MultiPolygon': return g['coordinates']
    return []

n = 0
with open(src) as f:
    for line in f:
        line = line.strip().rstrip(',')
        if not line.startswith('{"type":"Feature"'): continue
        ft = json.loads(line); p = ft['properties']; g = ft['geometry']; gt = g['type']; n += 1
        if p.get('amenity') == 'police' and gt in ('Point', 'Polygon', 'MultiPolygon'):
            c = g['coordinates']; 
            while isinstance(c[0], list): c = c[0] if gt != 'Point' and isinstance(c[0][0], list) else (c[0] if isinstance(c[0][0], (int, float)) else c[0])
            if gt == 'Point': ll = c
            else:
                ring = g['coordinates'][0] if gt == 'Polygon' else g['coordinates'][0][0]; ll = [sum(q[0] for q in ring) / len(ring), sum(q[1] for q in ring) / len(ring)]
            x, z = prj(*ll); police.append({'x': round(x, 1), 'z': round(z, 1), 'name': p.get('name') or 'Police Station'})
        if gt == 'Point':
            pl = p.get('place')
            if pl in ('city', 'town', 'suburb') and p.get('name'):
                x, z = prj(*g['coordinates']); hubs.append({'name': p['name'], 'te': p.get('name:te', ''), 'tier': 2 if pl == 'city' else 1 if pl == 'town' else 0, 'x': round(x), 'z': round(z)})
            if p.get('railway') in ('station', 'halt') and p.get('name') and p.get('railway') != 'abandoned':
                x, z = prj(*g['coordinates']); rstations.append({'x': round(x, 1), 'z': round(z, 1), 'name': p['name'], 'te': p.get('name:te', ''), 'ref': p.get('ref', '')})
            if p.get('amenity') == 'fuel':
                x, z = prj(*g['coordinates']); stations.append({'x': round(x, 1), 'z': round(z, 1), 'name': p.get('name') or p.get('brand') or 'Petrol bunk'})
            continue
        if 'highway' in p and gt == 'LineString' and p['highway'] in ROAD_CLS:
            pts = [prj(*c) for c in g['coordinates']]
            if max(abs(pts[0][0] - pts[-1][0]), 1) and len(pts) < 2: continue
            pts = dp(pts, 1.0)
            cls = ROAD_CLS[p['highway']]
            if cls <= 4 and (p.get('ref') or p.get('name')): names[len(roads)] = (p.get('ref') or p.get('name'))[:24]
            roads.append((cls, pts, 1 if p.get('bridge') in ('yes', 'viaduct') else 0)); continue
        if p.get('railway') in ('rail', 'light_rail', 'narrow_gauge') and gt == 'LineString' and not p.get('service') and p.get('tunnel') != 'yes':
            rails.append(dp([prj(*c) for c in g['coordinates']], 1.5)); continue
        if 'building' in p and gt == 'MultiPolygon':
            bt = p['building']; bc = BCLS.get(bt, 0)
            if p.get('amenity') == 'place_of_worship' or p.get('building') in ('temple',): bc = 4
            for poly in g['coordinates']:
                ring = [prj(*c) for c in poly[0]]
                if len(ring) < 4: continue
                r = minrect(ring)
                if not r: continue
                cx, cz, hw, hd, ang = r
                if hw < 1.0 or hd < 1.0: continue
                area = 4 * hw * hd; hs = hsh(round(cx), round(cz))
                try: lv = float(str(p.get('building:levels', '')).split(';')[0])
                except ValueError: lv = 0
                try: ht = float(str(p.get('height', '')).replace('m', '').strip())
                except ValueError: ht = 0
                if ht <= 0:
                    if lv <= 0:
                        r01 = (hs % 1000) / 1000
                        if bc == 1: lv = 3 + int(r01 * 6)
                        elif bc == 2: lv = 2 + int(r01 * 4)
                        elif bc == 3: lv = 1
                        elif bc == 4: lv = 2 + int(r01 * 2)
                        elif area > 800: lv = 2 + int(r01 * 3)
                        else: lv = 1 + (r01 > 0.62) + (r01 > 0.9)
                    ht = lv * 3.2 + (3 if bc == 3 else 0.6)
                bld.append((cx, cz, hw, hd, ang, ht, bc))
            continue
        if gt == 'MultiPolygon':
            k = p.get('natural') if p.get('natural') in ('water', 'wood', 'scrub', 'wetland', 'beach', 'bare_rock', 'sand') else None
            if p.get('waterway') == 'riverbank' or p.get('water') or k == 'water': k = 'water'
            if not k: k = p.get('landuse') or p.get('leisure')
            if k == 'water': water_poly += [[prj(*c) for c in poly[0]] for poly in g['coordinates']]
            elif k in LAND:
                layers.setdefault(LAND[k], []).extend([[prj(*c) for c in poly[0]] for poly in g['coordinates']])
            continue
        if gt == 'LineString' and p.get('waterway') in ('river', 'canal'):
            water_lines.append((p['waterway'], [prj(*c) for c in g['coordinates']]))

for cls in (3, 8, 5, 4, 6, 2, 7):           # draw order: farm, dirt, parks, forest, commercial, residential, sand
    for ring in layers.get(cls, []):
        if len(ring) >= 3: ld.polygon(ring_px(ring), fill=cls)
for ring in water_poly:
    if len(ring) >= 3: ld.polygon(ring_px(ring), fill=1)
for kind, pts in water_lines:
    if len(pts) >= 2: ld.line(ring_px(pts), fill=1, width=2 if kind == 'river' else 1)
arr = np.asarray(land, dtype=np.uint8).ravel()

def pad4(b): return b + b'\0' * (-len(b) % 4)
# roads.bin
starts = [0]; flat = []
for cls, pts, br in roads: flat += [c for p in pts for c in p]; starts.append(starts[-1] + len(pts))
rb = struct.pack('<II', len(roads), starts[-1]) + pad4(bytes(r[0] | (r[2] << 7) for r in roads)) + np.array(starts, '<u4').tobytes() + np.array(flat, '<f4').tobytes()
open(f'{out}/{rid}.roads.bin', 'wb').write(rb)
# rails
rs = [0]; rflat = []
for pts in rails: rflat += [c for q in pts for c in q]; rs.append(rs[-1] + len(pts))
open(f'{out}/{rid}.rail.bin', 'wb').write(struct.pack('<II', len(rails), rs[-1]) + np.array(rs, '<u4').tobytes() + np.array(rflat, '<f4').tobytes())
# buildings
B = np.array(bld, dtype=np.float64).reshape(-1, 7); m = len(B)
bb = struct.pack('<I', m) + B[:, 0].astype('<f4').tobytes() + B[:, 1].astype('<f4').tobytes() + pad4(np.clip(B[:, 2] * 20, 1, 65535).astype('<u2').tobytes()) + pad4(np.clip(B[:, 3] * 20, 1, 65535).astype('<u2').tobytes()) \
   + pad4(np.clip(B[:, 4] / math.pi * 255, 0, 255).astype('u1').tobytes()) + pad4(np.clip(B[:, 5] * 2, 1, 255).astype('u1').tobytes()) + pad4(B[:, 6].astype('u1').tobytes())
open(f'{out}/{rid}.bld.bin', 'wb').write(bb)
# land raster RLE
ch = np.flatnonzero(np.diff(arr)) + 1; st = np.concatenate([[0], ch]); ln = np.diff(np.concatenate([st, [len(arr)]])); cl = arr[st]
rc, rl = [], []
for c, l in zip(cl, ln):
    while l > 0: t = min(int(l), 65535); rc.append(int(c)); rl.append(t); l -= t
lb = struct.pack('<I', len(rc)) + pad4(bytes(rc)) + np.array(rl, '<u2').tobytes()
open(f'{out}/{rid}.land.bin', 'wb').write(lb)
# hubs: keep best 40 (cities first), unique names
seen, H = set(), []
for h in sorted(hubs, key=lambda h: -h['tier']):
    if h['name'] in seen or not (0 < h['x'] < WIDTH and 0 < h['z'] < HEIGHT): continue
    seen.add(h['name']); H.append(h)
H = H[:40]
meta = {'id': rid, 'name': rname, 'w': round(WIDTH), 'h': round(HEIGHT), 'lat0': N_, 'lon0': W_, 'kx': KX, 'kz': KZ, 'cell': CELL, 'gw': GW, 'gh': GH,
        'nRoads': len(roads), 'nBld': m, 'hubs': H, 'stations': stations[:400], 'police': police[:200], 'rstations': rstations, 'roadNames': {str(k): v for k, v in names.items()}}
json.dump(meta, open(f'{out}/{rid}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(rid, 'features', n, 'roads', len(roads), 'buildings', m, 'hubs', len(H), 'stations', len(stations), 'raster', GW, GH, 'runs', len(rc))
