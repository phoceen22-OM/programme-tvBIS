/**
 * Generateur quotidien du programme TV du soir (chaines francaises).
 * Source : programme-tv.net  |  Sortie : programmes-tv/programme-tv-<date>.html + .pdf
 * Usage  : node outils/generer-programme-tv.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'programmes-tv');
const LOGO_DIR = path.join(OUT_DIR, 'logos');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const SITE = 'https://www.programme-tv.net';
// Navigateur headless pour l'export PDF (Windows : Edge/Chrome ; Linux/CI : Chrome/Chromium)
function findBrowser(){
  var candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
    process.env.CHROME_PATH || ''
  ];
  for (var i = 0; i < candidates.length; i++) { if (candidates[i] && fs.existsSync(candidates[i])) return candidates[i]; }
  return null;
}
const KEEP_DAYS = 60;

// Logos clairs (fond blanc dans l'image) : a afficher sur fond sombre
const ON_DARK = new Set(['20-minutes-tv-161','cnews-30','france-2-6','france-3-7','france-4-8','france-5-9','franceinfo-307','gulli-29','la-chaine-parlementaire-11','lequipe-204','m6-12','rmc-life-206','tfx-14','w9-24']);

const CHANNELS = [
  { slug:'tf1-19', name:'TF1', num:'1', group:'tnt' },
  { slug:'france-2-6', name:'France 2', num:'2', group:'tnt' },
  { slug:'france-3-7', name:'France 3', num:'3', group:'tnt' },
  { slug:'france-4-8', name:'France 4', num:'4', group:'tnt' },
  { slug:'france-5-9', name:'France 5', num:'5', group:'tnt' },
  { slug:'m6-12', name:'M6', num:'6', group:'tnt' },
  { slug:'arte-337', name:'Arte', num:'7', group:'tnt' },
  { slug:'la-chaine-parlementaire-11', name:'LCP – Assemblée nationale', num:'8', group:'tnt' },
  { slug:'w9-24', name:'W9', num:'9', group:'tnt' },
  { slug:'tmc-21', name:'TMC', num:'10', group:'tnt' },
  { slug:'tfx-14', name:'TFX', num:'11', group:'tnt' },
  { slug:'gulli-29', name:'Gulli', num:'12', group:'tnt' },
  { slug:'bfmtv-25', name:'BFM TV', num:'13', group:'tnt' },
  { slug:'cnews-30', name:'CNews', num:'14', group:'tnt' },
  { slug:'lci-la-chaine-info-78', name:'LCI', num:'15', group:'tnt' },
  { slug:'franceinfo-307', name:'franceinfo', num:'16', group:'tnt' },
  { slug:'cstar-28', name:'CStar', num:'17', group:'tnt' },
  { slug:'t18-11532', name:'T18', num:'18', group:'tnt' },
  { slug:'novo19-11533', name:'Novo19', num:'19', group:'tnt' },
  { slug:'tf1-series-films-201', name:'TF1 Séries Films', num:'20', group:'tnt' },
  { slug:'lequipe-204', name:"L'Équipe", num:'21', group:'tnt' },
  { slug:'6ter-202', name:'6ter', num:'22', group:'tnt' },
  { slug:'rmc-story-203', name:'RMC Story', num:'23', group:'tnt' },
  { slug:'rmc-decouverte-205', name:'RMC Découverte', num:'24', group:'tnt' },
  { slug:'rmc-life-206', name:'RMC Life', num:'25', group:'tnt' },
  { slug:'canalplus-2', name:'Canal+', num:'*', group:'pay' },
  { slug:'paris-premiere-15', name:'Paris Première', num:'*', group:'pay' },
  { slug:'20-minutes-tv-161', name:'20 Minutes TV', num:'loc.', group:'pay' },
  { slug:'canal-partage-tnt-ile-de-france-163', name:'Canal Partage TNT Île-de-France', num:'loc.', group:'pay' }
];

const GENRE = {
  'Cinéma':{bg:'#e0e7ff',fg:'#3730a3'},'Série TV':{bg:'#dbeafe',fg:'#1d4ed8'},'Téléfilm':{bg:'#ede9fe',fg:'#6d28d9'},
  'Sport':{bg:'#dcfce7',fg:'#15803d'},'Divertissement':{bg:'#ffedd5',fg:'#c2410c'},'Divertissement-humour':{bg:'#fee2e2',fg:'#b91c1c'},
  'Culture Infos':{bg:'#ccfbf1',fg:'#0f766e'},'Documentaire':{bg:'#cffafe',fg:'#0e7490'},'Magazine':{bg:'#fce7f3',fg:'#be185d'},
  'Autre':{bg:'#e5e7eb',fg:'#374151'},'Autres':{bg:'#e5e7eb',fg:'#374151'}
};

function log(){
  var line = '[' + new Date().toISOString().slice(0,19).replace('T',' ') + '] ' + Array.prototype.slice.call(arguments).join(' ');
  try { fs.appendFileSync(path.join(OUT_DIR, 'log.txt'), line + '\n'); } catch (e) {}
  console.log(line);
}
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

async function fetchText(url){
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(800 * attempt);
    }
  }
}

function dec(s){
  return String(s||'')
    .replace(/&#(\d+);/g, function(_, n){ return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à').replace(/&ecirc;/g, 'ê')
    .replace(/&ccedil;/g, 'ç').replace(/&ocirc;/g, 'ô').replace(/&ucirc;/g, 'û').replace(/&icirc;/g, 'î')
    .replace(/&euml;/g, 'ë').replace(/&ugrave;/g, 'ù').replace(/&Eacute;/g, 'É').replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
function esc(s){ return dec(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toMin(t){ var m = /^(\d\d)h(\d\d)$/.exec(t||''); return m ? parseInt(m[1],10)*60 + parseInt(m[2],10) : -1; }
function durMin(d){ if(!d) return 0; var h=/(\d+)h/.exec(d); var mn=/(\d+)min/.exec(d); return (h?parseInt(h[1],10)*60:0) + (mn?parseInt(mn[1],10):0); }

function parseCards(html){
  var chunks = html.split('data-broadcast-id="TvProgram_').slice(1);
  var out = [];
  for (var i = 0; i < chunks.length; i++) {
    var p = chunks[i];
    var time = (/mainBroadcastCard-startingHour"[^>]*>\s*([^<]+?)\s*</.exec(p)||[])[1];
    var title = (/mainBroadcastCard-title">\s*<a[^>]*?title="([^"]*)"/.exec(p)||[])[1];
    var sub = (/mainBroadcastCard-subtitle">\s*([^<]*?)\s*</.exec(p)||[])[1];
    var fmt = (/mainBroadcastCard-format">\s*([^<]*?)\s*</.exec(p)||[])[1];
    var dur = (/mainBroadcastCard-durationContent">\s*([^<]*?)\s*</.exec(p)||[])[1];
    if (!title || !time || !/^\d\dh\d\d$/.test(time)) continue;
    out.push({ time: time, title: dec(title).trim(), sub: dec((sub||'').replace(/\s+/g,' ').trim()), fmt: dec((fmt||'').trim()),
      dur: (dur||'').trim(), live: /mainBroadcastCard-live/.test(p), inedit: /Inedit|Inédit/.test(p.slice(0,5000)), rebroadcast: /mainBroadcastCard-rebroadcast/.test(p) });
  }
  return out;
}

function primeOf(items){
  var win = items.filter(function(i){
    var t = toMin(i.time);
    return t >= 20*60 && t <= 21*60+30 && !(/journal|meteo|météo|^jt\b/i.test(i.title) && durMin(i.dur) <= 60);
  });
  if (!win.length) return items[0];
  win.sort(function(a,b){ return (durMin(b.dur)-durMin(a.dur)) || (toMin(b.time)-toMin(a.time)); });
  return win[0];
}

function genreChip(g){ var c = GENRE[g] || GENRE['Autre']; return '<span class="chip" style="background:' + c.bg + ';color:' + c.fg + '">' + esc(g||'Autre') + '</span>'; }
function logoImg(slug, b64, size){ return '<img class="' + (ON_DARK.has(slug) ? 'logo ondark' : 'logo') + '" src="data:image/png;base64,' + b64 + '" alt="Logo">'; }

async function ensureLogo(slug, url){
  var f = path.join(LOGO_DIR, slug + '.png');
  if (!fs.existsSync(f)) {
    try {
      var res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) { var buf = Buffer.from(await res.arrayBuffer()); fs.writeFileSync(f, buf); log('logo téléchargé :', slug); }
    } catch (e) { log('logo KO:', slug, e.message); }
  }
  return fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : '';
}

function buildHtml(ctx){
  var H = [];
  H.push('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
  H.push('<title>Programme TV — ' + esc(ctx.dateFr) + ' (soirée)</title><style>');
  H.push(CSS);
  H.push('</style></head><body><div class="wrap">');
  H.push('<header class="hero"><h1>📺 Programme TV — ce soir, ' + esc(ctx.dateFr) + '</h1>');
  H.push('<p>Toutes les chaînes françaises, de 19h30 à la fin de soirée — horaires France métropolitaine.</p>');
  H.push('<p><span class="pill">Source : programme-tv.net (Tele-Loisirs)</span><span class="pill">Genere le ' + esc(ctx.generatedAt) + '</span><span class="pill">' + ctx.count + ' chaines</span></p></header>');
  H.push('<h2 class="section"><span class="bar"></span>Les primes de la soirée</h2><div class="cards">');
  var ci = 0;
  ctx.channels.forEach(function(ch){
    var p = primeOf(ctx.data[ch.slug] || []);
    if (!p) return;
    var color = ctx.colors[ci++ % ctx.colors.length];
    var meta = [p.fmt, p.dur].filter(Boolean).join(' - ');
    H.push('<div class="card" style="--accent:' + color + '">' + logoImg(ch.slug, ctx.logos[ch.slug]) + '<div>');
    H.push('<div class="cname">' + esc(ch.name) + '</div><div class="ctime">' + p.time.replace('h',':') + ' - prime</div>');
    H.push('<div class="ctitle">' + esc(p.title) + '</div><div class="csub">' + esc(meta) + (p.sub ? ' - ' + esc(p.sub).slice(0,70) : '') + '</div></div></div>');
  });
  H.push('</div>');
  H.push('<h2 class="section"><span class="bar"></span>Accès rapide</h2><div class="toc">');
  ctx.channels.forEach(function(ch){ H.push('<a href="#ch-' + ch.slug + '">' + esc(ch.name) + '</a>'); });
  H.push('</div>');
  ctx.groups.forEach(function(g){
    H.push('<h2 class="section"><span class="bar"></span>' + esc(g.title) + '</h2>');
    H.push('<table><thead><tr><th style="width:88px">Heure</th><th>Programme</th><th style="width:150px">Genre</th><th style="width:90px">Durée</th><th style="width:150px">Statut</th></tr></thead><tbody>');
    g.chans.forEach(function(ch){
      var items = ctx.data[ch.slug] || [];
      var prime = primeOf(items);
      H.push('<tr class="chan" id="ch-' + ch.slug + '"><td colspan="5"><div class="chwrap"><span class="num">' + esc(ch.num) + '</span>' + logoImg(ch.slug, ctx.logos[ch.slug]) + '<span><span class="cname">' + esc(ch.name) + '</span><br><span class="cnt">' + items.length + ' programmes ce soir' + (prime ? ' - prime a ' + prime.time.replace('h',':') : '') + '</span></span></div></td></tr>');
      items.forEach(function(it){
        var isPrime = prime === it;
        var badges = [];
        if (isPrime) badges.push('<span class="badge b-prime">PRIME</span>');
        if (it.live) badges.push('<span class="badge b-live">DIRECT</span>');
        if (it.inedit) badges.push('<span class="badge b-new">INÉDIT</span>');
        else if (it.rebroadcast) badges.push('<span class="badge b-re">REDIFF.</span>');
        H.push('<tr class="p' + (isPrime ? ' prime' : '') + '"><td class="time">' + it.time.replace('h',':') + '</td>');
        H.push('<td><span class="title' + (isPrime ? ' ptitle' : '') + '">' + esc(it.title) + '</span>' + (it.sub ? '<div class="sub">' + esc(it.sub) + '</div>' : '') + '</td>');
        H.push('<td>' + genreChip(it.fmt) + '</td><td class="dur">' + esc(it.dur || '-') + '</td><td>' + (badges.join(' ') || '<span class="dur">-</span>') + '</td></tr>');
      });
    });
    H.push('</tbody></table>');
  });
  H.push('<div class="legend"><b>Légende :</b> <span class="badge b-prime">PRIME</span> première partie de soirée — <span class="badge b-live">DIRECT</span> en direct — <span class="badge b-new">INÉDIT</span> inédit — <span class="badge b-re">REDIFF.</span> rediffusion — les pastilles de couleur indiquent le genre du programme.</div>');
  H.push('<footer class="note">Périmètre : les 25 chaînes nationales gratuites de la TNT, plus Canal+, Paris Première, 20 Minutes TV et Canal Partage TNT Île-de-France. Les chaînes du câble, du satellite, du streaming et les chaînes régionales ne sont pas couvertes. Grilles relevées sur programme-tv.net (Télé-Loisirs) ; horaires et programmes susceptibles de modifications de dernière minute. Document généré automatiquement le ' + esc(ctx.generatedAt) + '.</footer>');
  H.push('</div></body></html>');
  return H.join('\n');
}

const CSS = `:root{--ink:#111827;--muted:#6b7280;--line:#e5e7eb}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",Inter,system-ui,-apple-system,Roboto,Arial,sans-serif;color:var(--ink);
 background:linear-gradient(160deg,#eef2ff 0%,#f8fafc 35%,#fff7ed 100%);padding:28px 18px 60px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{max-width:1220px;margin:0 auto}
header.hero{background:linear-gradient(120deg,#1e1b4b 0%,#4338ca 45%,#0ea5e9 100%);color:#fff;border-radius:22px;padding:28px 32px;box-shadow:0 18px 40px rgba(30,27,75,.28);position:relative;overflow:hidden}
header.hero:after{content:"";position:absolute;right:-60px;top:-60px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.28),rgba(255,255,255,0) 70%)}
header.hero h1{margin:0 0 6px;font-size:30px}
header.hero p{margin:2px 0;opacity:.94;font-size:14.5px}
.pill{display:inline-block;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);padding:4px 12px;border-radius:999px;font-size:12.5px;margin-right:8px;margin-top:10px}
h2.section{margin:34px 0 14px;font-size:20px;display:flex;align-items:center;gap:10px}
h2.section span.bar{display:inline-block;width:6px;height:22px;border-radius:4px;background:linear-gradient(#4338ca,#0ea5e9)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.card{background:#fff;border-radius:16px;padding:14px 15px;box-shadow:0 6px 18px rgba(15,23,42,.10);border-top:5px solid var(--accent);display:flex;gap:12px;align-items:flex-start}
.card img{width:46px;height:46px}
.card .cname{font-weight:700;font-size:13.5px;margin-bottom:2px}
.card .ctime{font-size:12px;color:var(--accent);font-weight:700}
.card .ctitle{font-size:13.5px;font-weight:600;line-height:1.25;margin-top:2px}
.card .csub{font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.3}
.toc{background:#fff;border-radius:16px;padding:14px 16px;box-shadow:0 6px 18px rgba(15,23,42,.08);display:flex;flex-wrap:wrap;gap:8px}
.toc a{text-decoration:none;font-size:12.5px;color:#3730a3;background:#eef2ff;border:1px solid #e0e7ff;padding:5px 10px;border-radius:999px}
table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.10);font-size:13.5px}
thead th{position:sticky;top:0;background:#111827;color:#fff;text-align:left;padding:11px 12px;font-size:12.5px;text-transform:uppercase;z-index:5}
tbody tr.chan td{background:linear-gradient(90deg,#eef2ff,#ffffff);border-top:2px solid #c7d2fe;padding:12px}
tbody tr.chan .chwrap{display:flex;align-items:center;gap:12px}
tbody tr.chan .num{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:8px;background:#4338ca;color:#fff;font-weight:700;font-size:12.5px;padding:0 6px}
tbody tr.chan .cname{font-weight:800;font-size:16px}
tbody tr.chan .cnt{font-size:12px;color:var(--muted)}
td{padding:9px 12px;border-top:1px solid #f1f5f9;vertical-align:top}
tr.prime td{background:linear-gradient(90deg,#fff7e0,#fffdf6)!important;box-shadow:inset 4px 0 0 #f59e0b}
tr.prime .ptitle{font-weight:800}
.time{font-weight:700;color:#1f2937;white-space:nowrap}
.title{font-weight:600}
.sub{color:var(--muted);font-size:12px;margin-top:2px;line-height:1.3}
.chip{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:800;margin-left:6px}
.b-live{background:#fee2e2;color:#b91c1c}.b-new{background:#ede9fe;color:#6d28d9}.b-prime{background:#f59e0b;color:#fff}.b-re{background:#f1f5f9;color:#475569}
.dur{color:var(--muted);white-space:nowrap;font-size:12.5px}
.legend{background:#fff;border-radius:16px;padding:14px 18px;box-shadow:0 6px 18px rgba(15,23,42,.08);font-size:13px;color:#374151;margin-top:22px}
footer.note{margin-top:22px;padding:16px 18px;background:#111827;color:#e5e7eb;border-radius:16px;font-size:12.5px;line-height:1.55}
img.logo{background:#fff;border:1px solid var(--line);border-radius:12px;padding:4px;object-fit:contain;box-shadow:0 2px 6px rgba(15,23,42,.08)}
img.logo.ondark{background:#1f2937;border-color:#334155}
tr.chan{break-inside:avoid}tr.p{break-inside:avoid}thead{display:table-header-group}
@media print{body{background:#fff;padding:0}.card,table{box-shadow:none}.toc{display:none}}`;

// ---------- Notifications (WhatsApp via CallMeBot, Twilio ou webhook) ----------
function loadNotifConfig(){
  var f = path.join(HERE, 'notifications.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { log('notifications.json illisible : ' + e.message); return null; }
}

function buildNotifMessage(cfg, ctx){
  var tpl = (cfg && cfg.message) ? cfg.message : 'Le nouveau programme TV du soir est pret.';
  return tpl.split('{date}').join(ctx.dateFr).split('{primes}').join(ctx.primes).split('{lien}').join(ctx.lien);
}

async function sendNotification(cfg, text){
  if (!cfg || !cfg.enabled) { log('Notification : aucune configuration active (outils/notifications.json).'); return false; }
  var listes = (Array.isArray(cfg.channels) && cfg.channels.length) ? cfg.channels : [cfg];
  var auMoinsUn = false;
  for (var k = 0; k < listes.length; k++) {
    var fusion = Object.assign({}, cfg, listes[k]);
    var okUn = await sendOne(fusion, text);
    auMoinsUn = auMoinsUn || okUn;
  }
  return auMoinsUn;
}

async function sendOne(cfg, text){
  try {
    if (cfg.provider === 'callmebot') {
      var c = cfg.callmebot || {};
      if (!c.phone || !c.apikey) { log('Notification CallMeBot : phone/apikey manquant.'); return false; }
      var url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(c.phone) + '&text=' + encodeURIComponent(text) + '&apikey=' + encodeURIComponent(c.apikey);
      var r = await fetch(url);
      var body = await r.text();
      log('Notification CallMeBot : HTTP ' + r.status + ' - ' + body.replace(/\s+/g, ' ').slice(0, 140));
      return r.ok;
    }
    if (cfg.provider === 'twilio') {
      var t = cfg.twilio || {};
      if (!t.accountSid || !t.authToken || !t.from || !t.to) { log('Notification Twilio : parametres manquants.'); return false; }
      var auth = Buffer.from(t.accountSid + ':' + t.authToken).toString('base64');
      var params = new URLSearchParams({ From: t.from, To: t.to, Body: text });
      var r2 = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + t.accountSid + '/Messages.json', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });
      log('Notification Twilio : HTTP ' + r2.status);
      return r2.ok;
    }
    if (cfg.provider === 'telegram') {
      var g = cfg.telegram || {};
      if (!g.botToken || !g.chatId) { log('Notification Telegram : botToken/chatId manquant.'); return false; }
      var r4 = await fetch('https://api.telegram.org/bot' + g.botToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: g.chatId, text: text, disable_web_page_preview: true })
      });
      var j4 = await r4.json().catch(function(){ return {}; });
      log('Notification Telegram : HTTP ' + r4.status + ' - ' + JSON.stringify(j4).slice(0, 140));
      // on joint aussi le PDF du guide, ouvrable d un simple tap dans Telegram
      try {
        var pdfGuide = path.join(OUT_DIR, 'programme-tv-du-jour.pdf');
        if (r4.ok && fs.existsSync(pdfGuide)) {
          var fd = new FormData();
          fd.append('chat_id', String(g.chatId));
          fd.append('caption', '📄 Le guide complet de ce soir (PDF) - ouvrez-le d un tap');
          fd.append('document', new Blob([fs.readFileSync(pdfGuide)], { type: 'application/pdf' }), 'programme-tv-du-jour.pdf');
          var r5 = await fetch('https://api.telegram.org/bot' + g.botToken + '/sendDocument', { method: 'POST', body: fd });
          log('Notification Telegram (PDF joint) : HTTP ' + r5.status);
        }
      } catch (e5) { log('Joint PDF Telegram impossible : ' + e5.message); }
      return r4.ok;
    }
    if (cfg.provider === 'webhook') {
      var w = cfg.webhook || {};
      if (!w.url) { log('Notification webhook : url manquante.'); return false; }
      var r3 = await fetch(w.url, { method: w.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, message: text }) });
      log('Notification webhook : HTTP ' + r3.status);
      return r3.ok;
    }
    log('Notification : fournisseur inconnu "' + cfg.provider + '".');
  } catch (e) { log('Notification en erreur : ' + e.message); }
  return false;
}

async function main(){
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  var now = new Date();
  var dateFr = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  var iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  var generatedAt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(now);
  if (process.argv.indexOf('--test-message') !== -1) {
    var cfgT = loadNotifConfig();
    var msgT = cfgT && cfgT.message ? buildNotifMessage(cfgT, { dateFr: dateFr, primes: '(test)', lien: 'programmes-tv/programme-tv-du-jour.html' }) : 'Test de notification programme TV (' + dateFr + ')';
    var okT = await sendNotification(cfgT, msgT);
    log(okT ? 'Test de notification : OK' : 'Test de notification : ECHEC');
    return;
  }

  log('Génération du programme TV pour ' + dateFr + ' (fichier ' + iso + ')');

  // 1) decouverte eventuelle de nouvelles chaines
  var channels = CHANNELS.slice();
  try {
    var dirHtml = await fetchText(SITE + '/programme/toutes-les-chaines/');
    var found = {};
    var re = /href="\/programme\/chaine\/(programme-[^"]+?)\.html"/g, m;
    while ((m = re.exec(dirHtml))) { var s = m[1].replace(/^programme-/, ''); found[s] = true; }
    Object.keys(found).forEach(function(s){
      if (!channels.some(function(c){ return c.slug === s; })) {
        var nm = s.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b([a-z])/g, function(x){ return x.toUpperCase(); });
        channels.push({ slug: s, name: nm, num: '*', group: 'pay' });
        log('nouvelle chaîne détectée :', nm, '(' + s + ')');
      }
    });
  } catch (e) { log('découverte des chaînes KO (liste figée utilisée) :', e.message); }

  // 2) recuperation des grilles + logos
  var data = {}, logos = {};
  for (var i = 0; i < channels.length; i++) {
    var ch = channels[i];
    var url = SITE + '/programme/chaine/programme-' + ch.slug + '.html';
    try {
      var html = await fetchText(url);
      var items = parseCards(html).filter(function(x){ return toMin(x.time) >= 19*60+30; });
      data[ch.slug] = items;
      var lm = (/https:\/\/www\.programme-tv\.net\/imgre\/fit\/~2~channel~[^"'\s]+/.exec(html)||[])[0];
      if (lm) {
        var logoUrl = lm.split(')')[0].replace(/\/(\d+)x(\d+)\//, '/120x120/');
        logos[ch.slug] = await ensureLogo(ch.slug, logoUrl);
      }
      log(ch.name + ': ' + items.length + ' programmes ce soir' + (items.length ? '' : ' (aucune donnee)'));
    } catch (e) {
      log(ch.name + ': ERREUR ' + e.message);
      data[ch.slug] = data[ch.slug] || [];
    }
    await sleep(250);
  }

  // 3) construction du document
  var groups = [
    { title: 'Chaînes nationales gratuites de la TNT (canaux 1 à 25)', chans: channels.filter(function(c){ return c.group === 'tnt'; }) },
    { title: 'Chaînes payantes et complémentaires', chans: channels.filter(function(c){ return c.group !== 'tnt'; }) }
  ].filter(function(g){ return g.chans.length; });

  var html = buildHtml({ dateFr: dateFr, iso: iso, generatedAt: generatedAt, channels: channels, groups: groups, data: data, logos: logos,
    count: channels.filter(function(c){ return (data[c.slug]||[]).length; }).length,
    colors: ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#3b82f6'] });

  var htmlDay = path.join(OUT_DIR, 'programme-tv-' + iso + '.html');
  var htmlLatest = path.join(OUT_DIR, 'programme-tv-du-jour.html');
  fs.writeFileSync(htmlDay, html, 'utf8');
  fs.writeFileSync(htmlLatest, html, 'utf8');
  log('HTML écrit : ' + htmlDay + ' (' + Math.round(html.length/1024) + ' Ko)');

  // 4) PDF (facultatif, navigateur headless)
  var browser = findBrowser();
  if (browser) {
    try {
      var pdfDay = path.join(OUT_DIR, 'programme-tv-' + iso + '.pdf');
      execFileSync(browser, ['--headless=new','--disable-gpu','--no-pdf-header-footer','--virtual-time-budget=8000','--print-to-pdf=' + pdfDay, pathToFileURL(htmlDay).href], { stdio: 'ignore' });
      fs.copyFileSync(pdfDay, path.join(OUT_DIR, 'programme-tv-du-jour.pdf'));
      log('PDF écrit : ' + pdfDay);
    } catch (e) { log('PDF KO : ' + e.message); }
  } else { log('Aucun navigateur headless trouvé : PDF non généré (HTML disponible)'); }

  // 4b) notification (WhatsApp / webhook) apres generation reussie
  var topPrimes = channels.filter(function(c){ return c.group === 'tnt'; }).slice(0, 5).map(function(c){
    var p = primeOf(data[c.slug] || []);
    return p ? (c.name + ' ' + p.time.replace('h', ':') + ' - ' + p.title) : null;
  }).filter(Boolean).join(' | ');
  var notifCfg = loadNotifConfig();
  await sendNotification(notifCfg, buildNotifMessage(notifCfg || {}, {
    dateFr: dateFr,
    primes: topPrimes,
    lien: (notifCfg && notifCfg.lien) ? notifCfg.lien : ''
  }));

  // 5) nettoyage des archives de plus de KEEP_DAYS jours
  try {
    var limit = Date.now() - KEEP_DAYS*24*3600*1000;
    fs.readdirSync(OUT_DIR).forEach(function(f){
      if (!/^programme-tv-\d{4}-\d{2}-\d{2}\.(html|pdf)$/.test(f)) return;
      var p = path.join(OUT_DIR, f);
      if (fs.statSync(p).mtimeMs < limit) { fs.unlinkSync(p); log('archive supprimée : ' + f); }
    });
  } catch (e) { log('nettoyage KO : ' + e.message); }

  log('Terminé.');
}

main().catch(function(e){
  var msg = 'ERREUR FATALE ' + (e && e.stack ? e.stack : String(e));
  try { fs.appendFileSync(path.join(OUT_DIR, 'log.txt'), msg + '\n'); } catch (_) {}
  console.error(msg);
  process.exit(1);
});
