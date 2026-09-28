// GET /media/videos/*
// Cloudflare Pages static assets answer "Range" requests with the whole file (200). iPhone Safari
// refuses to play video from servers that do that, so this function returns proper 206 partial
// responses. It only runs for videos stored in the site itself; videos on R2 do not need it.

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;

export async function onRequestGet({ request, env }) {
  const assetUrl = new URL(request.url);
  const range = request.headers.get("Range");

  // ask the asset server for the whole file (it would ignore the range anyway)
  const asset = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: "GET" }));
  if (!asset.ok) return asset;

  const headers = new Headers(asset.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", "video/mp4");
  headers.set("Cache-Control", "public, max-age=2592000");

  const m = range && RANGE_RE.exec(range.trim());
  if (!m) return new Response(asset.body, { status: 200, headers });

  const data = new Uint8Array(await asset.arrayBuffer());
  const size = data.byteLength;
  let start;
  let end;
  if (m[1] === "") {
    // suffix range: the last N bytes
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    headers.set("Content-Range", `bytes */${size}`);
    headers.delete("Content-Length");
    return new Response(null, { status: 416, headers });
  }

  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(data.subarray(start, end + 1), { status: 206, headers });
}

export async function onRequestHead(context) {
  const res = await onRequestGet(context);
  return new Response(null, { status: res.status, headers: res.headers });
}
