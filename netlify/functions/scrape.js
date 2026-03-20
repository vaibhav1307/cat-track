const https = require("https");

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "";
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

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parse(html) {
  const items = [];
  const seen  = new Set();

  // Split on pet__item — each block is one listing card
  const blocks = html.split('class="pet__item"');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Date: inside <a class="tag">Posted on: 18 Mar, 2026</a>
    const dateM = block.match(/Posted on:\s*([^<]+)/);
    const postedDate = dateM ? dateM[1].replace(/,/g, "").trim() : "";

    // Link + slug + id: href="https://thepetnest.com/adopt-a-pet/persian-in-vasai-virar/22322"
    const linkM = block.match(/href="https:\/\/thepetnest\.com(\/adopt-a-pet\/([\w-]+)\/(\d+))"/);
    if (!linkM) continue;
    const [, fullPath, slug, id] = linkM;
    if (seen.has(id)) continue;
    seen.add(id);

    // Image: src="https://assets.thepetnest.com/..." — decode &amp; entities
    const imgM = block.match(/src="(https:\/\/assets\.thepetnest\.com\/[^"]+)"/);
    const imgSrc = imgM ? decodeEntities(imgM[1]) : "";

    // Name: <div class="pet__name">Ginger</div>
    const nameM = block.match(/class="pet__name">([^<]+)</);
    const name  = nameM ? nameM[1].trim() : slug.replace(/-in-[\w-]+$/, "").replace(/-/g, " ");

    // Breed & city from slug
    const breedM = slug.match(/^(.+?)-in-/);
    const cityM  = slug.match(/-in-(.+)$/);
    const breed  = breedM ? breedM[1].replace(/-/g, " ") : "";
    const city   = cityM  ? cityM[1].replace(/-/g, " ")  : "";

    // Gender & age: <span>male</span> ... <span>adulthood</span>
    // They appear inside .pet-meta-details spans
    const metaM  = block.match(/class="pet-meta-details">([\s\S]*?)<\/div>/);
    const meta   = metaM ? metaM[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase() : "";
    const gM     = meta.match(/\b(female|male)\b/);
    const aM     = meta.match(/\b(puppyhood|adolescence|adulthood|senior)\b/);

    // Owner name (bonus field): <span>Raunaq Sahni</span>
    const ownerM = block.match(/class="owner-name">\s*Name:\s*<b><span>([^<]+)<\/span>/);
    const owner  = ownerM ? ownerM[1].trim() : "";

    items.push({
      id,
      name,
      breed,
      city,
      gender    : gM ? gM[1] : "",
      age       : aM ? aM[1] : "",
      imgSrc,
      postedDate,
      owner,
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
    const fetchUrl =
      `https://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}` +
      `&url=${encodeURIComponent(TARGET)}` +
      `&country_code=in&render=false`;

    const { status, body } = await get(fetchUrl);

    if (status !== 200) throw new Error(`HTTP ${status}`);
    if (!body.includes('class="pet__item"')) throw new Error("No pet items found in page");

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
