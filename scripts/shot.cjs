// Browser check helper: screenshots of the built app (dist/) in themes and sizes.
//   bun run preview:build
//   NODE_PATH=$(npm root -g) node scripts/shot.cjs <outDir> "<query>" [themes=vertep,dark,light] [sizes=1280x800,390x844]
// <query> is the URL query without the theme, e.g. "screen=forum&view=topic".
// Prints console errors and page errors, and horizontal overflow of the page.
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const [outDir, query = "", themesArg = "vertep,dark,light", sizesArg = "1280x800,390x844"] = process.argv.slice(2);
if (!outDir) { console.error("usage: shot.cjs <outDir> <query> [themes] [sizes]"); process.exit(2); }
const dist = path.resolve(__dirname, "..", "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(dist, p);
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  for (const theme of themesArg.split(",")) {
    for (const size of sizesArg.split(",")) {
      const [w, h] = size.split("x").map(Number);
      const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const logs = [];
      p.on("pageerror", (e) => logs.push("ERR " + e.message));
      p.on("console", (m) => { if (m.type() === "error") logs.push(m.text()); });
      const q = [query, `theme=${theme}`].filter(Boolean).join("&");
      await p.goto(`http://127.0.0.1:${port}/?${q}`);
      await p.waitForTimeout(500);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const name = `${(query || "main").replace(/[^a-z0-9]+/gi, "-")}-${theme}-${w}.png`;
      await p.screenshot({ path: path.join(outDir, name) });
      console.log(name, over > 0 ? `H-OVERFLOW ${over}px` : "ok", logs.join(" | "));
      await p.close();
    }
  }
  await b.close();
  server.close();
})();
