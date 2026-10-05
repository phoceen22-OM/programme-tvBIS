/**
 * Envoie un message WhatsApp (ou Telegram/webhook selon notifications.json).
 * Usage : node outils/envoyer-message.mjs "Votre texte"
 *         node outils/envoyer-message.mjs            (demande le texte)
 *         node outils/envoyer-message.mjs --dry-run "texte"   (test sans envoi)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG = path.join(HERE, 'notifications.json');

async function envoyerTout(cfg, texte){
  const listes = (Array.isArray(cfg.channels) && cfg.channels.length) ? cfg.channels : [cfg];
  const res = [];
  for (const item of listes) {
    const fusion = Object.assign({}, cfg, item);
    const r = await envoyer(fusion, texte);
    res.push(fusion.provider + ' : ' + r.info + (r.ok ? '  [OK]' : '  [ECHEC]'));
  }
  return res;
}

async function envoyer(cfg, texte){
  if (cfg.provider === 'callmebot') {
    const c = cfg.callmebot;
    const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(c.phone) + '&text=' + encodeURIComponent(texte) + '&apikey=' + encodeURIComponent(c.apikey);
    const r = await fetch(url); const b = await r.text();
    return { ok: r.ok && !/ERROR/i.test(b), info: 'HTTP ' + r.status + ' -> ' + b.replace(/\s+/g, ' ').slice(0, 160) };
  }
  if (cfg.provider === 'telegram') {
    const t = cfg.telegram;
    const r = await fetch('https://api.telegram.org/bot' + t.botToken + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: t.chatId, text: texte, disable_web_page_preview: true })
    });
    const b = await r.text();
    return { ok: r.ok, info: 'HTTP ' + r.status + ' -> ' + b.replace(/\s+/g, ' ').slice(0, 160) };
  }
  if (cfg.provider === 'twilio') {
    const t = cfg.twilio;
    const auth = Buffer.from(t.accountSid + ':' + t.authToken).toString('base64');
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + t.accountSid + '/Messages.json', {
      method: 'POST', headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: t.from, To: t.to, Body: texte })
    });
    const b = await r.text();
    return { ok: r.ok, info: 'HTTP ' + r.status + ' -> ' + b.replace(/\s+/g, ' ').slice(0, 160) };
  }
  if (cfg.provider === 'webhook') {
    const w = cfg.webhook;
    const r = await fetch(w.url, { method: w.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texte, message: texte }) });
    return { ok: r.ok, info: 'HTTP ' + r.status };
  }
  return { ok: false, info: 'service inconnu : ' + cfg.provider };
}

async function main(){
  const a = process.argv.slice(2);
  const dryRun = a.indexOf('--dry-run') !== -1;
  let texte = a.filter(function(x){ return x !== '--dry-run'; }).join(' ').trim();

  if (!fs.existsSync(CFG)) { console.log('Aucune configuration. Lancez d abord "Notifications Programme TV (reglages)".'); return; }
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));

  if (!texte) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    texte = (await rl.question('Votre message : ')).trim();
    rl.close();
  }
  if (!texte) { console.log('Message vide : rien envoye.'); return; }

  console.log('');
  console.log('Service  : ' + cfg.provider + (dryRun ? '  [MODE TEST : aucun envoi]' : ''));
  console.log('Message  : ' + texte);
  if (dryRun) { console.log(''); console.log('Mode test : le message n a pas ete envoye.'); return; }

  const lignes = await envoyerTout(cfg, texte);
  console.log('');
  for (const l of lignes) console.log('Reponse  : ' + l);
  console.log(lignes.some(function(l){ return l.indexOf('[OK]') !== -1; }) ? 'MESSAGE ENVOYE.' : 'ECHEC de l envoi : verifiez la configuration.');
}

main().catch(function(e){ console.error(e); process.exit(1); });
