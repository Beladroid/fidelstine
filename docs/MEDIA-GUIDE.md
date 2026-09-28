# Adding photos and videos

The site builds every slideshow, gallery, reel and video band from one list: `src/_data/media.json`. Adding media never needs layout changes.

## The short version

1. Put the files in `media/incoming/`.
2. Run `npm run media`.
3. Open `src/_data/media.json`. For each new item marked `"review": true`, write the `alt` text and a `caption`, add a `consent` note, and delete the `review` line.
4. Run `npm run media:report` to see which sections still want more.
5. Commit and push. The site redeploys.

## Choosing where things appear

Put files in a sub-folder named after the tags you want, joined with `+`. For example:

```
media/incoming/gallery+shelter/IMG_2041.jpg
media/incoming/hero/sunrise-at-the-home.jpg
media/incoming/reel/morning-songs.mp4
media/incoming/band+education/classroom-loop.mp4
```

If you give no tags, the script decides:

| File | Automatic tags |
|---|---|
| Photo | `gallery` |
| Portrait (upright) video | `reel` and `gallery` |
| Landscape video up to 30 seconds | `band` and `gallery`, trimmed to 20 seconds and made silent |
| Longer landscape video | `library` and `gallery`, sound kept |

### Placement tags

| Tag | Where it shows |
|---|---|
| `hero` | Home page slideshow photos |
| `hero-video` | Home page background video playlist |
| `band` | Full-width video bands between sections |
| `reel` | Tap-through stories (portrait clips) |
| `library` | Video library with playlist |
| `gallery` | Gallery page and the photo ribbon |
| `before` / `after` | Before and after slider. Name files `school-yard.before.jpg` and `school-yard.after.jpg` |
| `testimonial` | Video testimonials |
| `team` | Team and trustees photos, in the order listed |
| `timeline` | Photos for the "Our journey" timeline, in order |
| `about-day` | The four "A day at the home" photos |
| `flyer` | Downloadable campaign flyers |

### Topic tags

`shelter`, `education`, `crisis`, `christmas`, `community`, `events`. These drive the gallery filters and the photo rows on the Programmes and Christmas Scheme pages.

You can also edit tags directly in `media.json` at any time.

## What the script does to your files

- **Photos** are turned upright, resized to at most 2000 pixels, saved as JPEG, and stripped of all hidden data, including GPS location. The build then makes AVIF and WebP versions at three sizes.
- **Videos** get a 720p version, a 480p version for phones, and a poster frame. Phones automatically load the smaller file.
- The originals move to `media/processed/`, which is not committed.

## Cropping

If a photo is cropped badly somewhere, add a `focus` to its entry, for example `"focus": "50% 20%"` to keep the top of the picture in view.

## Many videos: use R2

Once videos pass a few hundred megabytes, store them in Cloudflare R2 instead of the repository:

```
R2_BUCKET=fidelstine-media npm run media -- --r2
```

See `docs/DEPLOY.md` step 6.

## Other options

| Command | What it does |
|---|---|
| `npm run media -- --dry-run` | Show what would happen without changing anything |
| `npm run media -- --tags events` | Add a tag to every file in this run |
| `npm run media -- --backfill` | Create missing phone versions and sizes for existing items |
