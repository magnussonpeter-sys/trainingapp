# Sprint-plan: träningsmotor, progression, feedback och förberedelse för cirkelträning

## Syfte
Denna sprintplan beskriver hur MegaStark bör utvecklas för att förbättra träningskvalitet, retention och framtida flexibilitet. Planen fokuserar på att åtgärda följande huvudbrister:

- progression saknas
- vilotider är ofta för korta
- övningsordning är inte tillräckligt styrd
- veckostruktur saknas
- feedback efter träning är för svag

Samtidigt ska arbetet göras på ett sätt som underlättar införandet av **cirkelträning** senare, utan att vi behöver bygga hela cirkelträningen nu.

---

## Övergripande strategi
I stället för att bygga många nya funktioner direkt ska appen först få en bättre **träningsmotor**.

Målet är att gå från:

- passgenerator

Till:

- träningssystem med struktur, progression och feedback

För att detta också ska fungera bra med framtida cirkelträning behöver workout-modellen gå från att tänka:

- `workout.exercises[]`

Till att tänka:

- `workout.blocks[]`

Det gör att appen senare kan stödja flera träningsformat, till exempel:

- straight sets
- cirkelträning
- superset
- finisher-block
- EMOM eller AMRAP längre fram

I denna plan införs dock bara **blockstruktur light**, där alla pass fortfarande använder vanliga straight sets.

---

## Målbild efter dessa sprintar
Efter genomförda sprintar ska appen kunna:

- generera bättre strukturerade pass
- använda mer rimliga vilotider utifrån mål
- spara och använda tidigare prestation per övning
- ge viktförslag och enkel progression
- ge tydligare feedback efter pass
- visa mer relevant träningsinformation inför nästa pass
- ha en workout-modell som är redo för cirkelträning

Det som fortfarande kan byggas i nästa steg efter detta är full veckoplanering och faktisk cirkelträning i UI och run-logik.

---

# Sprint 1: Ny träningsmotor och framtidssäkring för träningsformat

## Huvudmål
Förbättra träningskvaliteten direkt genom att styra passens struktur bättre, samtidigt som workout-modellen görs redo för cirkelträning.

## Varför denna sprint kommer först
Denna sprint ger snabb förbättring av:

- övningsordning
- vilotider
- träningslogik

Den lägger också rätt grund för senare stöd för cirkelträning.

## Funktionella förändringar

### 1. Inför blockstruktur i workout-modellen
Ändra workout från platt lista av övningar till block.

Exempel:

```ts
interface WorkoutBlockStraightSets {
  type: "straight_sets"
  title?: string
  exercises: Exercise[]
}

interface Workout {
  id: string
  name: string
  duration: number
  goal?: string
  gym?: string
  blocks: WorkoutBlock[]
  createdAt?: string
}
```

I denna sprint används bara:

- `type: "straight_sets"`

Ingen riktig cirkelträning ännu.

### 2. Bakåtkompatibilitet
Gamla workouts med `exercises[]` ska fortsatt kunna laddas.

Normalisering ska automatiskt mappa:

- gammal modell → ett block av typen `straight_sets`

Detta minskar risk och gör övergången säkrare.

### 3. Regelstyrd passstruktur i generatorn
AI ska inte styra hela passets ordning själv. I stället ska generatorn använda en enkel struktur, till exempel:

- uppvärmning
- underkropp primär
- överkropp press
- överkropp drag
- tillägg eller accessoar
- bål eller finisher

AI kan välja övningar inom ramen, men inte slumpa hela upplägget.

### 4. Vilotider styrs av mål
Inför regler för vila utifrån träningsmål.

Exempel:

- styrka: längre vila
- hypertrofi: medellång vila
- cirkelträning senare: kort vila inom block, längre mellan varv

Även om cirkelträning inte byggs nu, ska vilologiken utformas så att olika blocktyper senare kan ha olika regler.

## Tekniska mål

### Filer som bör ändras i sprint 1
- `types/workout.ts`
- `lib/workout-flow/normalize-preview-workout.ts`
- `lib/workout-storage.ts`
- `lib/workout-generator.ts`
- `app/api/workouts/generate/route.ts`
- `hooks/use-workout-preview.ts`
- `app/workout/custom/page.tsx`
- `app/workout/preview/page.tsx`
- `hooks/use-active-workout.ts`
- `app/workout/run/page.tsx`

## Resultat efter sprint 1
- bättre ordning på övningar
- mer rimliga vilotider
- workout-modellen redo för framtida cirkelträning
- fortfarande samma användarupplevelse i huvudsak, men på bättre teknisk grund

---

# Sprint 2: Progression per övning

## Huvudmål
Lösa den största träningsmässiga bristen: att progression saknas.

## Varför detta är nästa steg
När passens struktur blivit bättre ska appen börja minnas användarens prestation och använda den för att föreslå nästa steg.

Detta gör att appen går från passgenerator till träningscoach.

## Funktionella förändringar

### 1. Spara prestation per övning
För varje relevant övning bör appen spara till exempel:

- senaste vikt
- senaste reps
- antal set
- extra reps eller ansträngning
- datum för senaste uppdatering

Detta kan lagras i databas och lokalt fallback.

### 2. Inför enkel progressionsmotor
Exempel på grundlogik:

- om användaren hade mycket kvar i tanken → föreslå ökning
- om användaren låg rätt → behåll vikt
- om övningen var för tung → sänk vikt eller reps

Detta behöver inte vara avancerat från början, men ska vara stabilt och begripligt.

### 3. Visa viktförslag inför pass
I preview och run ska appen kunna visa:

- senaste vikt
- föreslagen vikt
- kort förklaring

Exempel:

- `Du klarade 12 reps senast, dags att öka 2.5 kg`
- `Behåll vikten från förra passet`

## Tekniska mål

### Nya eller ändrade filer
- ny fil: `lib/progression-engine.ts`
- `hooks/use-active-workout.ts`
- `app/workout/preview/page.tsx`
- `app/workout/run/page.tsx`
- eventuell databas- eller API-logik för att spara progression

## Resultat efter sprint 2
- appen börjar ge faktisk progression
- träningskvaliteten förbättras tydligt
- användaren märker att appen minns tidigare prestation

---

# Sprint 3: Feedback före, under och efter pass

## Huvudmål
Förbättra retention genom att ge tydlig och relevant feedback.

## Varför detta behövs
Bra feedback ger:

- känsla av kompetens
- bättre motivation
- tydligare belöning efter träning
- bättre förståelse för progression

## Funktionella förändringar

### 1. Feedback i preview
Visa före pass:

- senaste resultat
- föreslagen belastning
- enkel kommentar från coachlogik

### 2. Feedback i run
Under pass:

- tydlig markering av aktivt set
- senaste vikt synlig
- föreslagen vikt förifylld eller tydligt visad

### 3. Pass-sammanfattning efter pass
Visa efter pass:

- antal genomförda set
- total volym
- förändring jämfört med förra gången
- enkel coachkommentar

Exempel:

- `Du ökade total volym med 8 %`
- `Du höjde vikten i två övningar`
- `Bra pass, nästa gång kan du öka i benövningen`

## Tekniska mål

### Filer som bör ändras
- `app/workout/summary/page.tsx`
- `app/workout/preview/page.tsx`
- `app/workout/run/page.tsx`
- `hooks/use-active-workout.ts`
- `lib/workout-summary.ts`

## Resultat efter sprint 3
- tydligt bättre användarvärde
- bättre retention
- mer coachkänsla

---

# Sprint 4: Enkel veckostruktur och träningsöversikt

## Huvudmål
Börja lösa bristen att veckostruktur saknas.

## Varför detta kommer efter progression och feedback
Det blir mer meningsfullt att bygga veckonivå när:

- passens kvalitet är bättre
- progression finns
- sammanfattning fungerar

## Funktionella förändringar

### 1. Enkel veckoplan
Användaren ska kunna ha ett grundmål, till exempel:

- 2 pass per vecka
- 3 pass per vecka
- helkropp eller delad struktur senare

### 2. Veckoöversikt på home
Visa till exempel:

- planerade pass
- genomförda pass
- total volym denna vecka
- enkel trend

### 3. Lätt återhämtningslogik
Inte avancerat från början, men till exempel:

- undvik för mycket av samma belastning flera pass i rad
- ge enklare rekommendation inför nästa pass

## Tekniska mål
- uppdatering av `/home`
- ev. ny användarinställning för träningsfrekvens
- utbyggnad av summary- och analyslager

## Resultat efter sprint 4
- användaren får riktning över veckan
- bättre struktur och planering
- tydligare coachupplevelse

---

# Sprint 5: Förberedelse klar, införande av cirkelträning

## Huvudmål
När sprint 1–4 är på plats finns rätt grund för att börja bygga cirkelträning på riktigt.

## Vad som redan då ska vara möjligt tack vare tidigare arbete
Eftersom workout nu bygger på block, kan nya blocktyper läggas till utan att hela modellen måste göras om.

Det innebär att appen då redan är tekniskt redo för att införa till exempel:

- `circuit`
- `superset`
- `finisher`

## Funktionella förändringar i denna sprint

### 1. Ny blocktyp: circuit
Exempel:

```ts
interface WorkoutBlockCircuit {
  type: "circuit"
  title?: string
  rounds: number
  restBetweenRounds: number
  exercises: Exercise[]
}
```

### 2. Preview för cirkelträning
Visa tydligt:

- vilka övningar som ingår i cirkeln
- antal varv
- vila mellan varv

### 3. Run-logik för circuit
Ny körlogik behövs för:

- övning inom varv
- flera varv
- annan timerlogik
- annan sammanfattning

### 4. Feedback för circuit
Exempel:

- antal fullföljda varv
- jämförelse mot tidigare cirkelpass
- prestation per varv

## Resultat efter sprint 5
- faktisk cirkelträning kan användas i appen
- den bygger vidare på samma träningsmotor i stället för att vara specialkod bredvid

---

# Hur denna plan hjälper införandet av cirkelträning

## Direkt nytta redan nu
Genom att införa blockstruktur tidigt blir workout-flödet mer generellt.

Det gör att framtida cirkelträning inte kräver att hela workout-systemet skrivs om igen.

## Konkret innebär det att vi redan nu säkrar upp för:
- flera träningsformat i samma workout-modell
- olika regler för vila beroende på blocktyp
- olika UI-sektioner i preview
- annan run-logik per blocktyp senare
- tydligare strukturerad träningsdata för analys och feedback

## Viktig avgränsning
Detta arbete innebär inte att full cirkelträning byggs direkt.

Det innebär att vi bygger träningsmotorn på ett sätt som gör cirkelträning möjlig att lägga till senare med betydligt mindre risk och betydligt mindre omskrivning.

---

# Prioriteringsordning

## Högst prioritet
1. Sprint 1: träningsmotor och blockstruktur
2. Sprint 2: progression
3. Sprint 3: feedback

## Nästa steg
4. Sprint 4: veckostruktur
5. Sprint 5: faktisk cirkelträning

---

# Sammanfattning
Den bästa vägen framåt är inte att lägga till cirkelträning direkt, utan att först bygga en bättre träningsmotor.

Detta ger direkt förbättring av:

- övningsordning
- vilotider
- progression
- feedback

Samtidigt gör det att appen får rätt arkitektur för att senare kunna stödja cirkelträning på ett naturligt sätt.

Detta är därför både den bästa träningsmässiga vägen och den bästa tekniska vägen framåt.

