# Watt Blitz – backlog

Wensen, bugs en ideeën op één plek. Elk punt heeft een nummer (WB-…), zodat je er in een chat naar kunt verwijzen.

**Grootte:** S = een avondje, M = een paar avonden, L = groot project of eerst iets regelen.
**Bron:** wie het vroeg. Namen alleen met voornaam of initiaal.

## Wacht op een test op de fiets

Gebouwd, maar nog niet met echte hardware getest. Eerst terugkoppeling, dan bijstellen.

| # | Wat | Bron | Grootte |
|---|---|---|---|
| WB-01 | Strava toont geen hoogtemeters. Drie testvarianten (TCX met GPS, FIT virtueel met en zonder GPS) uploaden en kijken welke werkt. Wacht op het .tcx-bestand. | zelf | S |
| WB-02 | Click v2 blijft verbonden (elke 50 s opnieuw verbinden). Controleren of Y de hele rit blijft werken; anders het diagnosescherm sturen. | zelf | S |
| WB-03 | Virtueel schakelen op een Zwift Ride. Werkt het, reageert het snel genoeg, en voelt 0,5% per versnelling goed? | maat met Zwift Ride | S |
| WB-04 | Afstellen op gevoel: breedte van de short cut (vooral in de afdaling van de Vulkaanpas), stuurdrempel van de kwak, hoe hard een bocht je naar buiten duwt, extra weerstand in de berm. | zelf | S |
| WB-05 | Multiplayer met 5–6 spelers en via mobiel internet. Werkt het vinden van elkaar en blijft het soepel? | zelf | S |
| WB-06 | Kasseien op de fiets: voelt het hobbelen van de trainer goed, is het gootje te vinden en niet te breed, en hoe vaak rijd je lek? Ook kijken of de tablet niet hapert op de stenen. | zelf | S |
| WB-49 | Workouts uit JOIN en Fondo: beide exporteren .zwo, dat lezen we al. Een echt bestand importeren en kijken of blokken, wattages en namen goed overkomen. | zelf | S |
| WB-07 | iPhone: in Bluefy verbinden met KICKR, Sterzo, Click en hartslagmeter; voelt de helling, werkt ERG, blijft het scherm aan, speelt de muziek? En de telefoonindeling op een echte iPhone (notch, duimknoppen), en sturen met de telefoon vast op het stuur: voelt het goed, welke gevoeligheid, verloopt het midden? En de telefoon als stuur voor de tablet (WB-53): QR scannen, vertraging bij het sturen, blijft de verbinding staan? | zelf | S |

## Volgende

| # | Wat | Bron | Grootte |
|---|---|---|---|
| WB-58 | Bochten met decor: kruispunt met 90-gradenbocht (zijweg, afgesloten weg rechtdoor met dranghekken), rotonde (eiland, zijwegen met hekken), haarspeld met parallelle weg en tegenliggers; horizon die meedraait met de bocht, decor aan de buitenkant snel en binnenkant langzaam; snelheid omlaag in scherpe bochten. Eerst proefanimatie van het kruispunt. | zelf | M |
| WB-57 | Veldritbaan (testbaan Moddermolen staat er; nog te doen): korte rondes op tijd met bel voor de laatste ronde, lint als baanrand, gras/modder (met snel spoor)/zand, balken springen op het goede moment, trap met afstappen en lopen, vliegbrug, materiaalpost met modder op je fiets, Zandkoning-trui; later Modderspat en een kermis-hardstyle Clubsound. In stappen bouwen. | zelf | L |
| WB-10 | Lichte weergave voor oude tablets: minder decor en minder ver vooruit tekenen. | zelf (zorg over oude tablet) | S |
| WB-11 | Bluetooth-presentatieklikker als power-up-knop (PageUp/PageDown en pijltjes koppelen). | idee | S |
| WB-12 | Apparaten onthouden, zodat ze na verversen vanzelf terugkomen zonder keuzelijst (eerst nakijken of Chrome dat toestaat). | idee | M |
| WB-13 | Eigen verbindingsdienst plus hulpserver (TURN) voor multiplayer, zodat het niet afhangt van de gratis PeerJS-dienst en ook op strenge netwerken werkt. | idee | M |
| WB-19 | Chat in de lobby (en misschien snelle emoji's tijdens de race). | Sebas | M |
| WB-54 | Schakelknoppen (− en +) op het scherm bij virtueel schakelen, voor tablet of telefoon zonder toetsenbord, Zwift-knoppen of remote stuur (nu kun je dan niet schakelen). Alleen tonen als er niets anders is om mee te schakelen. | zelf | S |
| WB-51 | Radio: titel en artiest van het nummer dat speelt in beeld (KEXP en FIP hebben openbare gegevens; nakijken of die vanuit de browser bereikbaar zijn). | zelf | S |
| WB-52 | Spotify in de game: afspelen in de game zelf (Web Playback SDK) of de Spotify-app bedienen (Web API), met playlist kiezen, volgende nummer en nu speelt. Kan zonder server (inloggen met PKCE). Beperking: een Spotify-app in ontwikkelmodus mag sinds feb 2026 maar 5 gebruikers hebben (zelf per e-mail toevoegen in het Spotify-dashboard, maker moet Premium hebben); meer kan alleen met goedkeuring van Spotify. Op Android Chrome eerst testen of het afspelen werkt (DRM). Dus alleen voor de eigen groep, niet voor een publieke beta. | zelf | M |
| WB-50 | Workout-game: blitzjes en boxen verdienen door in de zone te rijden (bijv. elke 30 s binnen 5% van je doel een blitzje, een heel blok in de zone een box), in plaats van of naast de boxen op de weg. Twijfel nog. | zelf | S |
| WB-48 | Workouts: medailles en bogen op de weg voor het volgende blok, en een spook van je vorige poging. | zelf | S |
| WB-46 | Sterren van een kasseienstrook laten meetellen (nu alleen een label). Voorstel: 3★ / 4★ / 5★ = 10% / 15% / 20% trager op de stenen, lage / normale / hoge kans op lek, licht / normaal / stevig hobbelen op de trainer, breed / normaal / smal gootje. Eerst WB-06 afwachten. | zelf | S |

## Publieke beta

Uit het plan van 18 november. Volgorde is de voorgestelde volgorde.

| # | Wat | Grootte |
|---|---|---|
| WB-20 | Naam checken bij BOIP en EUIPO; domein en e-mailadres vastleggen. | S |
| WB-21 | Landingspagina met promofilmpje en wachtlijst (aanmelden met bevestigingsmail). | M |
| WB-22 | Accounts: naam, nickname, e-mail en wachtwoord; account- en profielpagina. | M |
| WB-23 | Invites: 5 per account. | S |
| WB-24 | Beta-label en changelog in het spel. | S |
| WB-25 | Klassement en PR's naar de server, met controle op onmogelijke waarden en een meldknop. | M |
| WB-26 | Feature request-formulier en publieke backlog met upvotes. | M |
| WB-27 | Privacyverklaring, voorwaarden (met gezondheidsdisclaimer en minimumleeftijd 16), account verwijderen en gegevens opvragen. | M |
| WB-28 | Spel ververst zichzelf bij een nieuwe versie, zodat iedereen in een kamer dezelfde versie heeft. | S |
| WB-29 | Foutmeldingen opvangen (bijv. Sentry) en een "meld een bug"-knop. | S |
| WB-30 | Rit rechtstreeks naar Strava als Virtuele rit (Strava-app en goedkeuring aanvragen; vraagt de server). | L |
| WB-31 | Donatieknop en founding-member-actie om uit de kosten te komen. | M |

## Ideeën voor later

| # | Wat | Bron | Grootte |
|---|---|---|---|
| WB-40 | Eigen iPhone-app (bijv. met Capacitor, via TestFlight), alleen als Bluefy tegenvalt (zie WB-07). Vraagt een Apple-ontwikkelaarsaccount. | idee | L |
| WB-41 | Promofilmpje in staand formaat voor telefoons, met echte namen. | zelf | S |
| WB-42 | Nieuwe banen. | idee | M |
| WB-43 | Trainingsschema's (blokken op vermogen, ERG-modus). | idee | M |
| WB-44 | Uiterlijk aanpassen: outfits, fietsen, kleuren (zonder snelheidsvoordeel). | idee | M |
| WB-45 | Echte alternatieve routes met eigen bochten (de weg splitst en komt weer samen). Het spel kan nu maar één weg tekenen, dus dit is een flinke verbouwing. | Sebas | L |

## Bekend, maar laten we zo

- Rijden twee spelers op precies hetzelfde moment over dezelfde box, dan krijgen ze hem allebei.
- Tijdens het opnieuw verbinden van de Click v2 reageert de knop ongeveer een seconde niet.

## Gedaan (recent)

- 🌀 Testveldrit Moddermolen op een draaiende vloer (Mode 7): plattegrond met linten, haarspelden en zigzaggen, zand/modder/gras/kasseien/asfalt, plassen, balken, strobalen, boomstam, bandenchicane, trap op een talud en een brug over het parcours (dek boven de vloer, camera gaat mee omhoog) (WB-57, eerste stap)
- 🚧 Obstakels op de weg: verkeerseiland, paaltjes, wegwerkzaamheden (chicane) en drempels op alle drie de banen; erop rijden = berm, drempel = tik op de trainer, bots sturen eromheen; de zon schuift mee in bochten
- ⏱️ Individuele tijdrit: iedereen tegelijk naast elkaar, alle anderen als spoken (geen botsing, kwak of slipstream), eigen boxen en blitzjes per renner, power-ups uit of aan (turbo, scooter, plakbidon zonder jury), geen sprints of truien, eigen PR en PR-spook
- 💨 Slipstream op afstand (vol tot 1 m achter het wiel), extra verder in de rij, klein voordeel voor de kop; scooter rijdt vóór de kop van je rij; plakbidon zonder jury in de tijdrit
- ⏱️ WB-56 Ploegentijdrit: andere ploegen als spoken (geen botsing, kwak of slipstream), elke ploeg in een eigen startstrook en met eigen boxen en blitzjes, ploegtijd = laatste renner, power-ups uit of aan met minder soorten (turbo, magneet naar ploeggenoot, scooter, plakbidon), bots rijden als ploeg (wachten op de laatste, in het wiel), plek van je ploeg in beeld, uitslag en records
- 💪 Bel vervangen door het elleboogje (overnemen!): alleen het gebaar (geen teksten), een bot-ploeggenoot in je wiel neemt de kop over, bots die lang op kop rijden doen het zelf ook; B, ↓/B op de Zwift-knoppen en 💪 op het remote stuur
- 👥 WB-55 Ploegen: 2×2, 2×3 of 3×2 bij een race, zelf kiezen of eerlijk verdelen, bots vullen aan; trui in de ploegkleur met rugnummers (geel voor de leidende ploeg), groene trui en bolletjestrui met mouwen en rand in de ploegkleur; geen kwak en geen last van power-ups van ploeggenoten, extra slipstream achter een ploeggenoot; live ploegenklassement (verschil met de leidende ploeg), ploegenklassement in de uitslag (alle renners opgeteld, uitvaller = laatste + 30 s) en ploegtijden in het klassement
- 📲 WB-53 Remote stuur: je telefoon als stuur voor je tablet of laptop: verbinden met code of QR-code (los van een race-kamer, dus ook in multiplayer), sturen met de gyroscoop, grote power-upknop die laat zien welke power-up je hebt, plus bel, rechtzetten, schakelen of −5%/+5%, volgend nummer en pauze; verbindt vanzelf opnieuw
- 📱 Sturen met je telefoon: telefoon vast op je stuur, de gyroscoop werkt als een Sterzo (zonder kompas, met verloopcorrectie); aan te zetten bij Apparaten, gevoeligheid bij Instellingen, rechtzetten met C of via pauze
- 📱 Telefoonindeling: compacte HUD liggend, TRAP linksonder, sturen en power-up rechtsonder, rekening met de notch, klassement alleen met koploper en je directe concurrenten, draai-hint als je de telefoon rechtop houdt (Zen-workout werkt ook rechtop). Op iPhone/iPad een melding om Bluefy te gebruiken (met link kopiëren); demo-modus werkt in elke browser. Pictogram voor het beginscherm
- 📻 Radio als derde soort muziek: tien zenders met elk een eigen sound, voorkeurszender per baan (Polder FIP Groove, Vulkaanpas FIP Rock, Kosmodroom Intergalactic FM, Zen Nightride Darksynth; de SomaFM-zenders vervangen door Nightride omdat SomaFM de streams weigerde), zappen met de 🎵-knop, automatisch door bij een zender die niet bereikbaar is
- Clubsound: vier nummers (space disco, krautrock, electro à la Justice/Soulwax, techno) met gebakken klanken, licht genoeg voor oude tablets; opbouw met break, aanloop en drop; volgt race en workout; 🎵-knop/T voor het volgende nummer; keuze tussen Clubsound en Arcade 8-bit in de instellingen
- Muziek: eigen sfeer per baan (polder, vulkaan, kosmo) en voor Zen; meer drums en melodie in sprints en klimmen, geratel op de kasseien, sneller in de laatste ronde; in workouts rustig bij herstel en opzwepend in intervallen, met een opbouw bij de 3-2-1; wisselende akkoordenreeksen en melodieën
- Stuurhulp weg uit de instellingen: alleen nog als optie bij workout Ride en solo training; in races, multiplayer en workout Game stuurt iedereen zelf (met een melding als er geen stuur gekoppeld is)
- WB-47 Workout als drieweg-keuze Zen / Ride / Game; Game ook met je maten in een kamer: ieder op zijn eigen FTP, trainer altijd in ERG, race-events raken alleen je snelheid, snelheid volgt je doel, finish na het laatste zware blok, daarna uitrijden en de uitslag
- Workouts: knoppen −5%, +5% en overslaan op het scherm (altijd linksboven), R voor ERG, en een zen-modus: alleen het dashboard op een donkere achtergrond die meekleurt met de zone
- Workouts (solo): ingebouwde workouts en eigen .zwo/.erg/.mrc importeren, ERG op de trainer, scherm met klok en wattages in het midden, 3-2-1 bij elke blokwissel, doel ±5% met de schakelknoppen, blok overslaan, spelmodus met bots en power-ups, nabespreking met medailles per blok en NP/IF/TSS
- Uitslag in stappen: voorlopige uitslag, jurybeslissing (met waarvoor en tegen wie) en definitieve uitslag met stijgers en dalers, segmentwinnaars en eindtruien; het eindscherm blijft staan als de host naar de kamer gaat of vertrekt
- Gouden Kassei voor de snelste kasseientijd: 30 s een antilekband (geen lek, lopend lek meteen weg, berm half zo erg), te zien aan een gekleurde band en een gouden keitje bij de naam
- Kasseien als kleine stenen in perspectief, met neonvoegen in de polder en lava tussen basalt op de vulkaan; de hint "zoek het gootje" is weg
- Kasseienstroken: De Hel van de Polder en de Basaltmuur (smallere weg, gootje, hobbelende trainer, meer lek)
- Korte klap op de trainer bij het raken van de berm
- WB-18 Rubber banding, aan te vinken bij de start (tijden tellen dan niet voor records)
- WB-32/34 Nieuwe power-ups: scooter, plakbidon (met jury), muur en punaises; lekrijden met sealant en wielwissel; jury met tijdstraffen (ook voor kwakken)
- WB-17 Bolletjestrui voor de snelste klimtijd in de race, 5% sneller voor 30 seconden
- WB-14 Berm kost meteen 40%; short cut telt alleen via de oprit
- WB-15 Waarschuwing voor vuurpijl, lijm en tegenwind (met tijd om je schild te pakken)
- WB-16 Groene sprinttrui: 5% sneller voor 30 seconden
- Ritfoto om bij je Strava-rit te zetten
- Gepakte boxen en blitzjes verdwijnen ook bij andere spelers
- Geen automatische terugkwak meer na een kwak
- Zwift-knoppen blijven verbonden, met diagnosescherm
- Virtueel schakelen (Zwift Cog en Ride)
- Klassement, berm voelbaar op de trainer, botsingsstraf, kilometers en hoogtemeters in beeld
- Ronde- en segmentspoken, ronderecords in training
- Trainingsmodus met warming-up, etappes, teleportboog en cooling-down
