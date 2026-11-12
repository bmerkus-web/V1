# Watt Blitz ⚡

Arcade-racen op je fietstrainer. Je trappers zijn het gaspedaal, je Sterzo is het stuur, en onderweg pak je power-ups om je vrienden (of bots) dwars te zitten.

Het is een web-app zonder installatie: hij draait in **Chrome op een Android-tablet of op een Mac** en praat via Bluetooth rechtstreeks met je trainer.

## Wat zit erin

- **Trainer als gaspedaal** – Wahoo KICKR Core (en elke andere trainer met FTMS of Cycling Power). De trainer voelt klimmetjes, en wordt even zwaarder als je geraakt wordt.
- **Echt sturen** met de Elite Sterzo Smart. Zonder Sterzo: pijltjestoetsen of knoppen op het scherm.
- **6 power-ups** – Turbo, Schild, Vuurpijl, Lijmklodder, Magneet en Tegenwind. Wie achteraan rijdt krijgt de sterkste.
- **Boutjes, turbostroken, slipstream en raketstart.**
- **3 banen** – Neon Polder (vlak), Vulkaanpas (lange klim) en Kosmodroom (bochtig, steile muur).
- **Solo** – tot 5 bots op vier niveaus, PR's voor sprints, klimmen, rondes en races, een spook van je beste race, vermogensrecords (5 s / 1 min / 5 min) en levels.
- **Multiplayer** – tot 6 renners via een kamercode van 4 letters; lege plekken vul je met bots.
- **Eerlijke modus** – vermogen telt t.o.v. ieders FTP, zodat verschillende niveaus samen kunnen racen.

## Spelen

1. Open de app in Chrome (zie *Online zetten* hieronder).
2. Vul je naam en FTP in.
3. Tik op **Trainer** en kies je KICKR. Tik op **Sterzo-stuur** en kies je Sterzo. Zet het stuur recht en druk op **C**.
4. Kies **Solo race**, of **Kamer maken** en deel de code met je vrienden (zij kiezen **Meedoen**).

| Toets | Actie |
|---|---|
| Spatie / Enter / 1 | Power-up gebruiken (of tik op het vakje) |
| ← → of A D | Sturen (zonder Sterzo) |
| B | Bel |
| C | Sterzo recht zetten |
| M | Muziek aan/uit |
| F | Volledig scherm |
| Esc / P | Pauze |

Zonder trainer start het spel in **demo-modus**: ↑ = trappen, Shift = sprinten. Demo-tijden worden apart van je echte records bewaard.

## Online zetten

Bluetooth in de browser werkt alleen via **https** (of `localhost`). De makkelijkste manier is GitHub Pages:

1. Zet deze code op de `main`-branch.
2. Ga op GitHub naar **Settings → Pages**, kies *Deploy from a branch*, branch `main`, map `/ (root)`.
3. Na een minuutje staat het spel op `https://<gebruikersnaam>.github.io/<repo>/`. Op de tablet kun je het via het Chrome-menu *Toevoegen aan startscherm* als app installeren.

Lokaal op een Mac proberen kan ook: `npm start` en open `http://localhost:8080`.

## Goed om te weten

- **Niet in Safari of op iPad/iPhone**: Apple ondersteunt Web Bluetooth niet. Gebruik Chrome (of Edge) op Android, Mac, Windows of ChromeOS.
- Sluit andere apps die met je trainer verbonden zijn (Zwift, Wahoo-app); een KICKR Core laat maar een beperkt aantal Bluetooth-verbindingen toe.
- Multiplayer loopt rechtstreeks tussen de spelers (WebRTC). Het vinden van elkaar gaat via de gratis openbare PeerJS-server; op sommige strenge (bedrijfs)netwerken lukt verbinden niet.
- Records staan in de browser van het apparaat waarop je speelt.

## Voor ontwikkelaars

Geen build-stap: gewoon HTML, CSS en ES-modules.

```
index.html, styles.css   schermen en HUD
js/main.js               menu's, lobby, hoofdlus
js/game.js               race-logica, items, bots, PR's, netwerksync
js/render.js, sprites.js pseudo-3D weergave op canvas
js/track.js              de banen
js/physics.js            watt -> snelheid
js/ble.js                KICKR (FTMS/CPS) en Sterzo
js/net.js                kamers via PeerJS
tests/                   `npm test`
```

Meerdere spelers testen op één computer: open `http://localhost:8080/?net=local` in een paar tabbladen.

Gebruikt [PeerJS](https://peerjs.com) (MIT) en de Sterzo-codetabel uit [pycycling](https://github.com/zacharyedwardbull/pycycling) (MIT).
