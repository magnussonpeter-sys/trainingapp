# UX-förenklingsspec: `/home`, `/preview`, `/run`

## Syfte

Appen ska kunna användas med minimal mental belastning och så få tryck som möjligt.
Standardläget ska vara snabbt och självinstruerande.
Djupare information, analys och justeringar ska finnas, men bara när användaren aktivt väljer att öppna dem.

Detta dokument definierar övergripande produktprinciper och konkret UX-riktning för:
- `/home`
- `/workout/preview`
- `/workout/run`

---

## Produktprinciper

Dessa regler ska styra all vidare UI-utveckling i appen.

### 1. Snabbt först, djupt sen
- Standardvyn ska visa minsta möjliga för att komma vidare.
- Förklaringar, analys, debug och sekundärdata ska ligga bakom tydliga expanders eller sekundära vyer.

### 2. En primär uppgift per skärm
- `/home`: välj förutsättningar och starta
- `/preview`: förstå passet snabbt och gör små justeringar
- `/run`: logga nästa steg utan att tveka

### 3. Ingen informationsvägg
- Långa textblock ska undvikas i primära flöden.
- Kort text ska stödja beslut, inte förklara hela systemet.

### 4. Progression ska kännas, inte läsas
- Status, progression och rekommendationer ska helst uttryckas genom struktur, badges, chips och korta rader.
- Långa resonemang ska vara sekundära.

### 5. Minimal interaktion som standard
- Användaren ska kunna komma från `/home` till träningsstart med få val.
- Under `/run` ska nästa handling alltid vara uppenbar.

### 6. Avancerat läge utan att störa standardflödet
- Debug, AI-data, coach notes, analys och extra justeringar ska finnas kvar.
- Men de får inte visuellt dominera standardskärmen.

### 7. Block är kärnstrukturen
- Alla UI-förändringar ska utgå från `blocks`.
- UI får inte anta en enda blocktyp eller en enda övningstyp.

### 8. Offline-first och sessionsäkerhet går före polish
- Inga UI-refactors får riskera:
  - aktiv workout-session
  - workout-draft
  - local logs
  - pending sync queue

---

## Övergripande informationshierarki

### Primär information
Det användaren måste se direkt för att kunna fortsätta.

### Sekundär information
Sådant som är nyttigt men inte nödvändigt varje gång.

### Tertiär information
Debug, AI-analys, detaljerad coachning, teknisk metadata.

Målet är att varje sida tydligt delar upp detta.

---

# `/home`

## Primärt användarmål
Användaren ska snabbt kunna:
1. välja gym eller kroppsvikt
2. välja passlängd
3. starta AI-pass eller eget pass

## Problem idag
- För mycket dashboard-känsla
- För många informationskort konkurrerar om uppmärksamheten
- Veckoplanering tar för stor plats jämfört med huvuduppgiften

## Ny standardlayout

### Sektion 1: Hero
Visas direkt.

Innehåll:
- hälsning
- kort statusrad
- ev. pending sync om relevant

Ska inte innehålla:
- långa förklaringar
- djup planeringsdata

### Sektion 2: Starta pass
Det viktigaste kortet på sidan.

Direkt synligt:
- gymval
- passlängd
- `AI-pass`
- `Eget pass`

Sekundärt:
- kort rad om nästa rekommendation
  - exempel: `Nästa rekommendation: ben + rygg`

### Sektion 3: Kompakt veckorad
Visas som kort sammanfattning, inte full dashboard.

Direkt synligt:
- antal genomförda pass senaste 7 dagar
- antal planerade pass i optimal rytm
- valda prioriterade muskelgrupper om sådana finns

Knapp:
- `Visa plan & budget`

Bakom expand:
- optimal rytm framåt
- muskelbudget
- fördjupad plan

## Veckoplaneringens nya språk

Veckoplanen ska inte vara kalenderbunden i UI:t.
Användaren ska inte känna att de “missar tisdag”.

Istället används rytm:
- `Pass 1`
- `Återhämtning`
- `Pass 2`
- `Återhämtning`
- `Pass 3`

Varje träningssteg visar:
- block/fokus
- prioriterade muskelgrupper

Exempel:
- `Pass 1` -> `Ben` -> `Framsida lår, säte`
- `Återhämtning`
- `Pass 2` -> `Överkropp` -> `Rygg, bröst`

Kompletterande text:
- `Optimal plan framåt: sikta på 3 pass i valfri rytm. Kör nästa pass när tid och energi finns.`

Det ska alltså vara:
- vägledande
- adaptivt
- icke-dömande

---

# `/preview`

## Primärt användarmål
Användaren ska på 5–10 sekunder förstå:
- vad passet innehåller
- hur långt det är
- om något behöver ändras
- hur man startar

## Problem idag
- För mycket text och för många sekundära detaljer
- För mycket visuellt fokus på analys i stället för handling
- Redigeringsmöjligheter känns starkare än själva passöversikten

## Ny standardlayout

### Sektion 1: Passöversikt
Direkt synligt:
- passnamn
- total tid
- gym
- kort rad om varför passet ser ut som det gör
  - max 1 mening

Exempel:
- `30 min, Testgym`
- `Fokus idag: rygg och ben utifrån veckobudget och ditt mål.`

### Sektion 2: Blocklista
Varje block visas kompakt:
- blocktyp
- titel
- övningar
- sets/reps/tid/vila
- ev. viktförslag

Inte direkt synligt:
- långa coach notes
- AI-rationale
- debug JSON

### Sektion 3: Justeringar
Justeringar ska finnas men vara lågfriktionsmässiga:
- byt övning
- ta bort
- flytta
- ändra blocktyp

Dessa ska vara sekundära kontroller.

### Sektion 4: Visa mer
Bakom tydliga expanders:
- coach notes
- AI-kommentar
- debug
- valideringsdetaljer

## Preview-regler
- Ingen lång introduktionstext
- Inga långa stycken per block som standard
- Minst ett tydligt CTA: `Starta pass`

---

# `/run`

## Primärt användarmål
Användaren ska:
- direkt förstå vad som är nästa övning och nästa set
- kunna logga det snabbt
- inte behöva tolka komplex struktur mitt under träning

## Problem idag
- Run riskerar att kännas för texttungt och för “appigt”
- Struktur och progression mellan block/set kan bli otydlig
- För många sekundära handlingar riskerar att störa

## Ny run-princip
`/run` ska vara som en träningskontrollpanel, inte som en analysvy.

Direkt synligt:
- vad gör jag nu?
- vad kommer sen?
- hur loggar jag detta?

Allt annat ska vara underordnat.

---

## Föreslagen ny blockvisualisering i `/run`

### Grundidé
Visa en tydlig lista över blockets övningar/set där användaren ser:
- aktuell position
- nästa steg
- loop för superset

### För vanliga straight sets
Visas som block med övning och setprogression:

Exempel:

`Knäböj`
`Set 1` -> `Set 2` -> `Set 3`

Aktivt set markeras tydligt.
Klara set markeras som färdiga.
Kommande set är nedtonade.

### För superset
Visas som vanlig lista, men med tydlig loopmarkering:

`[Push-ups] -> [Pull-ups] -> 🔁 tillbaka`
`Badge: Superset x3`
`Subtext: Varv 1/3`

Viktiga regler:
- pilar visas bara mellan items
- ingen cirkulär grafisk layout
- loopen markeras med en enkel återgångsikon eller etikett

## Layoutförslag för `/run`

### Övre del
Kompakt statushuvud:
- blocktitel
- blocktyp
- `Varv 1/3` eller `Set 2/3`
- ev. timerstatus

### Mittdel
Blocksekvensen

Alternativ A:
- vertikal lista med aktiv rad markerad

Alternativ B:
- horisontell scroll för blockets item-sekvens

Rekommendation:
- börja med vertikal lista för robusthet
- horisontell scroll kan testas senare om det verkligen förbättrar snabbheten

### Nedre del
Loggkort för aktuell övning:
- vikt
- reps eller tid
- snabb feedback
- primär knapp: `Spara och nästa`

### Sekundärt
Bakom meny eller expander:
- övningsbeskrivning
- coach note
- justera block
- debug

---

## Autoscroll i `/run`

Ja, detta är genomförbart och rekommenderat.

### Beteende
- när ett set eller en övning markeras klar
- scrollar listan automatiskt så att aktuell rad hålls i centrum eller strax ovan centrum

### Viktigt
- autoscroll får inte kännas hoppig
- den ska ske mjukt och bara när aktuell position faktiskt byts
- användaren ska fortfarande kunna scrolla manuellt utan att UI:t “slåss tillbaka”

### Rekommenderad implementation
- varje blockitem får `ref`
- aktivt item triggar `scrollIntoView({ behavior: "smooth", block: "center" })`
- throttla så att scroll inte körs flera gånger samtidigt

---

## Rekommenderad implementation för nytt `/run`

### Viktigt beslut
Ja, gamla `/run`-UI:t bör bevaras som backup medan nya införs.

### Men:
Spara inte backup som död kopierad kod i samma komponent.

Rekommenderad väg:
- bryt ut nuvarande run-UI till en egen komponent
  - exempel: `RunScreenLegacy`
- bygg nya UI:t i en separat komponent
  - exempel: `RunScreenStructured`
- växla mellan dem med lokal feature flag

Detta är bättre än att:
- kommentera ut gammal kod
- hålla dubbla JSX-träd i samma fil

### Föreslagen struktur
- `components/run/RunScreenLegacy.tsx`
- `components/run/RunScreenStructured.tsx`
- `components/run/RunBlockSequence.tsx`
- `components/run/RunBlockSequenceItem.tsx`

### Feature flag
En enkel lokal flag räcker i början:
- konstant i kod
- eller query param för intern testning

Exempel:
- `?run_ui=structured`

Senare kan det lyftas till riktig inställning.

---

## Sprintförslag

### UX Sprint A: Informationsarkitektur
- komprimera `/home`
- komprimera `/preview`
- definiera nya standardnivåer för synlig info

### UX Sprint B: Ny `/run`-struktur
- extrahera legacy-UI
- bygg ny strukturerad blocklista
- markera aktivt set/övning
- stöd för superset-loop
- autoscroll

### UX Sprint C: Finjustering
- minska textmängd ytterligare
- polish på badges, aktiv markering och timers
- utvärdera om horisontell scroll behövs eller om vertikal lista räcker

---

## Rekommenderat nästa konkreta steg

1. Godkänn denna spec som riktning
2. Starta med `/run` bakom feature flag
3. Behåll legacy-UI parallellt tills nya flödet känns stabilt
4. Efter `/run`, förenkla `/preview`
5. Sist: komprimera `/home` ytterligare efter hur nya `/run` fungerar i praktiken

