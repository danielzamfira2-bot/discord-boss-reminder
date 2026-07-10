# Discord Boss Reminder

Bot Discord care trimite automat, in fiecare ora:

- la minutul `xx:55`: `@everyone Bosii vor aparea in urmatoarele 5 minute`
- la minutul `xx:59`: `@everyone Bosii vor aparea intr-un minut!`

## Configurare bot Discord

1. Intra in Discord Developer Portal si creeaza o aplicatie noua.
2. Creeaza un bot pentru aplicatie si copiaza tokenul.
3. Invita botul pe server cu permisiunile:
   - `Send Messages`
   - `Mention Everyone`
   - `View Channels`
4. Activeaza permisiunea `Mention @everyone, @here, and All Roles` si in canalul unde vrei mesajele.
5. Copiaza ID-ul canalului Discord:
   - Discord Settings > Advanced > Developer Mode: ON
   - click dreapta pe canal > Copy Channel ID

## Rulare locala

Instaleaza dependentele:

```bash
npm install
```

Seteaza variabilele de mediu:

```bash
DISCORD_TOKEN=tokenul_botului_tau
DISCORD_CHANNEL_ID=id-ul_canalului
```

Porneste botul:

```bash
npm start
```

## Hostare pe Railway

1. Urca acest proiect pe GitHub.
2. In Railway, creeaza un proiect nou din repository-ul GitHub.
3. La Variables adauga:
   - `DISCORD_TOKEN`
   - `DISCORD_CHANNEL_ID`
4. Railway va rula automat comanda:

```bash
npm start
```

Botul trebuie sa ramana pornit permanent. Railway il va tine online cat timp proiectul este activ.
