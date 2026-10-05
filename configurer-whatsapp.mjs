/**
 * Assistant de configuration des notifications (Programme TV).
 * Services : WhatsApp via CallMeBot, Telegram, WhatsApp via Twilio, Webhook/ntfy.
 * Usage : node outils/configurer-whatsapp.mjs                (menu interactif)
 *         node outils/configurer-whatsapp.mjs --telegram <token> <chatId>
 *         node outils/configurer-whatsapp.mjs --callmebot <numero> <apikey>
 *         node outils/configurer-whatsapp.mjs --twilio <sid> <token> <from> <to>
 *         node outils/configurer-whatsapp.mjs --webhook <url>
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG = path.join(HERE, 'notifications.json');
const MESSAGE = '📺 Le nouveau programme TV du soir est prêt ({date}) ! Primes : {primes}';

function ligne(){ console.log('-'.repeat(66)); }

function modeEmploiCallMeBot(){
  console.log('');
  ligne();
  console.log('WhatsApp via CallMeBot (gratuit)');
  ligne();
  console.log('1) Enregistrez ce numero dans vos contacts WhatsApp (obligatoire) :');
  console.log('      +34 644 99 26 98   (nom conseille : CallMeBot)');
  console.log('2) Envoyez-lui exactement ce message :');
  console.log('      I allow callmebot to call me');
  console.log('3) Il vous repond avec une cle API (une suite de chiffres).');
  console.log('');
  console.log('Si le bot ne repond pas : il est souvent sature. Reessayez plus tard,');
  console.log('ou choisissez Telegram (option 2) qui fonctionne immediatement.');
  console.log('');
}

function modeEmploiTelegram(avecIntro){
  if (avecIntro) { console.log(''); ligne(); console.log('Telegram (gratuit, le plus fiable)'); ligne(); }
  console.log('1) Dans Telegram, ouvrez une conversation avec @BotFather');
  console.log('2) Envoyez /newbot, donnez un nom puis un identifiant -> il renvoie un TOKEN');
  console.log('3) Ouvrez la conversation avec votre nouveau bot et envoyez-lui : salut');
  console.log('4) Ouvrez dans un navigateur : https://api.telegram.org/bot<VOTRE_TOKEN>/getUpdates');
  console.log('   et relevez la valeur "chat":{"id": ...} : c est votre CHAT ID');
  console.log('');
}

async function envoyerTest(cfg, texte){
  try {
    if (cfg.provider === 'callmebot') {
      const c = cfg.callmebot;
      const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(c.phone) + '&text=' + encodeURIComponent(texte) + '&apikey=' + encodeURIComponent(c.apikey);
      const r = await fetch(url); const b = await r.text();
      console.log('Reponse CallMeBot : HTTP ' + r.status + ' -> ' + b.replace(/\s+/g, ' ').slice(0, 180));
      return r.ok && !/ERROR/i.test(b);
    }
    if (cfg.provider === 'telegram') {
      const t = cfg.telegram;
      const r = await fetch('https://api.telegram.org/bot' + t.botToken + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: t.chatId, text: texte, disable_web_page_preview: true })
      });
      const j = await r.json().catch(function(){ return {}; });
      console.log('Reponse Telegram : HTTP ' + r.status + ' -> ' + JSON.stringify(j).slice(0, 200));
      return r.ok;
    }
    if (cfg.provider === 'twilio') {
      const t = cfg.twilio;
      const auth = Buffer.from(t.accountSid + ':' + t.authToken).toString('base64');
      const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + t.accountSid + '/Messages.json', {
        method: 'POST', headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: t.from, To: t.to, Body: texte })
      });
      const b = await r.text();
      console.log('Reponse Twilio : HTTP ' + r.status + ' -> ' + b.replace(/\s+/g, ' ').slice(0, 180));
      return r.ok;
    }
    if (cfg.provider === 'webhook' || cfg.provider === 'ntfy') {
      const w = cfg.webhook;
      const r = await fetch(w.url, { method: w.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texte, message: texte }) });
      console.log('Reponse webhook : HTTP ' + r.status);
      return r.ok;
    }
  } catch (e) { console.log('Erreur pendant le test : ' + e.message); }
  return false;
}

// Remet un numero au format international attendu par CallMeBot (+33... pour la France)
function normaliserTelephone(v){
  var t = String(v || '').replace(/[\s.\-()\/]/g, '');
  if (t.indexOf('00') === 0) t = '+' + t.slice(2);
  if (/^0[67]\d{8}$/.test(t)) return '+33' + t.slice(1);
  if (/^[67]\d{8}$/.test(t)) return '+33' + t;
  return t;
}

function normaliserCle(v){ return String(v || '').replace(/[\s.\-]/g, ''); }

function baseConfig(){
  return {
    enabled: true,
    provider: '',
    message: MESSAGE,
    callmebot: { phone: '', apikey: '' },
    telegram: { botToken: '', chatId: '' },
    twilio: { accountSid: '', authToken: '', from: 'whatsapp:+14155238886', to: '' },
    webhook: { url: '', method: 'POST' }
  };
}

async function main(){
  const a = process.argv.slice(2);
  let cfg = null;
  let textePerso = null;

  if (a[0] === '--callmebot' && a[1] && a[2]) { cfg = baseConfig(); cfg.provider = 'callmebot'; cfg.callmebot = { phone: normaliserTelephone(a[1]), apikey: normaliserCle(a[2]) }; }
  else if (a[0] === '--telegram' && a[1] && a[2]) { cfg = baseConfig(); cfg.provider = 'telegram'; cfg.telegram = { botToken: a[1], chatId: a[2] }; }
  else if (a[0] === '--twilio' && a[1] && a[2] && a[3] && a[4]) { cfg = baseConfig(); cfg.provider = 'twilio'; cfg.twilio = { accountSid: a[1], authToken: a[2], from: a[3], to: a[4] }; }
  else if (a[0] === '--webhook' && a[1]) { cfg = baseConfig(); cfg.provider = 'webhook'; cfg.webhook = { url: a[1], method: 'POST' }; }
  else if (a[0] === '--test') { cfg = fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG, 'utf8')) : null; }
  else if (a[0] === '--message' && a[1]) {
    cfg = fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG, 'utf8')) : null;
    if (!cfg) { console.log('Aucune configuration : lancez d abord l assistant sans argument.'); process.exit(1); }
    textePerso = a.slice(1).join(' ');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async function(q, defaut){ const v = (await rl.question(q)).trim(); return v || defaut || ''; };

  if (!cfg) {
    console.log('');
    console.log('=== Notifications du programme TV : quel service ? ===');
    console.log('  1) WhatsApp via CallMeBot   (gratuit, mais bot souvent sature)');
    console.log('  2) Telegram                 (gratuit et immediat - recommande si WhatsApp ne repond pas)');
    console.log('  3) WhatsApp via Twilio      (compte Twilio payant)');
    console.log('  4) Webhook / ntfy           (avance)');
    console.log('  5) AJOUTER Telegram EN PLUS du service deja configure');
    const choix = (await ask('Votre choix [1] : ', '1'));
    cfg = baseConfig();
    if (choix === '2') {
      modeEmploiTelegram(true);
      cfg.provider = 'telegram';
      cfg.telegram = { botToken: await ask('Token du bot Telegram : '), chatId: await ask('Chat ID (chiffres, ex. 123456789) : ') };
    } else if (choix === '3') {
      ligne(); console.log('WhatsApp via Twilio'); ligne();
      cfg.provider = 'twilio';
      cfg.twilio = {
        accountSid: await ask('Account SID : '),
        authToken: await ask('Auth Token : '),
        from: await ask('Expediteur (ex. whatsapp:+14155238886) : ', 'whatsapp:+14155238886'),
        to: await ask('Destinataire (ex. whatsapp:+33612345678) : ')
      };
    } else if (choix === '5') {
      if (!fs.existsSync(CFG)) { console.log('Configurez d abord un premier service (option 1 ou 2).'); process.exit(1); }
      const existant = JSON.parse(fs.readFileSync(CFG, 'utf8'));
      modeEmploiTelegram(true);
      const tg = { provider: 'telegram', telegram: { botToken: await ask('Token du bot Telegram : '), chatId: await ask('Chat ID (chiffres) : ') } };
      const deja = (Array.isArray(existant.channels) && existant.channels.length) ? existant.channels.slice() : [{ provider: existant.provider, callmebot: existant.callmebot, twilio: existant.twilio, webhook: existant.webhook }];
      deja.push(tg);
      cfg = existant;
      cfg.channels = deja;
      cfg.enabled = true;
    } else if (choix === '4') {
      ligne(); console.log('Webhook / ntfy'); ligne();
      cfg.provider = 'webhook';
      cfg.webhook = { url: await ask('URL du webhook (https://...) : '), method: 'POST' };
    } else {
      modeEmploiCallMeBot();
      cfg.provider = 'callmebot';
      cfg.callmebot = { phone: normaliserTelephone(await ask('Votre numero WhatsApp (ex. 06 12 34 56 78) : ')), apikey: normaliserCle(await ask('Cle API CallMeBot : ')) };
      console.log('Numero utilise : ' + cfg.callmebot.phone);
    }
  }
  rl.close();

  fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2), 'utf8');
  console.log('');
  console.log('Configuration enregistree dans : ' + CFG);
  console.log('(ce fichier reste sur votre PC, il n est jamais publie sur GitHub)');
  console.log('');
  const texteTest = textePerso || 'Test : les notifications du programme TV sont activees (' + cfg.provider + ').';
  const ok = await envoyerTest(cfg, texteTest);
  console.log('');
  console.log(ok ? 'PARFAIT : le message de test est parti. Vous recevrez le programme TV 2 fois par jour.'
                 : 'Le test a echoue : verifiez les informations ci-dessus (ou choisissez un autre service en relancant cet assistant).');
}

main().catch(function(e){ console.error(e); process.exit(1); });
