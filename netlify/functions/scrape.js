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
        // Spoof Indian IP so ThePetNest returns listings (they geo-restrict content)
        "X-Forwarded-For": "103.21.58.192",
        "X-Real-IP": "103.21.58.192",
        "CF-IPCountry": "IN",
        "X-Country-Code": "IN",
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

  // Split on "Posted on:" to get individual listing blocks
  const blocks = html.split(/Posted on:/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Date: first thing after "Posted on:"
    const dateM = block.match(/^\s*([^<\n]{3,30})/);
    const postedDate = dateM ? dateM[1].replace(/,/g,"").trim() : "";

    // Find the adopt-a-pet link in this block
    const linkM = block.match(/href="(\/adopt-a-pet\/([\w-]+)\/(\d+))"/);
    if (!linkM) continue;

    const fullPath = linkM[1];
    const slug     = linkM[2];
    const id       = linkM[3];
    if (seen.has(id)) continue;
    seen.add(id);

    // Image src
    const imgM   = block.match(/src="(https:\/\/assets\.thepetnest\.com\/[^"]+)"/);
    const imgSrc = imgM ? imgM[1] : "";

    // Cat name from alt
    const altM    = block.match(/alt="([^"]+?)\s+for adoption"/i);
    const rawName = altM ? altM[1].trim() : slug.replace(/-in-[\w-]+$/, "").replace(/-/g, " ");
    const name    = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    // Breed & city from slug
    const breedM = slug.match(/^(.+?)-in-/);
    const cityM  = slug.match(/-in-(.+)$/);
    const breed  = breedM ? breedM[1].replace(/-/g, " ") : "";
    const city   = cityM  ? cityM[1].replace(/-/g, " ")  : "";

    // Gender & age from stripped text
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
