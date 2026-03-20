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

function parse(html) {
  const items = [];
  const seen  = new Set();
  const blocks = html.split(/Posted on:/i);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const dateM      = block.match(/^\s*([^\n<]{4,25})/);
    const postedDate = dateM ? dateM[1].replace(/,/g, "").trim() : "";
    const linkM = block.match(/href="(\/adopt-a-pet\/([\w-]+)\/(\d+))"/);
    if (!linkM) continue;
    const [, fullPath, slug, id] = linkM;
    if (seen.has(id)) continue;
    seen.add(id);
    const imgM   = block.match(/src="(https:\/\/assets\.thepetnest\.com\/[^"]+)"/);
    const imgSrc = imgM ? imgM[1] : "";
    const altM    = block.match(/alt="([^"]+?)\s+for adoption"/i);
    const rawName = altM ? altM[1].trim() : slug.replace(/-in-[\w-]+$/, "").replace(/-/g, " ");
    const name    = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const breedM = slug.match(/^(.+?)-in-/);
    const cityM  = slug.match(/-in-(.+)$/);
    const breed  = breedM ? breedM[1].replace(/-/g, " ") : "";
    const city   = cityM  ? cityM[1].replace(/-/g, " ")  : "";
    const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
    const gM   = text.match(/\b(female|male)\b/);
    const aM   = text.match(/\b(puppyhood|adolescence|adulthood|senior)\b/);
    items.push({ id, name, breed, city,
      gender: gM ? gM[1] : "", age: aM ? aM[1] : "",
      imgSrc, postedDate, href: "https://thepetnest.com" + fullPath });
  }
  return items;
}

exports.handler = async () => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  const hasKey = SCRAPER_API_KEY.length > 5 && SCRAPER_API_KEY !== "YOUR_API_KEY_HERE";

  try {
    let fetchUrl, method;

    if (hasKey) {
      fetchUrl = `https://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(TARGET)}&country_code=in&render=false`;
      method = "scraperapi";
    } else {
      fetchUrl = TARGET;
      method = "direct";
    }

    const { status, body } = await get(fetchUrl);
    const hasListings = body.includes("Posted on:");

    if (!hasListings) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        ok: false, method, httpStatus: status, hasKey,
        error: hasKey
          ? "ScraperAPI key found but still no listings — check key is valid and has credits at scraperapi.com dashboard"
          : "No SCRAPER_API_KEY set in Netlify environment variables — go to Site config → Environment variables → add SCRAPER_API_KEY",
        htmlStart: body.substring(0, 300)
      })};
    }

    const listings = parse(body);
    return { statusCode: 200, headers: cors, body: JSON.stringify({
      ok: true, method, count: listings.length, listings
    })};

  } catch (err) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({
      ok: false, hasKey, error: err.message
    })};
  }
};
