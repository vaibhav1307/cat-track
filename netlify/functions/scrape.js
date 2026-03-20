const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", c => buf += c);
      res.on("end", () => resolve(buf));
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function parse(html) {
  const items = [];
  const seen  = new Set();

  // Each listing block: find every anchor pointing to /adopt-a-pet/.../ID
  const re = /href="(\/adopt-a-pet\/([\w-]+)\/(\d+))"/g;
  let m;

  while ((m = re.exec(html)) !== null) {
    const fullPath = m[1];
    const slug     = m[2];
    const id       = m[3];
    if (seen.has(id)) continue;
    seen.add(id);

    // Grab surrounding HTML – search backwards too for "Posted on" date
    const start = Math.max(0, m.index - 800);
    const end   = Math.min(html.length, m.index + 1500);
    const chunk = html.slice(start, end);

    // Image: assets.thepetnest.com — grab the base key before the query string
    const imgM = chunk.match(/src="(https:\/\/assets\.thepetnest\.com\/[A-Za-z0-9]+)/);
    // Use a proxy-friendly image URL (just the key, no expiring sig)
    const imgKey = imgM ? imgM[1] : "";
    // We'll keep the full signed URL as-is; they last ~48h which is fine for display
    const imgFull = chunk.match(/src="(https:\/\/assets\.thepetnest\.com\/[^"]+)"/);
    const imgSrc  = imgFull ? imgFull[1] : "";

    // Cat name from alt attribute
    const altM = chunk.match(/alt="([^"]+?)\s+for adoption"/i);
    const rawName = altM
      ? altM[1].trim()
      : slug.replace(/-in-[\w-]+$/, "").replace(/-/g, " ");
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    // Breed & city from slug
    const breedM = slug.match(/^([\w-]+?)-in-/);
    const cityM  = slug.match(/-in-([\w-]+)$/);
    const breed  = breedM ? breedM[1].replace(/-/g, " ") : "";
    const city   = cityM  ? cityM[1].replace(/-/g, " ")  : "";

    // Strip tags for text matching
    const text = chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
    const gM   = text.match(/\b(female|male)\b/);
    const aM   = text.match(/\b(puppyhood|adolescence|adulthood|senior)\b/);
    // Date in "Posted on: 18 Mar, 2026" format
    const dM   = chunk.match(/Posted on:\s*([^<\n]+)/i);

    items.push({
      id,
      name,
      breed,
      city,
      gender    : gM ? gM[1] : "",
      age       : aM ? aM[1] : "",
      imgSrc,
      postedDate: dM ? dM[1].replace(/,/g, "").trim() : "",
      href      : "https://thepetnest.com" + fullPath,
    });
  }

  return items;
}

exports.handler = async () => {
  const cors = {
    "Access-Control-Allow-Origin" : "*",
    "Content-Type"                : "application/json",
    "Cache-Control"               : "no-store",
  };

  try {
    const html     = await get("https://thepetnest.com/adopt-a-cat?category_id=2&state_id=1");
    const listings = parse(html);
    return {
      statusCode: 200,
      headers   : cors,
      body      : JSON.stringify({ ok: true, count: listings.length, listings }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers   : cors,
      body      : JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
