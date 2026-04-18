// Dagliga visdomsord för /home.
// Blandning av äkta citat, kortade versioner och fria tolkningar i japanskt inspirerad ton.

export type HomeWisdomQuote = {
  id: string;
  text: string;
  type: "authentic" | "shortened" | "adaptation";
  mood: "calm" | "mystic" | "humorous" | "disciplined";
};

export const HOME_WISDOM_QUOTES: HomeWisdomQuote[] = [
  {
    id: "nanakorobi-yaoki",
    text: "Fall sju gånger, res dig åtta.",
    type: "authentic",
    mood: "disciplined",
  },
  {
    id: "path-continues",
    text: "Ett fall bryter inte vägen. Nästa steg räknas fortfarande.",
    type: "adaptation",
    mood: "calm",
  },
  {
    id: "saru-mo-ki-kara-ochiru",
    text: "Även apor faller från träd.",
    type: "authentic",
    mood: "humorous",
  },
  {
    id: "even-the-skilled-stumble",
    text: "Även den vane snubblar. Det viktiga är att återvända.",
    type: "adaptation",
    mood: "calm",
  },
  {
    id: "the-way-is-in-training",
    text: "The Way is in training.",
    type: "authentic",
    mood: "disciplined",
  },
  {
    id: "the-way-is-in-the-session",
    text: "Vägen ligger inte i planen. Den ligger i passet du faktiskt gör.",
    type: "adaptation",
    mood: "disciplined",
  },
  {
    id: "do-nothing-of-no-use",
    text: "Do nothing which is of no use.",
    type: "authentic",
    mood: "disciplined",
  },
  {
    id: "do-the-simple-thing",
    text: "Gör det enkla som för dig framåt. Det räcker långt.",
    type: "adaptation",
    mood: "calm",
  },
  {
    id: "mountain-in-the-mist",
    text: "Morgondimman döljer berget, men berget står kvar. Så fungerar framsteg också.",
    type: "adaptation",
    mood: "mystic",
  },
  {
    id: "repeated-in-stillness",
    text: "Det som upprepas i stillhet blir till slut en del av dig.",
    type: "adaptation",
    mood: "mystic",
  },
  {
    id: "no-need-full-bloom",
    text: "Man behöver inte vänta på full blom.",
    type: "shortened",
    mood: "mystic",
  },
  {
    id: "imperfect-session-counts",
    text: "Ett ofullkomligt pass kan fortfarande vara ett sant steg framåt.",
    type: "adaptation",
    mood: "calm",
  },
  {
    id: "bamboo-in-the-wind",
    text: "Bambu böjer sig i vinden och står ändå kvar. Ett lugnt pass räknas också.",
    type: "adaptation",
    mood: "mystic",
  },
  {
    id: "river-grows-strong",
    text: "Floden blir stark genom att fortsätta, inte genom att skynda.",
    type: "adaptation",
    mood: "mystic",
  },
  {
    id: "quiet-hand-lifts-best",
    text: "Den lugna handen lyfter ofta bäst.",
    type: "adaptation",
    mood: "calm",
  },
  {
    id: "body-formed-in-patience",
    text: "Kroppen formas sällan i brådska. Oftare i tålamod.",
    type: "adaptation",
    mood: "calm",
  },
  {
    id: "path-begins-with-first-rep",
    text: "Vägen visar sig inte alltid i förväg. Ibland börjar den med första repetitionen.",
    type: "adaptation",
    mood: "mystic",
  },
  {
    id: "stone-shaped-by-water",
    text: "En sten formas långsamt av vatten. Styrka byggs på liknande sätt.",
    type: "adaptation",
    mood: "mystic",
  },
  {
    id: "small-step-many-times",
    text: "Det lilla steget, upprepat många gånger, blir till slut något stort.",
    type: "adaptation",
    mood: "calm",
  },
  {
    id: "good-training-on-gray-days",
    text: "Även grå dagar kan bära god träning.",
    type: "adaptation",
    mood: "calm",
  },
  {
    id: "wise-monk-leg-day",
    text: "Även en vis munk skulle ibland vilja hoppa över benpass. Visdom är att komma ändå.",
    type: "adaptation",
    mood: "humorous",
  },
  {
    id: "zen-is-accepting-next-set",
    text: "Zen är kanske att acceptera nästa set innan du tycker om det.",
    type: "adaptation",
    mood: "humorous",
  },
  {
    id: "strength-and-soreness",
    text: "Den som söker styrka finner ofta också träningsvärk.",
    type: "adaptation",
    mood: "humorous",
  },
  {
    id: "stillness-and-honest-sets",
    text: "Stillhet i sinnet är fint. Men några ärliga set hjälper också.",
    type: "adaptation",
    mood: "humorous",
  },
  {
    id: "path-to-strength-lunges",
    text: "Vägen till styrka är lång. Märkligt nog innehåller den ofta utfallssteg.",
    type: "adaptation",
    mood: "humorous",
  },
  {
    id: "universe-no-shortcuts",
    text: "Universum erbjuder sällan genvägar. Tyvärr gäller det även knäböj.",
    type: "adaptation",
    mood: "humorous",
  },
  {
    id: "master-puts-on-shoes",
    text: "Mästaren väntar inte alltid på motivation. Ibland tar mästaren bara på sig skorna.",
    type: "adaptation",
    mood: "disciplined",
  },
  {
    id: "tired-soul-good-session",
    text: "Även en trött själ kan göra ett gott pass.",
    type: "adaptation",
    mood: "calm",
  },
  {
    id: "win-the-threshold",
    text: "Du behöver inte besegra dagen. Det räcker att vinna över tröskeln.",
    type: "adaptation",
    mood: "disciplined",
  },
  {
    id: "strength-built-quietly",
    text: "Styrka byggs långsamt, tyst och med förvånansvärt många repetitioner.",
    type: "adaptation",
    mood: "mystic",
  },
];
