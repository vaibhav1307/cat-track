const https = require("https");

// ── Replace with your ScraperAPI key ──────────────────────────────────────────
// Get a free key at https://www.scraperapi.com (1000 free calls/month)
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "YOUR_API_KEY_HERE";

const TARGET = "https://thepetnest.com/adopt-a-cat?category_id=2&state_id=1";

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept-Encoding": "identity",
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", c => buf += c);
      res.on("end", () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on("error", reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function parse(html) {
  const items = [];
  const seen  = new Set();

  // Split on "Posted on:" — each block is one listing
  const blocks = html.split(/Posted on:/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Date is the text immediately after "Posted on:"
    const dateM      = block.match(/^\s*([^\n<]{4,25})/);
    const postedDate = dateM ? dateM[1].replace(/,/g, "").trim() : "";

    // Link + slug + id
    const linkM = block.match(/href="(\/adopt-a-pet\/([\w-]+)\/(\d+))"/);
    if (!linkM) continue;
    const [, fullPath, slug, id] = linkM;
    if (seen.has(id)) continue;
    seen.add(id);

    // Image (full signed URL is fine — expires in ~48h but always fresh on each scrape)
    const imgM   = block.match(/src="(https:\/\/assets\.thepetnest\.com\/[^"]+)"/);
    const imgSrc = imgM ? imgM[1] : "";

    // Name from alt text
    const altM    = block.match(/alt="([^"]+?)\s+for adoption"/i);
    const rawName = altM ? altM[1].trim() : slug.replace(/-in-[\w-]+$/, "").replace(/-/g, " ");
    const name    = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    // Breed & city from slug
    const breedM = slug.match(/^(.+?)-in-/);
    const cityM  = slug.match(/-in-(.+)$/);
    const breed  = breedM ? breedM[1].replace(/-/g, " ") : "";
    const city   = cityM  ? cityM[1].replace(/-/g, " ")  : "";

    // Gender & age from surrounding plain text
    const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
    const gM   = text.match(/\b(female|male)\b/);
    const aM   = text.match(/\b(puppyhood|adolescence|adulthood|senior)\b/);

    items.push({
      id,
      name,
      breed,
      city,
      gender    : gM ? gM[1] : "",
      age       : aM ? aM[1] : "",
      imgSrc,
      postedDate,
      href      : "https://thepetnest.com" + fullPath,
    });
  }

  return items;
}

exports.handler = async () => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  try {
    // Route through ScraperAPI with India geotargeting
    // country_code=in makes ThePetNest think we're in India → returns full listings
    const apiUrl =
      `https://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}` +
      `&url=${encodeURIComponent(TARGET)}` +
      `&country_code=in` +
      `&render=false`;

    const { status, body } = await get(apiUrl);

    if (status !== 200) {
      throw new Error(`ScraperAPI returned HTTP ${status}`);
    }

    // Sanity check — if we got an empty shell (no "Posted on:"), something went wrong
    if (!body.includes("Posted on:")) {
      throw new Error("Page returned no listings (possible block or empty page)");
    }

    const listings = parse(body);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: true, count: listings.length, listings }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
