// The site, written down for AI assistants and search engines:
//
//   docs/llms.txt     what SifuLaser is, every tool with its link, and the
//                     prices an assistant needs to quote (llmstxt.org format)
//   docs/robots.txt   everyone, AI crawlers included, may read everything
//   docs/sitemap.xml  the pages worth reading
//   index.html        JSON-LD (WebSite + Organization) and a <noscript>
//                     summary between the ai-* markers, because the home page
//                     is a React app and most AI readers do not run JavaScript
//
// Generated, never hand-edited, so they cannot drift: the tool list comes from
// src/data/tools.ts, the laser prices from docs/lasercut/pricing.json (itself
// generated from the calculator) and the UV print prices from the vendored
// calculator's own pricing module. Run after vendoring either calculator or
// changing tools.ts:
//
//     node scripts/build-llms.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const DOCS = path.join(ROOT, 'docs');
const SITE = 'https://sifulaser.com';
const WA = '60134354118';

// ---- tools and steps, read from tools.ts as text (it is TypeScript)
const ts = fs.readFileSync(path.join(ROOT, 'src', 'data', 'tools.ts'), 'utf8');
const str = `'((?:[^'\\\\]|\\\\.)*)'`;
const unq = (s) => s.replace(/\\'/g, "'");
const toolRe = new RegExp(`title: ${str},\\s*shortDescription: ${str},\\s*description:\\s*${str},\\s*href: '([^']+)',\\s*group: '([^']+)'([\\s\\S]*?)Icon:`, 'g');
const tools = [];
for (let m; (m = toolRe.exec(ts));) {
  tools.push({
    title: unq(m[1]), short: unq(m[2]), description: unq(m[3]), href: m[4], group: m[5],
    shelf: /shelf: 'mesin'/.test(m[6]), hidden: /onHome: false/.test(m[6]), soon: /soon: true/.test(m[6]),
  });
}
// A tool marked "akan datang" (soon) is not finished: nothing written for AI
// links to it or quotes its prices.
const allTools = tools;
const soonHrefs = new Set(allTools.filter((t) => t.soon).map((t) => t.href));
const uvSoon = soonHrefs.has('#/uvprint');
const groupRe = new RegExp(`id: '([^']+)',\\s*step: (\\d+),\\s*title: ${str},\\s*chip: ${str},\\s*subtitle: ${str}`, 'g');
const groups = [];
for (let m; (m = groupRe.exec(ts));) groups.push({ id: m[1], step: Number(m[2]), title: unq(m[3]), subtitle: unq(m[5]) });
if (tools.length < 15 || groups.length !== 4) throw new Error(`tools.ts not understood: ${tools.length} tools, ${groups.length} groups`);
for (let i = tools.length - 1; i >= 0; i--) if (tools[i].soon) tools.splice(i, 1);

/** A tool's own page when it has one (docs/<name>/index.html), else its route. */
const urlOf = (href) => {
  const name = href.replace(/^#\//, '');
  return fs.existsSync(path.join(DOCS, name, 'index.html')) ? `${SITE}/${name}/` : `${SITE}/${href}`;
};

// ---- prices
const laser = JSON.parse(fs.readFileSync(path.join(DOCS, 'lasercut', 'pricing.json'), 'utf8'));
const uv = await import(pathToFileURL(path.join(DOCS, 'uvprint', 'src', 'pricing.js')).href);
const rm = (sen) => (sen / 100).toFixed(2);

// ---- llms.txt
const L = [];
const p = (s = '') => L.push(s);
p('# SifuLaser by Mahligai Seni');
p();
p(`> SifuLaser (sifulaser.com) ialah laman Mahligai Seni, kedai laser cut di Malaysia: ${uvSoon ? 'kalkulator harga laser cut' : 'kalkulator harga laser cut dan UV print'} yang membaca fail pelanggan, penjana design untuk laser (kotak, puzzle, keychain, tag, rehal, cake topper, stand nama), alat fail (tulisan, kod QR, ubah saiz, tukar format), dan latihan operator mesin laser. Bahasa utama: Bahasa Melayu. Mata wang: RM.`);
p();
p(`Sebut harga dan pesanan melalui WhatsApp: +${WA} (https://wa.me/${WA}). Semua harga di laman ini ialah anggaran; harga muktamad disahkan oleh staff selepas semakan fail.`);
p();
p('## Harga laser cut (ringkasan untuk AI)');
p();
p(`- Panduan penuh dengan formula dan contoh: ${laser.guide_markdown}`);
p(`- Data JSON: ${laser.url}pricing.json`);
p(`- Kalkulator (muat naik PDF, AI, DXF atau gambar): ${laser.url}`);
p(`- Formula: harga satu set = kos bahan + kos masa laser. Kos bahan = luas kotak setiap kepingan (kaki persegi) x kadar bahan. Kos masa = minit masa mesin x RM${laser.pricing.laser_rate_myr_per_minute}. Jumlah x kuantiti, minimum RM${laser.pricing.minimum_order_myr}, dipaparkan sebagai julat -${laser.pricing.display_range.below_percent}% hingga +${laser.pricing.display_range.above_percent}%.`);
p(`- Masa mesin: potong = panjang (mm) / kelajuan potong; garisan halus = panjang / ${laser.machine.score_speed_mm_per_s}; ukir = (tinggi mm / ${laser.machine.engrave_line_gap_mm}) x (lebar mm / ${laser.machine.engrave_speed_mm_per_s} + ${laser.quick_time_estimate.engrave_line_overhead_seconds}) saat.`);
p(`- Kadar bahan (RM sekaki persegi; kelajuan potong mm/s): ${laser.materials.map((m) => `${m.label} RM${m.material_myr_per_sqft.toFixed(2)} (${m.cut_speed_mm_per_s})`).join('; ')}.`);
p(`- Saiz maksimum sekeping ${laser.pricing.max_piece_cm.long_side} x ${laser.pricing.max_piece_cm.short_side} cm.`);
p();
p('## Harga UV print atas akrilik jernih');
p();
if (uvSoon) {
  // Calculator not finalised: no prices an assistant could repeat as fact.
  p(`- Kalkulator UV print sedang disiapkan dan belum ada harga dalam talian. Untuk sebut harga UV print, hubungi WhatsApp +${WA}.`);
} else {
  p(`- Kalkulator: ${SITE}/uvprint/`);
  p(`- Kadar sekaki persegi (termasuk cetakan dan akrilik): ${uv.MATERIALS.map((m) => `${m.label} RM${rm(m.rateSen)}`).join('; ')}. Luas = lebar x tinggi kotak setiap kepingan. Minimum RM${rm(uv.MIN_SEN).replace('.00', '')}. Saiz maksimum ${uv.BED_LONG_MM / 10} x ${uv.BED_SHORT_MM / 10} cm.`);
}
p();
for (const g of groups) {
  const list = tools.filter((t) => t.group === g.id);
  if (!list.length) continue;
  p(`## ${g.title}`);
  p();
  p(g.subtitle);
  p();
  for (const t of list) p(`- [${t.title}](${urlOf(t.href)}): ${t.description}`);
  p();
}
const llms = `${L.join('\n')}\n`;

// ---- robots.txt
const robots = `# SifuLaser by Mahligai Seni. Semua halaman boleh dibaca, termasuk oleh
# pembantu AI dan enjin carian. Ringkasan untuk AI: ${SITE}/llms.txt
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

// ---- sitemap.xml: the home page, every tool page that exists on its own, and the AI files
const pages = [`${SITE}/`];
for (const t of tools) {
  const u = urlOf(t.href);
  if (!u.includes('#') && !pages.includes(u)) pages.push(u);
}
pages.push(`${SITE}/lasercut/harga.md`, `${SITE}/llms.txt`);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;

// ---- index.html: JSON-LD and a no-JavaScript summary
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ld = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'SifuLaser',
    url: `${SITE}/`,
    inLanguage: 'ms',
    publisher: { '@type': 'Organization', name: 'Mahligai Seni' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Mahligai Seni',
    url: `${SITE}/`,
    description: 'Kedai laser cut di Malaysia: laser cut, ukiran laser dan UV print.',
    contactPoint: { '@type': 'ContactPoint', contactType: 'sales', telephone: `+${WA}`, url: `https://wa.me/${WA}`, availableLanguage: ['ms', 'en'] },
  },
];
const head = `    <!-- ai-head:start - generated by scripts/build-llms.mjs; do not edit by hand -->
    <link rel="alternate" type="text/plain" href="/llms.txt" title="Ringkasan laman untuk AI (llms.txt)" />
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
    <!-- ai-head:end -->`;
const noscript = `    <!-- ai-body:start - generated by scripts/build-llms.mjs; do not edit by hand -->
    <noscript>
      <h1>SifuLaser by Mahligai Seni</h1>
      <p>${uvSoon ? 'Kalkulator harga laser cut' : 'Kalkulator harga laser cut dan UV print'}, penjana design laser, alat fail dan latihan mesin laser. WhatsApp +${WA}.</p>
      <p><a href="/lasercut/">Kalkulator Laser Cut</a> (panduan harga: <a href="/lasercut/harga.md">harga.md</a>) &middot;
        ${uvSoon ? '' : '<a href="/uvprint/">UV Print Calculator</a> &middot; '}<a href="/llms.txt">Ringkasan untuk AI</a></p>
      <ul>
${tools.filter((t) => !t.href.includes('#/lasercut')).map((t) => `        <li><a href="${esc(urlOf(t.href).replace(SITE, ''))}">${esc(t.title)}</a> - ${esc(t.short)}</li>`).join('\n')}
      </ul>
    </noscript>
    <!-- ai-body:end -->`;

function inject(src) {
  const swap = (s, tag, block, anchor) => {
    const re = new RegExp(`[ \\t]*<!-- ${tag}:start[\\s\\S]*?<!-- ${tag}:end -->`);
    if (re.test(s)) return s.replace(re, block);
    if (!s.includes(anchor)) throw new Error(`index.html: anchor for ${tag} not found`);
    return s.replace(anchor, `${block}\n${anchor}`);
  };
  return swap(swap(src, 'ai-head', head, '  </head>'), 'ai-body', noscript, '    <div id="root"></div>');
}

const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
fs.writeFileSync(path.join(DOCS, 'llms.txt'), crlf(llms));
fs.writeFileSync(path.join(DOCS, 'robots.txt'), crlf(robots));
fs.writeFileSync(path.join(DOCS, 'sitemap.xml'), crlf(sitemap));
const idx = path.join(ROOT, 'index.html');
fs.writeFileSync(idx, crlf(inject(fs.readFileSync(idx, 'utf8').replace(/\r\n/g, '\n'))));
console.log(`llms.txt: ${tools.length} tools in ${groups.length} steps; sitemap: ${pages.length} URLs; index.html: JSON-LD + noscript`);
