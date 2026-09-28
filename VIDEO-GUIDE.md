# Adding video to the Fidelstine site

The site is already wired for video. Drop files into the `assets/` folder with these exact names — no code changes needed.

## 1. Hero background video  →  `assets/hero-video.mp4` (optional: `hero-video.webm`)
- Fades in over the photo slideshow once it starts playing; the slideshow dots hide automatically.
- A small pause/play button appears top-right of the hero (accessibility).
- If the file is missing, or the visitor has "reduce motion" / data-saver on, the photo slideshow is used instead.
- Pauses automatically when scrolled out of view to save battery and data.

**Recommended:** 10–20 second seamless loop, landscape 1920×1080 (or 1280×720), no audio, under ~4 MB.
Compress with ffmpeg:
```
ffmpeg -i source.mov -an -vf "scale=1280:-2" -c:v libx264 -crf 28 -preset slow -movflags +faststart assets/hero-video.mp4
```
Choose footage with calm movement and no on-screen text — the headline and buttons sit on top of it.

## 2. "Our work in motion" story video  →  `assets/story-video.mp4` (optional: `story-video.webm`)
- A full-width video section (with player controls) appears between "Our core values" and "How we walk with them".
- The section stays completely hidden until the file exists, so nothing looks broken while you wait for footage.
- 1–3 minute film works well; export at 1280×720 or 1920×1080, H.264.

## Photos
`hero-slide-urgent.jpg` and `hero-slide-christmas.jpg` are cropped versions of the campaign flyers (title and social-handle bars removed) used only in the hero slideshow.
The original full flyers remain in the "Current outreach flyers" section. Replace both with real, text-free photography when available.

## v2 update — videos now in the site
`hero-video.mp4` (hero + Donate background), `story-video.mp4` ("Our work in motion", has audio), `program-shelter/education/crisis.mp4` (programme rows; crisis also backs the Christmas Scheme band). All clips are the original files, re-wrapped without re-encoding, so quality is unchanged. `poster-*.jpg` are still frames shown while a video loads.
