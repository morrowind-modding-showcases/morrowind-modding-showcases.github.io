#!/usr/bin/env bash
# One-time mirror of UESP Morrowind map tiles, zoom 0-5, into map/tiles/.
# Tiles are (c) UESP / Bethesda Softworks; used with attribution on the map page.
set -u

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
BASE="https://maps.uesp.net/mwmap/morrowind/leaflet/default"
DEST="$(dirname "$0")/../tiles"

total=0
miss=0
for z in 0 1 2 3 4 5; do
  n=$((1 << z))
  mkdir -p "$DEST/zoom$z"
  for ((x = 0; x < n; x++)); do
    for ((y = 0; y < n; y++)); do
      f="$DEST/zoom$z/morrowind-$x-$y.jpg"
      if [ -s "$f" ]; then continue; fi
      code=$(curl -s -A "$UA" -o "$f" -w "%{http_code}" "$BASE/zoom$z/morrowind-$x-$y.jpg")
      total=$((total + 1))
      if [ "$code" != "200" ]; then
        rm -f "$f"
        miss=$((miss + 1))
        echo "MISS zoom$z/$x-$y ($code)"
      fi
      sleep 0.08
    done
  done
  echo "zoom$z complete"
done
echo "downloaded=$total missing=$miss"
