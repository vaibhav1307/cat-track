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

    const postedIdx = body.indexOf("Posted on:");

    // Sample 2500 chars starting 100 before first "Posted on:" — this shows a full listing block
    const sample = body.substring(Math.max(0, postedIdx - 100), postedIdx + 2500);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        httpStatus: status,
        bodyLength: body.length,
        firstPostedIdx: postedIdx,
        htmlSample: sample,
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
