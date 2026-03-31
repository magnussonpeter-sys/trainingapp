export type EquipmentId =
  | "bench"
  | "dumbbells"
  | "barbell"
  | "rack"
  | "pullup_bar"
  | "cable_machine"
  | "rings"
  | "bodyweight";

export type MovementPattern =
  | "horizontal_push"
  | "horizontal_pull"
  | "vertical_push"
  | "vertical_pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "core"
  | "carry";

export type ExerciseCatalogItem = {
  id: string;
  name: string;
  requiredEquipment: EquipmentId[];
  description: string;
  defaultSets: number;
  defaultReps?: number;
  defaultDuration?: number;
  defaultRest: number;
  movementPattern: MovementPattern;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  variantGroup: string;
  riskLevel: "low" | "medium" | "high";
  primaryGoalTags?: string[];
};

export const EXERCISE_CATALOG: ExerciseCatalogItem[] = [
  // =========================
  // BODYWEIGHT
  // =========================
  {
    id: "push_up",
    name: "Armhävningar",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Sänk kroppen kontrollerat mot golvet och pressa upp igen med rak bål. Mål: Träna bröst, axlar, triceps och bål.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 60,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest", "triceps", "front_delts"],
    secondaryMuscles: ["core"],
    variantGroup: "push_up",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "hypertrofi", "allmän hälsa"],
  },
  {
    id: "decline_push_up",
    name: "Decline armhävningar",
    requiredEquipment: ["bodyweight", "bench"],
    description:
      "Utförande: Placera fötterna på en bänk och gör armhävningar med stabil bål. Mål: Öka belastningen på övre bröst och framsida axlar.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest", "front_delts", "triceps"],
    secondaryMuscles: ["core"],
    variantGroup: "push_up",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "bodyweight_squat",
    name: "Knäböj med kroppsvikt",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Sitt ned i en kontrollerad knäböj och res dig upp med stabil överkropp. Mål: Träna framsida lår, säte och rörelsekontroll.",
    defaultSets: 3,
    defaultReps: 15,
    defaultRest: 45,
    movementPattern: "squat",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["core"],
    variantGroup: "squat",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "uthållighet"],
  },
  {
    id: "reverse_lunge_bodyweight",
    name: "Bakåtutfall med kroppsvikt",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Kliv bakåt, sänk kontrollerat ned och pressa tillbaka till stående. Mål: Träna ben, säte och balans.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 45,
    movementPattern: "lunge",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings", "core"],
    variantGroup: "lunge",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "hypertrofi"],
  },
  {
    id: "glute_bridge",
    name: "Glute bridge",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Pressa höften uppåt från golvet med fötterna i marken och sänk kontrollerat. Mål: Träna säte och baksida lår.",
    defaultSets: 3,
    defaultReps: 15,
    defaultRest: 45,
    movementPattern: "hinge",
    primaryMuscles: ["glutes", "hamstrings"],
    secondaryMuscles: ["core"],
    variantGroup: "hip_bridge",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "hypertrofi"],
  },
  {
    id: "single_leg_glute_bridge",
    name: "Enbens glute bridge",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Lyft höften från golvet med ett ben i taget och håll bäckenet stabilt. Mål: Träna säte, baksida lår och höftkontroll.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 45,
    movementPattern: "hinge",
    primaryMuscles: ["glutes", "hamstrings"],
    secondaryMuscles: ["core"],
    variantGroup: "hip_bridge",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "allmän hälsa"],
  },
  {
    id: "step_up_bodyweight",
    name: "Step-up med kroppsvikt",
    requiredEquipment: ["bodyweight", "bench"],
    description:
      "Utförande: Kliv upp på bänk eller stadig låda och gå kontrollerat ned igen. Mål: Träna benstyrka, säte och balans.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 45,
    movementPattern: "lunge",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["core"],
    variantGroup: "step_up",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "hypertrofi"],
  },
  {
    id: "plank",
    name: "Plankan",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Håll en rak linje från huvud till häl med spänd bål och säte. Mål: Träna bålstabilitet och uthållighet.",
    defaultSets: 3,
    defaultDuration: 40,
    defaultRest: 30,
    movementPattern: "core",
    primaryMuscles: ["core"],
    secondaryMuscles: ["glutes", "shoulders"],
    variantGroup: "plank",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "uthållighet"],
  },
  {
    id: "side_plank",
    name: "Sidoplanka",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Stöd på underarm och fot, håll höften lyft och kroppen rak från sidan. Mål: Träna sidobål och höftstabilitet.",
    defaultSets: 3,
    defaultDuration: 30,
    defaultRest: 30,
    movementPattern: "core",
    primaryMuscles: ["obliques", "core"],
    secondaryMuscles: ["glutes"],
    variantGroup: "side_plank",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "uthållighet"],
  },
  {
    id: "dead_bug",
    name: "Dead bug",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Pressa ländryggen lätt mot golvet och sänk motsatt arm och ben kontrollerat. Mål: Träna djup bålstabilitet och koordination.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 30,
    movementPattern: "core",
    primaryMuscles: ["core"],
    secondaryMuscles: ["hip_flexors"],
    variantGroup: "dead_bug",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "uthållighet"],
  },
  {
    id: "bird_dog",
    name: "Bird dog",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Sträck ut motsatt arm och ben med stabil bål och neutral rygg. Mål: Träna ryggstabilitet, bål och kontroll.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 30,
    movementPattern: "core",
    primaryMuscles: ["core"],
    secondaryMuscles: ["glutes", "lower_back"],
    variantGroup: "bird_dog",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "rehab"],
  },
  {
    id: "mountain_climber",
    name: "Mountain climbers",
    requiredEquipment: ["bodyweight"],
    description:
      "Utförande: Håll plankposition och dra växelvis knäna mot bröstet i kontrollerat tempo. Mål: Träna bål, axelstabilitet och puls.",
    defaultSets: 3,
    defaultDuration: 30,
    defaultRest: 30,
    movementPattern: "core",
    primaryMuscles: ["core"],
    secondaryMuscles: ["shoulders", "hip_flexors"],
    variantGroup: "mountain_climber",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "uthållighet"],
  },
  {
    id: "inverted_row_bar",
    name: "Inverterad rodd i stång",
    requiredEquipment: ["bodyweight", "rack", "barbell"],
    description:
      "Utförande: Häng under en stång i rack och dra bröstet upp mot stången med rak kropp. Mål: Träna rygg, biceps och skulderkontroll.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["lats", "upper_back", "biceps"],
    secondaryMuscles: ["rear_delts", "core"],
    variantGroup: "row",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "allmän hälsa"],
  },

  // =========================
  // RINGS
  // =========================
  // Romerska ringar / gymnastic rings ger många starka press-, drag- och coreövningar.
  {
    id: "ring_row",
    name: "Ring rows",
    requiredEquipment: ["rings"],
    description:
      "Utförande: Luta kroppen bakåt med spänd bål och dra bröstet mot ringarna. Mål: Träna övre rygg, lats och biceps med hög skulderkontroll.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["lats", "upper_back", "biceps"],
    secondaryMuscles: ["rear_delts", "core", "forearms"],
    variantGroup: "row",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "hypertrofi", "allmän hälsa"],
  },
  {
    id: "feet_elevated_ring_row",
    name: "Ring rows med fötterna högt",
    requiredEquipment: ["rings", "bench"],
    description:
      "Utförande: Placera fötterna på en bänk och dra kroppen upp mot ringarna med rak kropp. Mål: Öka belastningen i rygg, biceps och bål.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 75,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["lats", "upper_back", "biceps"],
    secondaryMuscles: ["rear_delts", "core"],
    variantGroup: "row",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "ring_push_up",
    name: "Armhävningar i ringar",
    requiredEquipment: ["rings"],
    description:
      "Utförande: Håll kroppen stabil mellan ringarna, sänk kontrollerat ned och pressa upp igen. Mål: Träna bröst, triceps, axlar och bål med större stabilitetskrav.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest", "triceps", "front_delts"],
    secondaryMuscles: ["core", "shoulders"],
    variantGroup: "push_up",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "feet_elevated_ring_push_up",
    name: "Armhävningar i ringar med fötterna högt",
    requiredEquipment: ["rings", "bench"],
    description:
      "Utförande: Placera fötterna på en bänk och utför armhävningar i ringar med stabil bål. Mål: Öka belastningen på bröst, axlar och triceps.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 75,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest", "front_delts", "triceps"],
    secondaryMuscles: ["core", "shoulders"],
    variantGroup: "push_up",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "ring_dip",
    name: "Dips i ringar",
    requiredEquipment: ["rings"],
    description:
      "Utförande: Håll kroppen stabil över ringarna, sänk dig kontrollerat och pressa upp igen. Mål: Träna triceps, bröst och axlar med hög stabilitetsutmaning.",
    defaultSets: 3,
    defaultReps: 6,
    defaultRest: 90,
    movementPattern: "vertical_push",
    primaryMuscles: ["triceps", "chest", "front_delts"],
    secondaryMuscles: ["shoulders", "core"],
    variantGroup: "dip",
    riskLevel: "high",
    primaryGoalTags: ["styrka"],
  },
  {
    id: "ring_support_hold",
    name: "Support hold i ringar",
    requiredEquipment: ["rings"],
    description:
      "Utförande: Håll dig uppe med raka armar och stabila ringar nära kroppen. Mål: Träna axelstabilitet, triceps och bål.",
    defaultSets: 3,
    defaultDuration: 20,
    defaultRest: 45,
    movementPattern: "vertical_push",
    primaryMuscles: ["shoulders", "triceps", "core"],
    secondaryMuscles: ["chest", "forearms"],
    variantGroup: "ring_support",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "allmän hälsa"],
  },
  {
    id: "ring_fallout",
    name: "Ring fallout",
    requiredEquipment: ["rings"],
    description:
      "Utförande: Stå eller knästående, låt kroppen falla framåt med raka armar och dra sedan tillbaka med stabil bål. Mål: Träna anti-extension, axlar och djup bålstyrka.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 45,
    movementPattern: "core",
    primaryMuscles: ["core"],
    secondaryMuscles: ["shoulders", "lats", "triceps"],
    variantGroup: "anti_extension",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "allmän hälsa"],
  },
  {
    id: "ring_knee_tuck",
    name: "Knäindrag i ringar",
    requiredEquipment: ["rings"],
    description:
      "Utförande: Ha fötterna i ringarna i plankposition och dra knäna kontrollerat in mot bröstet. Mål: Träna bål, höftböjare och skulderstabilitet.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 30,
    movementPattern: "core",
    primaryMuscles: ["core", "hip_flexors"],
    secondaryMuscles: ["shoulders"],
    variantGroup: "suspended_core",
    riskLevel: "medium",
    primaryGoalTags: ["allmän hälsa", "uthållighet"],
  },
  {
    id: "ring_hamstring_curl",
    name: "Hamstring curl i ringar",
    requiredEquipment: ["rings"],
    description:
      "Utförande: Ligg på rygg med hälarna i ringarna, lyft höften och dra hälarna in mot sätet. Mål: Träna hamstrings, säte och bål.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 45,
    movementPattern: "hinge",
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["core"],
    variantGroup: "hamstring_curl",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "ring_face_pull",
    name: "Face pull i ringar",
    requiredEquipment: ["rings"],
    description:
      "Utförande: Luta dig bakåt och dra ringarna mot ansiktet med höga armbågar. Mål: Träna baksida axlar, övre rygg och skulderhälsa.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["rear_delts", "upper_back"],
    secondaryMuscles: ["traps", "biceps"],
    variantGroup: "rear_delt",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "hypertrofi"],
  },

  // =========================
  // DUMBBELLS
  // =========================
  {
    id: "goblet_squat",
    name: "Goblet squat",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Håll en hantel framför bröstet, sitt ned i en djup knäböj och res dig kontrollerat. Mål: Träna framsida lår, säte och bål.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 75,
    movementPattern: "squat",
    primaryMuscles: ["quads", "glutes", "core"],
    secondaryMuscles: ["adductors"],
    variantGroup: "squat",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "hypertrofi", "allmän hälsa"],
  },
  {
    id: "dumbbell_bench_press",
    name: "Hantelpress på bänk",
    requiredEquipment: ["bench", "dumbbells"],
    description:
      "Utförande: Ligg på bänk, sänk hantlarna kontrollerat till brösthöjd och pressa upp. Mål: Träna bröst, axlar och triceps.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 75,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest", "triceps", "front_delts"],
    secondaryMuscles: ["shoulders"],
    variantGroup: "bench_press",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "incline_dumbbell_press",
    name: "Lutande hantelpress",
    requiredEquipment: ["bench", "dumbbells"],
    description:
      "Utförande: Pressa hantlarna uppåt från lutande bänk med stabil skulderposition. Mål: Träna övre bröst, axlar och triceps.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 75,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest", "front_delts", "triceps"],
    secondaryMuscles: ["shoulders"],
    variantGroup: "bench_press",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi", "styrka"],
  },
  {
    id: "one_arm_dumbbell_row",
    name: "Enarmsrodd med hantel",
    requiredEquipment: ["bench", "dumbbells"],
    description:
      "Utförande: Stöd ena handen på bänk och ro hanteln mot höften med kontrollerad rörelse. Mål: Träna lats, övre rygg och skulderkontroll.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["lats", "upper_back", "rear_delts"],
    secondaryMuscles: ["biceps"],
    variantGroup: "row",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "hypertrofi", "allmän hälsa"],
  },
  {
    id: "bench_supported_dumbbell_row",
    name: "Bröststödd rodd med hantlar",
    requiredEquipment: ["bench", "dumbbells"],
    description:
      "Utförande: Ligg med bröstet mot en lutad bänk och dra hantlarna upp mot kroppen. Mål: Träna övre rygg utan att belasta ländryggen lika mycket.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["upper_back", "lats", "rear_delts"],
    secondaryMuscles: ["biceps"],
    variantGroup: "row",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "bulgarian_split_squat",
    name: "Bulgariska utfall",
    requiredEquipment: ["bench", "dumbbells"],
    description:
      "Utförande: Placera bakre foten på bänk och sänk dig ned i ett enbensutfall med upprätt överkropp. Mål: Träna benstyrka, säte och balans.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 75,
    movementPattern: "lunge",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings", "core"],
    variantGroup: "lunge",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "dumbbell_romanian_deadlift",
    name: "Rumänska marklyft med hantlar",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Fäll i höften med rak rygg och sänk hantlarna längs benen innan du reser dig igen. Mål: Träna baksida lår, säte och höftstyrka.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 75,
    movementPattern: "hinge",
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["lower_back"],
    variantGroup: "romanian_deadlift",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "dumbbell_overhead_press",
    name: "Axelpress med hantlar",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Pressa hantlarna rakt upp över huvudet med kontrollerad bana och sänk långsamt ned. Mål: Träna axlar, triceps och skulderstabilitet.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 75,
    movementPattern: "vertical_push",
    primaryMuscles: ["shoulders", "triceps"],
    secondaryMuscles: ["front_delts", "core"],
    variantGroup: "overhead_press",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "arnold_press",
    name: "Arnoldpress",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Starta med hantlar framför kroppen, rotera ut och pressa upp över huvudet. Mål: Träna axlar med längre rörelsebana.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "vertical_push",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps", "front_delts"],
    variantGroup: "overhead_press",
    riskLevel: "medium",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "dumbbell_lateral_raise",
    name: "Sidolyft med hantlar",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Lyft hantlarna ut åt sidan med lätt böjda armbågar och sänk kontrollerat. Mål: Träna utsida axlar och skulderstyrka.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "vertical_push",
    primaryMuscles: ["side_delts"],
    secondaryMuscles: ["shoulders"],
    variantGroup: "lateral_raise",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "rear_delt_raise",
    name: "Omvända flyes med hantlar",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Fäll i höften och lyft hantlarna ut åt sidan med fokus på baksida axlar. Mål: Träna rear delts och övre rygg.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["rear_delts", "upper_back"],
    secondaryMuscles: ["traps"],
    variantGroup: "rear_delt",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi", "allmän hälsa"],
  },
  {
    id: "flat_dumbbell_fly",
    name: "Hantelflyes på bänk",
    requiredEquipment: ["bench", "dumbbells"],
    description:
      "Utförande: Ligg på bänk med lätt böjda armar, öppna kontrollerat ut åt sidorna och för ihop igen. Mål: Träna bröst med fokus på stretch och kontroll.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 60,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts"],
    variantGroup: "chest_fly",
    riskLevel: "medium",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "dumbbell_step_up",
    name: "Step-up med hantlar",
    requiredEquipment: ["bench", "dumbbells"],
    description:
      "Utförande: Kliv upp på bänk med hantlar i händerna och gå kontrollerat ned. Mål: Träna benstyrka, säte och balans.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "lunge",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["core", "hamstrings"],
    variantGroup: "step_up",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "dumbbell_curl",
    name: "Bicepscurl med hantlar",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Böj i armbågarna med kontrollerad rörelse och sänk långsamt ned. Mål: Träna biceps och armbågsflexorer.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    variantGroup: "biceps_curl",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "hammer_curl",
    name: "Hammercurl med hantlar",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Lyft hantlarna med neutral greppställning och sänk kontrollerat. Mål: Träna biceps, brachialis och underarmar.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["biceps", "forearms"],
    secondaryMuscles: ["brachialis"],
    variantGroup: "biceps_curl",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "overhead_triceps_extension",
    name: "Tricepsextension över huvud med hantel",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Håll en hantel över huvudet, böj i armbågarna och sträck ut igen. Mål: Träna triceps med lång muskelbana.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "vertical_push",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["shoulders"],
    variantGroup: "triceps_isolation",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "dumbbell_calf_raise",
    name: "Vadpress med hantlar",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Res dig upp på tå med hantlar i händerna och sänk kontrollerat ned igen. Mål: Träna vader och fotledsstyrka.",
    defaultSets: 3,
    defaultReps: 15,
    defaultRest: 30,
    movementPattern: "carry",
    primaryMuscles: ["calves"],
    secondaryMuscles: ["feet"],
    variantGroup: "calf_raise",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi", "allmän hälsa"],
  },
  {
    id: "dumbbell_farmer_carry",
    name: "Farmer carry med hantlar",
    requiredEquipment: ["dumbbells"],
    description:
      "Utförande: Gå med tunga hantlar i händerna med upprätt hållning och spänd bål. Mål: Träna grepp, bål och helkroppsstabilitet.",
    defaultSets: 3,
    defaultDuration: 40,
    defaultRest: 45,
    movementPattern: "carry",
    primaryMuscles: ["forearms", "traps", "core"],
    secondaryMuscles: ["glutes"],
    variantGroup: "carry",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "allmän hälsa"],
  },

  // =========================
  // BARBELL / RACK
  // =========================
  {
    id: "barbell_bench_press",
    name: "Bänkpress med skivstång",
    requiredEquipment: ["bench", "barbell"],
    description:
      "Utförande: Sänk skivstången kontrollerat till bröstet och pressa den uppåt igen. Mål: Bygga styrka i bröst, axlar och triceps.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 120,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest", "triceps", "front_delts"],
    secondaryMuscles: ["shoulders"],
    variantGroup: "bench_press",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "incline_barbell_bench_press",
    name: "Lutande bänkpress med skivstång",
    requiredEquipment: ["bench", "barbell"],
    description:
      "Utförande: Pressa skivstången från lutande bänk med kontrollerad bana och stabila skuldror. Mål: Träna övre bröst, axlar och triceps.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 120,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest", "front_delts", "triceps"],
    secondaryMuscles: ["shoulders"],
    variantGroup: "bench_press",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "barbell_back_squat",
    name: "Knäböj med skivstång",
    requiredEquipment: ["barbell", "rack"],
    description:
      "Utförande: Ha stången stabilt på övre ryggen, sitt ned kontrollerat och res dig kraftfullt upp. Mål: Träna benstyrka, säte och bål.",
    defaultSets: 3,
    defaultReps: 6,
    defaultRest: 120,
    movementPattern: "squat",
    primaryMuscles: ["quads", "glutes", "core"],
    secondaryMuscles: ["adductors"],
    variantGroup: "squat",
    riskLevel: "high",
    primaryGoalTags: ["styrka"],
  },
  {
    id: "barbell_front_squat",
    name: "Front squat med skivstång",
    requiredEquipment: ["barbell", "rack"],
    description:
      "Utförande: Håll stången framtill på axlarna, sitt ned kontrollerat och res dig upp med upprätt bröst. Mål: Träna quadriceps, bål och benstyrka.",
    defaultSets: 3,
    defaultReps: 6,
    defaultRest: 120,
    movementPattern: "squat",
    primaryMuscles: ["quads", "core"],
    secondaryMuscles: ["glutes", "upper_back"],
    variantGroup: "squat",
    riskLevel: "high",
    primaryGoalTags: ["styrka"],
  },
  {
    id: "barbell_row",
    name: "Skivstångsrodd",
    requiredEquipment: ["barbell"],
    description:
      "Utförande: Fäll i höften, håll ryggen stabil och dra stången mot nedre delen av bröstkorgen. Mål: Träna rygg, baksida axlar och greppstyrka.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 90,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["lats", "upper_back", "rear_delts"],
    secondaryMuscles: ["biceps", "forearms"],
    variantGroup: "row",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "romanian_deadlift_barbell",
    name: "Rumänska marklyft med skivstång",
    requiredEquipment: ["barbell"],
    description:
      "Utförande: Fäll i höften med neutral rygg och sänk stången längs benen innan du reser dig. Mål: Träna hamstrings, säte och höftstyrka.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 90,
    movementPattern: "hinge",
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["lower_back"],
    variantGroup: "romanian_deadlift",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "conventional_deadlift",
    name: "Marklyft med skivstång",
    requiredEquipment: ["barbell"],
    description:
      "Utförande: Lyft stången från golvet med stabil rygg, kraft från ben och höft och kontrollerad återgång. Mål: Träna hela bakre kedjan och greppstyrka.",
    defaultSets: 3,
    defaultReps: 5,
    defaultRest: 150,
    movementPattern: "hinge",
    primaryMuscles: ["glutes", "hamstrings", "lower_back"],
    secondaryMuscles: ["traps", "forearms"],
    variantGroup: "deadlift",
    riskLevel: "high",
    primaryGoalTags: ["styrka"],
  },
  {
    id: "barbell_overhead_press",
    name: "Axelpress med skivstång",
    requiredEquipment: ["barbell"],
    description:
      "Utförande: Pressa stången över huvudet med spänd bål och kontrollerad bana. Mål: Träna axlar, triceps och pressstyrka.",
    defaultSets: 3,
    defaultReps: 6,
    defaultRest: 90,
    movementPattern: "vertical_push",
    primaryMuscles: ["shoulders", "triceps"],
    secondaryMuscles: ["core", "front_delts"],
    variantGroup: "overhead_press",
    riskLevel: "medium",
    primaryGoalTags: ["styrka"],
  },
  {
    id: "barbell_hip_thrust",
    name: "Hip thrust med skivstång",
    requiredEquipment: ["barbell", "bench"],
    description:
      "Utförande: Luta övre ryggen mot bänk, pressa höften uppåt med stång över höfterna och sänk kontrollerat. Mål: Träna säte och höftstyrka.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 75,
    movementPattern: "hinge",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings", "core"],
    variantGroup: "hip_thrust",
    riskLevel: "medium",
    primaryGoalTags: ["hypertrofi", "styrka"],
  },
  {
    id: "barbell_walking_lunge",
    name: "Gående utfall med skivstång",
    requiredEquipment: ["barbell"],
    description:
      "Utförande: Gå framåt i kontrollerade utfall med stången stabil på ryggen. Mål: Träna ben, säte och balans under belastning.",
    defaultSets: 3,
    defaultReps: 8,
    defaultRest: 75,
    movementPattern: "lunge",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["core", "hamstrings"],
    variantGroup: "lunge",
    riskLevel: "medium",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },

  // =========================
  // PULL-UP BAR
  // =========================
  {
    id: "pull_up",
    name: "Pull-ups",
    requiredEquipment: ["pullup_bar"],
    description:
      "Utförande: Dra kroppen upp tills hakan passerar stången och sänk kontrollerat. Mål: Träna lats, övre rygg och biceps.",
    defaultSets: 3,
    defaultReps: 6,
    defaultRest: 90,
    movementPattern: "vertical_pull",
    primaryMuscles: ["lats", "biceps", "upper_back"],
    secondaryMuscles: ["forearms", "core"],
    variantGroup: "pull_up",
    riskLevel: "medium",
    primaryGoalTags: ["styrka"],
  },
  {
    id: "chin_up",
    name: "Chin-ups",
    requiredEquipment: ["pullup_bar"],
    description:
      "Utförande: Dra kroppen upp med supinerat grepp och sänk långsamt ned igen. Mål: Träna rygg och biceps med större fokus på armbågsflexion.",
    defaultSets: 3,
    defaultReps: 6,
    defaultRest: 90,
    movementPattern: "vertical_pull",
    primaryMuscles: ["biceps", "lats"],
    secondaryMuscles: ["upper_back", "forearms"],
    variantGroup: "pull_up",
    riskLevel: "medium",
    primaryGoalTags: ["styrka"],
  },
  {
    id: "hanging_knee_raise",
    name: "Hängande knälyft",
    requiredEquipment: ["pullup_bar"],
    description:
      "Utförande: Häng i stången och dra knäna kontrollerat upp mot bröstet utan att gunga. Mål: Träna bål och höftböjare.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 45,
    movementPattern: "core",
    primaryMuscles: ["core", "hip_flexors"],
    secondaryMuscles: ["forearms"],
    variantGroup: "hanging_core",
    riskLevel: "medium",
    primaryGoalTags: ["allmän hälsa", "uthållighet"],
  },

  // =========================
  // CABLE MACHINE
  // =========================
  {
    id: "lat_pulldown",
    name: "Latsdrag i kabel",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: Dra handtaget eller stången ned mot övre bröstet med sänkta skuldror. Mål: Träna lats och övre rygg.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "vertical_pull",
    primaryMuscles: ["lats", "upper_back"],
    secondaryMuscles: ["biceps"],
    variantGroup: "lat_pulldown",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "seated_cable_row",
    name: "Sittande kabelrodd",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: Dra handtaget mot magen med upprätt hållning och kontrollerad skulderrörelse. Mål: Träna rygg, lats och biceps.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 60,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["lats", "upper_back"],
    secondaryMuscles: ["biceps", "rear_delts"],
    variantGroup: "row",
    riskLevel: "low",
    primaryGoalTags: ["styrka", "hypertrofi"],
  },
  {
    id: "cable_chest_press",
    name: "Bröstpress i kabel",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: Pressa handtagen framåt i en kontrollerad bana med stabil bål. Mål: Träna bröst, axlar och triceps.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 60,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest", "triceps"],
    secondaryMuscles: ["front_delts", "core"],
    variantGroup: "bench_press",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi", "allmän hälsa"],
  },
  {
    id: "cable_fly",
    name: "Cable flyes",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: För handtagen framåt i en mjuk båge med lätt böjda armbågar och kontrollerad återgång. Mål: Träna bröst med jämn belastning.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "horizontal_push",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts"],
    variantGroup: "chest_fly",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "cable_face_pull",
    name: "Face pull i kabel",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: Dra repet mot ansiktet med höga armbågar och aktiv skulderrörelse. Mål: Träna baksida axlar, övre rygg och skulderhälsa.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["rear_delts", "upper_back"],
    secondaryMuscles: ["traps", "external_rotators"],
    variantGroup: "rear_delt",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "hypertrofi"],
  },
  {
    id: "cable_lateral_raise",
    name: "Sidolyft i kabel",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: Lyft kabelhandtaget ut åt sidan med lätt böjd armbåge och sänk kontrollerat. Mål: Träna utsida axlar med jämn belastning.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "vertical_push",
    primaryMuscles: ["side_delts"],
    secondaryMuscles: ["shoulders"],
    variantGroup: "lateral_raise",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "cable_triceps_pushdown",
    name: "Triceps pushdown i kabel",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: Pressa ned handtaget med armbågarna nära kroppen och kontrollera vägen upp. Mål: Träna triceps isolerat.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "vertical_push",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["forearms"],
    variantGroup: "triceps_isolation",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "cable_biceps_curl",
    name: "Bicepscurl i kabel",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: Böj i armbågarna mot kabelmotstånd och sänk långsamt ned igen. Mål: Träna biceps med jämn belastning genom hela rörelsen.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 45,
    movementPattern: "horizontal_pull",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    variantGroup: "biceps_curl",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi"],
  },
  {
    id: "cable_crunch",
    name: "Cable crunch",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: Böj bålen kontrollerat mot motståndet utan att dra med armarna. Mål: Träna raka bukmuskeln och bålstyrka.",
    defaultSets: 3,
    defaultReps: 12,
    defaultRest: 30,
    movementPattern: "core",
    primaryMuscles: ["core"],
    secondaryMuscles: ["obliques"],
    variantGroup: "crunch",
    riskLevel: "low",
    primaryGoalTags: ["hypertrofi", "allmän hälsa"],
  },
  {
    id: "pallof_press",
    name: "Pallof press",
    requiredEquipment: ["cable_machine"],
    description:
      "Utförande: Pressa handtaget rakt fram från bröstet och motstå rotation i bålen. Mål: Träna antirotation och bålstabilitet.",
    defaultSets: 3,
    defaultReps: 10,
    defaultRest: 30,
    movementPattern: "core",
    primaryMuscles: ["core", "obliques"],
    secondaryMuscles: ["glutes"],
    variantGroup: "anti_rotation",
    riskLevel: "low",
    primaryGoalTags: ["allmän hälsa", "rehab"],
  },
];

const DIRECT_EQUIPMENT_SYNONYMS: Record<string, EquipmentId> = {
  bänk: "bench",
  träningsbänk: "bench",
  justerbar_bänk: "bench",
  bench: "bench",
  flat_bench: "bench",
  incline_bench: "bench",

  hantel: "dumbbells",
  hantlar: "dumbbells",
  dumbbell: "dumbbells",
  dumbbells: "dumbbells",
  hantelset: "dumbbells",

  skivstång: "barbell",
  skivstang: "barbell",
  barbell: "barbell",
  olympic_barbell: "barbell",
  olympisk_skivstång: "barbell",

  rack: "rack",
  ställning: "rack",
  stallning: "rack",
  squat_rack: "rack",
  power_rack: "rack",
  squat_stand: "rack",

  chinsstång: "pullup_bar",
  chinsstang: "pullup_bar",
  pullupstång: "pullup_bar",
  pullupstang: "pullup_bar",
  pullup_bar: "pullup_bar",
  chinup_bar: "pullup_bar",

  kabel: "cable_machine",
  kabelmaskin: "cable_machine",
  cable: "cable_machine",
  cable_machine: "cable_machine",
  cable_station: "cable_machine",
  cable_crossover: "cable_machine",

ringar: "rings",
romerska_ringar: "rings",
"romerska ringar": "rings",
rings: "rings",
gymnastic_rings: "rings",
"gymnastic rings": "rings",
gymnastikringar: "rings",

  kroppsvikt: "bodyweight",
  kroppsviktsövningar: "bodyweight",
  bodyweight: "bodyweight",
};

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectEquipmentFromText(value: string): EquipmentId[] {
  const normalized = normalizeText(value);
  const detected = new Set<EquipmentId>();

  if (!normalized) {
    return [];
  }

  const direct = DIRECT_EQUIPMENT_SYNONYMS[normalized];
  if (direct) {
    detected.add(direct);
  }

  if (
    normalized.includes("hantel") ||
    normalized.includes("dumbbell") ||
    normalized.includes("hex dumbbell")
  ) {
    detected.add("dumbbells");
  }

  if (
    normalized.includes("bank") ||
    normalized.includes("bench") ||
    normalized.includes("flat bench") ||
    normalized.includes("incline bench")
  ) {
    detected.add("bench");
  }

  if (
    normalized.includes("skivstang") ||
    normalized.includes("barbell") ||
    normalized.includes("olympic bar")
  ) {
    detected.add("barbell");
  }

  if (
    normalized.includes("rack") ||
    normalized.includes("stallning") ||
    normalized.includes("squat stand") ||
    normalized.includes("power rack")
  ) {
    detected.add("rack");
  }

  if (
    normalized.includes("chin") ||
    normalized.includes("pull up") ||
    normalized.includes("pullup") ||
    normalized.includes("pull-up")
  ) {
    detected.add("pullup_bar");
  }

  if (
    normalized.includes("kabel") ||
    normalized.includes("cable") ||
    normalized.includes("cross over") ||
    normalized.includes("crossover")
  ) {
    detected.add("cable_machine");
  }

  if (
    normalized.includes("ringar") ||
    normalized.includes("romerska ringar") ||
    normalized.includes("gymnastic rings") ||
    normalized.includes("gymnastikringar") ||
    normalized.includes("rings")
  ) {
    detected.add("rings");
  }

  if (
    normalized.includes("kroppsvikt") ||
    normalized.includes("bodyweight") ||
    normalized.includes("utan utrustning")
  ) {
    detected.add("bodyweight");
  }

  return Array.from(detected);
}

export function normalizeEquipmentList(input: string[]): EquipmentId[] {
  const normalized = new Set<EquipmentId>();

  for (const rawItem of input) {
    if (typeof rawItem !== "string") continue;

    for (const detected of detectEquipmentFromText(rawItem)) {
      normalized.add(detected);
    }
  }

  // Kroppsvikt ska alltid vara möjligt som fallback och som medvetet "gym".
  normalized.add("bodyweight");

  return Array.from(normalized);
}

export function getAvailableExercises(
  availableEquipment: string[]
): ExerciseCatalogItem[] {
  const normalizedEquipment = new Set(normalizeEquipmentList(availableEquipment));

  return EXERCISE_CATALOG.filter((exercise) =>
    exercise.requiredEquipment.every((item) => normalizedEquipment.has(item))
  );
}

export function getExerciseById(exerciseId: string) {
  return EXERCISE_CATALOG.find((exercise) => exercise.id === exerciseId) ?? null;
}