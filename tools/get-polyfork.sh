#!/usr/bin/env bash
# Downloads the free Polyfork GLB models the game uses into client/assets/models/pf/ (run once from the project root).
# Needs curl (Termux: pkg install curl). Free models need no key. Safe to re-run: existing files are skipped.
cd "$(dirname "$0")/.." || exit 1
OUT=client/assets/models/pf; mkdir -p "$OUT"
ok=0; bad=0; have=()
while read -r id; do
  [ -z "$id" ] && continue
  f="$OUT/$id.glb"
  if [ -s "$f" ]; then ok=$((ok+1)); have+=("$id"); continue; fi
  if curl -fsSL --retry 2 -m 60 -o "$f.part" "https://polyfork.dev/cdn/$id.glb" && [ -s "$f.part" ] && head -c4 "$f.part" | grep -q glTF; then
    mv "$f.part" "$f"; ok=$((ok+1)); have+=("$id"); echo "ok   $id"
  else rm -f "$f.part"; bad=$((bad+1)); echo "FAIL $id"; fi
done < tools/pf-ids.txt
printf '{"ids":[' > "$OUT/manifest.json"; first=1
for id in "${have[@]}"; do [ $first = 1 ] && first=0 || printf ',' >> "$OUT/manifest.json"; printf '"%s"' "$id" >> "$OUT/manifest.json"; done
printf ']}\n' >> "$OUT/manifest.json"
echo "done: $ok models ready, $bad failed. Now: git add -A && git commit -m models && git push"
