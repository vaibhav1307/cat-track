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

exports.handler = async () => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  try {
    const fetchUrl = `https://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(TARGET)}&country_code=in&render=false`;
    const { status, body } = await get(fetchUrl);

    // Find a useful chunk — search for "adopt-a-pet" or "persian" or any listing marker
    const adoptIdx   = body.indexOf("adopt-a-pet");
    const postedIdx  = body.indexOf("Posted");
    const persianIdx = body.indexOf("persian");
    const bodyLen    = body.length;

    // Grab 1000 chars around the first listing hint, or just the middle of the page
    const sampleIdx = Math.max(0, Math.min(adoptIdx, postedIdx, persianIdx) - 200);
    const sample    = sampleIdx > 0
      ? body.substring(sampleIdx, sampleIdx + 1000)
      : body.substring(Math.floor(bodyLen / 3), Math.floor(bodyLen / 3) + 1000);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        httpStatus   : status,
        bodyLength   : bodyLen,
        hasPostedOn  : body.includes("Posted on:"),
        hasAdoptAPet : body.includes("adopt-a-pet"),
        hasPersian   : body.includes("persian"),
        firstAdoptIdx: adoptIdx,
        firstPostedIdx: postedIdx,
        htmlSample   : sample,
      }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
