# Programme TV du soir (automatique)

Chaque jour a 8h et a 18h (heure de Paris), ce depot genere le programme TV de toutes les chaines
francaises : un tableau HTML colore avec les logos des chaines, plus un PDF.

La page est publiee sur GitHub Pages :
    https://<votre-compte>.github.io/<nom-du-depot>/

## Fichiers
- `outils/generer-programme-tv.mjs` : le generateur (Node.js, aucune dependance a installer).
- `.github/workflows/programme-tv.yml` : la tache planifiee GitHub (2 passages par jour).
- `programmes-tv/programme-tv-du-jour.html` / `.pdf` : le guide du jour (mis a jour automatiquement).
- `programmes-tv/logos/` : les logos des chaines (cache).

## Reglages a faire une seule fois
1. Settings -> Actions -> General -> Workflow permissions : Read and write permissions.
2. Settings -> Pages -> Source : GitHub Actions.
3. Onglet Actions -> Programme TV du soir -> Run workflow.

## Notifications (facultatif)
Pour recevoir aussi un message (Telegram/WhatsApp) depuis GitHub, ajoutez un secret
`NOTIFICATIONS_JSON` (Settings -> Secrets and variables -> Actions) contenant le contenu de
votre fichier `outils/notifications.json`. Le fichier local n est jamais publie.

## Lien avec votre PC
Sur le PC, la tache planifiee Windows `ProgrammeTV-quotidien` genere le meme guide
a 8h et 18h dans le dossier `programmes-tv/`.