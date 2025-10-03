# Daimon Backend

Codebase del backend di Daimon, sviluppato in NodeJS e deployato su Hetzner.
Daimon è una piattaforma di gioco di ruolo con collegamenti a molteplici giochi e servizi esterni.

## Website
https://api.daimon.world

## Features

- Pipeline CI/CD costruita su misura con Git, Docker, Docker Compose, Bash e SystemD
- Fetching di dati dinamici da database MariaDB hostato autonomamente
- Logging di tutte le richieste API in entrata e in uscita, e di tutte le richieste DB in uscita
- Autenticazione tramite PassportJS, con supporto per autenticazione proprietaria o tramite Discord o Minecraft
- API REST tramite ExpressJS
- Supporto per MasterBase Website, Daimon Frontend, Daimon Server e Daimon Client
- CRUD compliance per ogni entità (account, gilda, collegamento account ecc.)
- Proxy di richieste per la wiki di lore, hostata su GitHub, tramite bot account dedicato
- (WIP) Proxy di richieste per il feed del sito di MasterBase, tramite API di YouTube e altre piattaforme
- Gestione account e gilde
- Gestione avatar personalizzati
- Gestione leaderboard
- Restituzione di dati relativi ai blocchi per Daimon Client e Daimon Server
- (WIP) Proxy di richieste per account di League of Legends, tramite API di Riot Games

## Installazione

- Clonare la repository tramite `git clone <repository-url>`
- Rinominare `.env.example` in `.env`
- Creare un database MariaDB e popolare le variabili d'ambiente relative
- Generare un valore sicuro per la variabile d'ambiente SESSION_SECRET
- Creare un bot Discord e popolare le variabili d'ambiente relative
- Ottenere una chiave API di YouTube e popolare le variabili d'ambiente relative
- Ottenere una chiave API di Riot Games e popolare la variabile d'ambiente relativa
- Ottenere un token di accesso personale di GitHub e popolare la variabile d'ambiente relativa
- Costruire l'immagine Docker tramite `docker build -t daimon_backend .`
- Eseguire il container tramite `docker run -d --name daimon_backend -p 80:80 daimon_backend`