#!/usr/bin/env bash
# Generates the small sample videos / posters / images used by `npm run db:seed:demo`.
# Needs ffmpeg (FFMPEG=/path/to/ffmpeg to override). The generated files are committed, so you normally never run this.
set -euo pipefail
FF="${FFMPEG:-ffmpeg}"
OUT="$(dirname "$0")/../public/demo"
mkdir -p "$OUT"

video() { # name w h dur c0 c1 c2 c3 freq
  local name=$1 w=$2 h=$3 d=$4 c0=$5 c1=$6 c2=$7 c3=$8 f=$9
  "$FF" -y -loglevel error \
    -f lavfi -i "gradients=s=${w}x${h}:d=${d}:c0=${c0}:c1=${c1}:c2=${c2}:c3=${c3}:nb_colors=4:speed=0.04:rate=24" \
    -f lavfi -i "testsrc2=s=$((w/4))x$((h/4)):d=${d}:r=24" \
    -f lavfi -i "sine=frequency=${f}:duration=${d}:sample_rate=44100" \
    -filter_complex "[1:v]format=yuva420p,colorchannelmixer=aa=0.82[t];[0:v][t]overlay=W-w-24:H-h-24,format=yuv420p[v];[2:a]volume=0.04[a]" \
    -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 31 -r 24 -g 24 -pix_fmt yuv420p -c:a aac -b:a 40k -movflags +faststart "$OUT/$name.mp4"
  "$FF" -y -loglevel error -ss 2 -i "$OUT/$name.mp4" -frames:v 1 -vf "scale=${w}:-2" -q:v 5 "$OUT/$name.jpg"
}
video tour-v1 1280 720 20 0x14213d 0xff5b2e 0x1d3557 0x0b132b 196
video tour-v2 1280 720 20 0x0b3d40 0xffb703 0x023047 0x219ebc 220
video podcast-clip 1280 720 18 0x2b193d 0x8338ec 0x3a0ca3 0x10002b 165
video launch-explainer 1280 720 16 0x0d1b2a 0x3a86ff 0x1b263b 0x415a77 247
video reel 540 960 12 0x3d0a1f 0xff006e 0x480ca8 0x1a0a2e 294

thumb() { # name c0 c1 c2 c3
  "$FF" -y -loglevel error -f lavfi -i "gradients=s=1280x720:d=1:c0=$2:c1=$3:c2=$4:c3=$5:nb_colors=4:speed=0.5:seed=$RANDOM" -frames:v 1 -q:v 5 "$OUT/$1.jpg"
}
thumb work-1 0x14213d 0xff5b2e 0x1d3557 0x0b132b
thumb work-2 0x0b3d40 0xffb703 0x023047 0x219ebc
thumb work-3 0x2b193d 0x8338ec 0x3a0ca3 0x10002b
thumb work-4 0x0d1b2a 0x3a86ff 0x1b263b 0x415a77
thumb work-5 0x3d0a1f 0xff006e 0x480ca8 0x1a0a2e
thumb work-6 0x1b4332 0x95d5b2 0x2d6a4f 0x081c15
thumb work-7 0x370617 0xf48c06 0x6a040f 0x03071e
thumb work-8 0x10002b 0x00b4d8 0x240046 0x03045e
thumb work-9 0x22223b 0xf2e9e4 0x4a4e69 0x9a8c98
thumb work-10 0x2d0a31 0xe63946 0x1d1128 0x457b9d

"$FF" -y -loglevel error -f lavfi -i "sine=frequency=330:duration=6" -c:a libmp3lame -b:a 48k "$OUT/music-bed.mp3"
"$FF" -y -loglevel error -f lavfi -i "gradients=s=512x512:d=1:c0=0x14213d:c1=0xff5b2e:nb_colors=2:speed=0.5" -frames:v 1 "$OUT/brand-logo.png"
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > "$OUT/brand-guidelines.pdf"
ls -la "$OUT"
