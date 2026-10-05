/**
 * Assistant Telegram : cree/verifie le bot, trouve automatiquement le chat id,
 * teste l'envoi et ENREGISTRE le canal en plus de ceux deja configures.
 * Usage : node outils/configurer-telegram.mjs [token] [chatid]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG = path.join(HERE, 'notifications.json');

function ligne(){ console.log('-'.repeat(66)); }
function pause(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

async function api(token, methode, params){
  const url = 'https://api.telegram.org/bot' + token + '/' + methode + (params ? '?' + new URLSearchParams(params).toString() : '');
  const r = await fetch(url);
  const j = await r.json().catch(function(){ return {}; });
  return { status: r.status, json: j };
}

async function main(){
  const argv = process.argv.slice(2);
  let token = (argv[0] || '').trim();
  let chatId = (argv[1] || '').trim();

  console.log('');
  console.log('=== Notifications Telegram (programme TV) ===');
  console.log('');
  console.log('Etape 1 : dans Telegram, ouvrez une discussion avec @BotFather');
  console.log('Etape 2 : envoyez-lui  /newbot  puis suivez ses questions');
  console.log('          (nom du bot, puis identifiant terminant par "bot")');
  console.log('Etape 3 : il vous renvoie un TOKEN du type 123456789:AAH...');
  console.log('Etape 4 : ouvrez la discussion avec VOTRE nouveau bot et envoyez-lui : salut');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async function(q){ return (await rl.question(q)).trim(); };

  const ouvrir = await ask('Voulez-vous que j ouvre Telegram (@BotFather) dans le navigateur ? (o/n) : ');
  if (/^o/i.test(ouvrir)) { exec('start "" "https://t.me/BotFather"'); console.log('-> ouverture de Telegram...'); }

  if (!token) token = await ask('Collez ici le TOKEN donne par BotFather : ');
  if (!token) { console.log('Aucun token : abandon.'); rl.close(); return; }

  const me = await api(token, 'getMe');
  if (!me.json || !me.json.ok) { console.log('Token refuse par Telegram : ' + JSON.stringify(me.json).slice(0,160)); rl.close(); return; }
  console.log('Bot reconnu : @' + me.json.result.username + ' (' + me.json.result.first_name + ')');

  if (!chatId) {
    console.log('Recherche de votre discussion avec le bot...');
    for (let i = 0; i < 12 && !chatId; i++) {
      const up = await api(token, 'getUpdates', { timeout: 0 });
      const res = (up.json && up.json.result) || [];
      for (const u of res) {
        const c = u.message && u.message.chat;
        if (c && c.id) { chatId = String(c.id); console.log('Discussion trouvee : ' + (c.first_name || c.title || '') + ' (chat id ' + chatId + ')'); break; }
      }
      if (!chatId) await pause(5000);
    }
  }
  if (!chatId) {
    console.log('');
    console.log('Je n ai pas trouve votre discussion. Verifiez que vous avez bien envoye "salut"');
    console.log('a votre bot, puis relancez cet assistant. (Vous pouvez aussi saisir le chat id a la main.)');
    rl.close(); return;
  }
  rl.close();

  const envoi = await api(token, 'sendMessage', { chat_id: chatId, text: '✅ Telegram est connecte : vous recevrez le programme TV chaque jour a 8h et 18h.' });
  console.log('Test d envoi : HTTP ' + envoi.status + ' -> ' + JSON.stringify(envoi.json).slice(0, 140));
  if (!envoi.json || !envoi.json.ok) { console.log('Envoi impossible : verifiez le chat id.'); return; }

  // enregistrement : on conserve les canaux deja configures
  let cfg = { enabled: true, message: '📺 Le nouveau programme TV du soir est prêt ({date}) ! Primes : {primes}', channels: [] };
  if (fs.existsSync(CFG)) {
    const ancien = JSON.parse(fs.readFileSync(CFG, 'utf8'));
    cfg = ancien;
    cfg.enabled = true;
    if (!Array.isArray(cfg.channels) || !cfg.channels.length) {
      cfg.channels = [{ provider: ancien.provider, callmebot: ancien.callmebot, telegram: ancien.telegram, twilio: ancien.twilio, webhook: ancien.webhook }];
    }
  }
  cfg.channels = cfg.channels.filter(function(c){ return c.provider !== 'telegram'; });
  cfg.channels.push({ provider: 'telegram', telegram: { botToken: token, chatId: chatId } });
  fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2), 'utf8');

  console.log('');
  console.log('Enregistre dans : ' + CFG);
  console.log('Canaux actifs : ' + cfg.channels.map(function(c){ return c.provider; }).join(' + '));
  console.log('Telegram est pret : le message de test vient de partir.');
}

main().catch(function(e){ console.error(e); process.exit(1); });
