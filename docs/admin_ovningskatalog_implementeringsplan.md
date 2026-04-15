# Admin för Övningskatalog: mål och implementeringsplan

## Syfte

Det här dokumentet beskriver hur admin för övningskatalogen bör byggas ut stegvis utan att bryta:

- AI-generering av pass
- preview- och run-flödet
- historik och progression
- stabila `exerciseId`
- bakåtkompatibilitet för gamla pass

Målet är att gå från dagens kodbaserade katalog i `lib/exercise-catalog.ts` till en modell där:

- katalogen kan lagras i databas
- appen läser via ett gemensamt repository-lager
- admin kan lista, skapa, uppdatera och inaktivera övningar
- resten av appen inte behöver veta om datan kommer från kod eller databas

## Målbild

När detta är klart ska appen ha:

1. en DB-baserad övningskatalog
2. ett stabilt kataloglager (`repo`) för all läsning
3. admin-API för övningar
4. admin-UI för:
   - lista
   - detalj
   - skapa
   - uppdatera
   - inaktivera
5. full bakåtkompatibilitet med gamla workouts och historik

## Viktiga principer

### 1. `exerciseId` måste vara stabilt

En övnings `id` får aldrig ändras efter att den skapats.

Detta är kritiskt för:

- historik
- progression
- suggested weights
- feedback-system
- gamla sparade pass

### 2. Inaktivering före delete

Övningar ska i första versionen inte hårdraderas.

Använd istället:

- `is_active = false`

På så sätt:

- kan gamla pass fortfarande visas
- AI kan filtrera bort inaktiva övningar för nya pass
- admin får kontroll utan att bryta referenser

### 3. Repository-lager mellan app och datakälla

Ingen del av appen ska läsa direkt från databasen eller direkt från `lib/exercise-catalog.ts`.

All läsning ska gå via ett gemensamt lager, till exempel:

- `lib/exercise-catalog-repo.ts`

Det gör att vi kan:

- använda DB som primär källa
- behålla kodkatalog som fallback under migrering
- ändra datakälla senare utan att röra hela appen

### 4. Bakåtkompatibilitet under hela migreringen

Under övergångsperioden ska appen kunna:

- läsa från DB när data finns
- falla tillbaka till nuvarande statiska katalog när DB saknas eller är tom

## Föreslagen datamodell

### Tabell: `exercise_catalog`

Föreslagna kolumner:

- `id TEXT PRIMARY KEY`
- `name_sv TEXT NOT NULL`
- `description_sv TEXT`
- `movement_pattern TEXT NOT NULL`
- `equipment_types TEXT[] NOT NULL DEFAULT '{}'`
- `default_sets INTEGER`
- `default_reps INTEGER`
- `default_duration_seconds INTEGER`
- `default_rest_seconds INTEGER`
- `risk_level TEXT`
- `primary_muscles TEXT[] NOT NULL DEFAULT '{}'`
- `secondary_muscles TEXT[] NOT NULL DEFAULT '{}'`
- `intensity_tags TEXT[] NOT NULL DEFAULT '{}'`
- `variant_group TEXT`
- `progression_group TEXT`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `source TEXT NOT NULL DEFAULT 'admin'`
- `created_at TIMESTAMP NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMP NOT NULL DEFAULT NOW()`

### Kommentarer om modellen

- `id` måste motsvara det stabila `exerciseId` som appen redan använder
- `movement_pattern` bör använda samma vokabulär som dagens träningsmotor
- `equipment_types` bör följa samma interna equipment-id som används i AI-flödet
- `primary_muscles` och `secondary_muscles` förbereder bättre planering, budget och framtida AI-styrning

## Föreslagen kodstruktur

### Databas / init

- `app/api/init-exercise-catalog/route.ts`

Ansvar:

- skapa tabellen `exercise_catalog`
- lägga till index och constraints
- kunna köras utan att påverka befintliga pass

### Repository-lager

- `lib/exercise-catalog-repo.ts`

Ansvar:

- `getExerciseCatalog()`
- `getActiveExerciseCatalog()`
- `getExerciseById(id)`
- `listExerciseCatalogEntries()`
- `upsertExerciseCatalogEntry(...)`

### Normalisering

- `lib/exercise-catalog-normalize.ts` eller som intern helper i repo

Ansvar:

- ta DB-rader eller statiska katalogobjekt
- returnera ett konsekvent format till resten av appen

### Admin API

- `app/api/admin/exercise-catalog/route.ts`
- `app/api/admin/exercise-catalog/[id]/route.ts`

Ansvar:

- lista
- skapa
- hämta detalj
- uppdatera
- inaktivera

### Admin UI

- `app/admin/exercise-catalog/page.tsx`
- `app/admin/exercise-catalog/[id]/page.tsx`
- eventuellt `app/admin/exercise-catalog/new/page.tsx`

Ansvar:

- lista + filter
- detalj/edit
- skapa ny övning

## Steg-för-steg-implementation

## Fas 1: Lägg grund i databasen

### Steg 1. Skapa init-route för övningskatalog

Skapa:

- `app/api/init-exercise-catalog/route.ts`

Den ska:

- skapa tabellen `exercise_catalog`
- lägga till index på `is_active`
- lägga till eventuella constraints för `risk_level` och `movement_pattern` om dessa är tillräckligt stabila

### Steg 2. Säkerställ att tabellen går att skapa utan att påverka befintlig drift

Init-routen ska:

- vara idempotent
- inte skriva över befintlig data
- inte kräva att resten av appen redan är migrerad

## Fas 2: Bygg kataloglager

### Steg 3. Inför `lib/exercise-catalog-repo.ts`

Repo-lagret ska bli enda officiella vägen till katalogen.

Första versionen ska:

- läsa från DB om tabellen finns och innehåller data
- annars läsa från `lib/exercise-catalog.ts`

### Steg 4. Lägg in normalisering

Skapa en helper som säkerställer att:

- DB-rader och statiska övningar returneras i samma shape
- resten av appen inte behöver specialfall

## Fas 3: Bootstrap och seed

### Steg 5. Seed från nuvarande katalog

Skapa till exempel:

- `app/api/admin/exercise-catalog/seed/route.ts`
  eller
- ett lokalt script i repo

Det ska:

- läsa alla övningar från `lib/exercise-catalog.ts`
- skriva dem till `exercise_catalog`
- hoppa över poster med redan existerande `id`

### Steg 6. Använd kodkatalogen som fallback tills seed är körd

Det betyder att migreringen kan rullas ut säkert innan admin-UI finns klart.

## Fas 4: Flytta appen till repo-lagret

### Steg 7. Identifiera alla direkta läsningar av `lib/exercise-catalog.ts`

Särskilt viktigt att söka igenom:

- AI-generering
- validering
- preview
- run
- historik

### Steg 8. Byt dessa till repo-lagret

Målet är att:

- `lib/exercise-catalog.ts` inte längre ska vara direkt beroende i UI-/motorflödet
- men ändå finnas kvar som fallback

## Fas 5: Admin-API

### Steg 9. Skapa lista/skapa-route

Skapa:

- `app/api/admin/exercise-catalog/route.ts`

Stöd i första versionen:

- `GET` lista övningar
- `POST` skapa ny övning

### Steg 10. Skapa detalj/update-route

Skapa:

- `app/api/admin/exercise-catalog/[id]/route.ts`

Stöd i första versionen:

- `GET` en övning
- `PATCH` uppdatera övning

### Steg 11. Gör inaktivering istället för delete

I första versionen ska admin inte kunna radera övningar hårt.

Istället:

- sätt `is_active = false`

## Fas 6: Admin-UI

### Steg 12. Bygg lista: `/admin/exercise-catalog`

Sidan ska visa:

- namn
- id
- movement pattern
- utrustning
- aktiv/inaktiv

Den ska stödja:

- sök
- filter på status
- filter på movement pattern
- filter på utrustning

### Steg 13. Bygg detaljsida: `/admin/exercise-catalog/[id]`

Admin ska kunna se och redigera:

- namn
- beskrivning
- movement pattern
- equipment_types
- default sets / reps / duration / rest
- risk_level
- primary_muscles
- secondary_muscles
- intensity_tags
- progression_group
- variant_group
- aktiv/inaktiv

### Steg 14. Skapa skapa-flöde

Antingen:

- separat `new`-sida
  eller
- samma detaljvy i create-läge

För enkelhet är en separat create-vy ofta tydligast i admin.

## Fas 7: Viktiga skydd

### Steg 15. Gör `id` skrivskyddat efter skapande

Admin får se `id` men inte ändra det.

### Steg 16. Filtrera bort inaktiva övningar i nya pass

`getActiveExerciseCatalog()` ska användas för ny workout-generering.

### Steg 17. Behåll stöd för gamla pass

Om ett gammalt pass använder ett `exerciseId` som nu är inaktivt:

- passet ska fortfarande kunna visas
- övningen ska fortfarande kunna köras/loggas

### Steg 18. Fallback om DB-saknad övning inte hittas

Om en historisk workout refererar till ett id som inte finns i DB:

- försök läsa från statiska katalogen
- annars använd sparad övningsdata från workout-objektet

## Fas 8: Successiv städning

### Steg 19. Låt den vilande admin-sidan peka till riktig katalogsida

När katalog-UI:t finns:

- uppdatera `/admin` så att “Övningskatalog” inte längre är vilande

### Steg 20. Minska direktberoendet till `lib/exercise-catalog.ts`

Först när hela appen läser via repo-lagret kan man börja överväga att:

- minska användningen av den statiska katalogen
- eller låta den leva kvar som långsiktig fallback

## Rekommenderad genomförandeordning

1. skapa DB-tabell och init-route
2. skapa `exercise-catalog-repo.ts`
3. skapa normalisering + fallback
4. seed från nuvarande katalog
5. flytta appens läsningar till repo-lagret
6. skapa admin API
7. skapa admin lista
8. skapa admin detalj/edit
9. skapa create-flöde
10. införa inaktivering och filtrering av inaktiva övningar

## Vad som inte ska göras i första versionen

För att hålla komplexiteten låg ska första versionen inte innehålla:

- bulkimport/export
- avancerad sortering/drag-drop
- relationsgraf för progressioner
- automatisk migrering av historik
- live-redigering direkt i run/preview
- hård delete av övningar

## Konkreta första filer att implementera

Om vi går vidare direkt är det här de bästa första filerna att skapa:

1. `app/api/init-exercise-catalog/route.ts`
2. `lib/exercise-catalog-repo.ts`
3. `app/api/admin/exercise-catalog/route.ts`
4. `app/api/admin/exercise-catalog/[id]/route.ts`
5. `app/admin/exercise-catalog/page.tsx`

## Definition av klar första version

För att betrakta första versionen som klar ska följande fungera:

- DB-tabell för övningskatalog finns
- appen kan läsa katalog via repo-lager
- fallback till statisk katalog fungerar
- admin kan lista övningar
- admin kan öppna en övning
- admin kan uppdatera övningsdata
- admin kan skapa ny övning
- admin kan inaktivera övning
- nya pass använder bara aktiva övningar
- gamla pass fortsätter fungera

## Sammanfattning

Rätt väg framåt är inte att bygga admin direkt ovanpå `lib/exercise-catalog.ts`, utan att först lägga ett stabilt lager mellan appen och katalogdatan.

Det lager som bör införas är:

- databas som möjlig källa
- repository som kontrakt
- kodkatalog som fallback under migrering

Detta ger:

- låg risk
- tydlig adminstruktur
- bakåtkompatibilitet
- bättre grund för framtida AI-logik och progression

