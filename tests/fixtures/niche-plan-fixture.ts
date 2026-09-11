import type { PlanData } from '../../src/plan-types'

/**
 * Issue 05 demo: a niche subject the durable tier cannot fully serve, so the
 * plan reaches off-list for the BBQ-specific resources. The deconstruction
 * still names every minimal effective unit (heat transfer, fire management,
 * meat selection, timing, presentation), every session is completable from
 * free materials alone, and there is at most one paid material — the same
 * gates as the well-served Python fixture. Sessions 6 and 11 remain the
 * consolidation slots.
 *
 * In ticket 04 mode this plan would have been refused at validation: every
 * BBQ-specific resource would have been rejected as off-list and the plan
 * would have come out thin. In ticket 05 mode each off-list anchor is held
 * to the higher bar — its page is fetched and confirmed to cover the
 * claimed concept before it is admitted.
 */
export const nicheFixturePlan: PlanData = {
  meta: {
    subject: 'Competition Barbecue Smoking',
    targetCapability: 'Turn in a full KCBS-style competition box that scores well',
    honestTarget:
      'Cook a competition-style spread of brisket, ribs, pork and chicken in a single weekend and turn it in on time',
    hoursPerDay: 3,
    currentLevel: 'Casual backyard griller',
    generatedAt: '2026-01-10T09:00:00.000Z',
  },
  scopeNote:
    'Targets the standard four-meat KCBS competition turn-in, not a specific regional style. Recipe is a starting point — judges reward execution, not novelty.',
  disssPreamble: {
    deconstruction:
      'Competition smoking breaks into: heat transfer and the stall, fire and airflow management, wood selection, meat selection and grading, trimming, rub chemistry, sauce strategy, timing and holding, and presentation. Named as the recurring units so every session can reference them: heat transfer, fire management, meat selection, rub chemistry, timing, presentation.',
    selectionRationale:
      'Selected the 20% that carries judging results: managing the stall on brisket, two-zone fire control, trimming to KCBS shape, and timing across four proteins so they hit the turn-in window together.',
    cutList:
      'Removed: regional sauce rivalries, charcoal-vs-gas debates beyond what affects the cook, and any single-recipe memorization. Cooks who can manage heat and timing can cook any style.',
    sequencingRationale:
      'Plan runs backwards from the turn-in moment: every session is justified by what it lets the cook do under the clock on cook day. Consolidation slots at positions 6 and 11 double as catch-up and a re-walk through the four-meat timeline.',
  },
  stakes: '',
  phases: [
    {
      title: 'Foundations',
      sessions: [1, 2, 3, 4, 5, 6],
    },
    {
      title: 'The four proteins',
      sessions: [7, 8, 9, 10, 11],
      outlierStory: {
        person: 'A backyard cook profiled by the BBQ Central Show',
        approach: 'Cooked a competition brisket on a kettle grill with one temperature probe and no controller',
        principle: 'Pit management is a feedback loop, not a recipe — read the meat, not the timer',
        citation: 'https://bbqcentralshow.com/season-12/episode-04',
      },
    },
    {
      title: 'Cook day and turn-in',
      sessions: [12, 13, 14],
    },
  ],
  sessions: [
    {
      number: 1,
      title: 'How a smoker actually cooks',
      artifactOneLiner: 'Explain on paper why convection, conduction and radiation each matter in an offset smoker',
      materials: [
        {
          title: 'Engineering Toolbox — Convection Heat Transfer',
          url: 'https://www.engineeringtoolbox.com/convective-heat-transfer-d_430.html',
          sourceType: 'preferred',
          estimatedDuration: 60,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:08:00.000Z' },
        },
        {
          title: 'Amazing Ribs — How an Offset Smoker Works',
          url: 'https://amazingribs.com/the-science-of-grilling-and-smoking/how-an-offset-smoker-works/',
          sourceType: 'off-list',
          estimatedDuration: 40,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:10:00.000Z' },
        },
      ],
      selfCheck: 'Can I name which heat-transfer mode dominates at the grate, the lid, and the smoke stream?',
      estimatedTime: 100,
      highFrequencyUnits: ['heat transfer', 'fire management'],
      encodingHook: 'A smoker is a chimney with meat beside it — every decision is about how much heat gets to the food and how fast.',
    },
    {
      number: 2,
      title: 'Two-zone and offset fire control',
      artifactOneLiner: 'Hold 225°F at the grate on an offset smoker for two hours without intervention',
      materials: [
        {
          title: 'Meathead at Amazing Ribs — Fire Management',
          url: 'https://amazingribs.com/technique-and-setup/the-science-of-grilling-and-smoking/fire-management/',
          sourceType: 'off-list',
          estimatedDuration: 50,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:13:00.000Z' },
        },
      ],
      selfCheck: 'Does my pit hold 225°F ±10°F for two hours after I stop touching it?',
      estimatedTime: 60,
      highFrequencyUnits: ['fire management', 'heat transfer'],
      encodingHook: 'Thin fuel, small vents, frequent small adjustments — the cheapest lever is the intake, not the chimney.',
    },
    {
      number: 3,
      title: 'Wood selection and smoke chemistry',
      artifactOneLiner: 'Choose a wood for brisket and justify it in two sentences',
      materials: [
        {
          title: 'USDA Forest Products Laboratory — Wood Smoke Chemistry',
          url: 'https://www.fpl.fs.usda.gov/documnts/fplgtr/fpl_gtr190.pdf',
          sourceType: 'preferred',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-status', checkedAt: '2026-01-10T09:16:00.000Z' },
        },
        {
          title: 'Amazing Ribs — Wood and Smoke Guide',
          url: 'https://amazingribs.com/technique-and-setup/the-science-of-grilling-and-smoking/wood-and-smoke/',
          sourceType: 'off-list',
          estimatedDuration: 35,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:18:00.000Z' },
        },
      ],
      selfCheck: 'Can I name the wood I will use for brisket and the flavor compound it adds?',
      estimatedTime: 65,
      highFrequencyUnits: ['fire management', 'rub chemistry'],
      encodingHook: 'Smoke flavor tops out around 180°F meat temperature — past that, you are making bark, not smoke.',
    },
    {
      number: 4,
      title: 'Reading the meat — temperature, probe placement and feel',
      artifactOneLiner: 'Probe three different cuts accurately and read tenderness by feel',
      materials: [
        {
          title: 'ThermoWorks — Probe Placement Guide',
          url: 'https://www.thermoworks.com/probe-placement',
          sourceType: 'off-list',
          estimatedDuration: 25,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:20:00.000Z' },
        },
        {
          title: 'Amazing Ribs — Probe Calibration',
          url: 'https://amazingribs.com/technique-and-setup/tools-and-equipment/thermometers/',
          sourceType: 'off-list',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:22:00.000Z' },
        },
      ],
      selfCheck: 'Can I place a probe so it sits in the thickest part of the muscle without touching bone or fat cap?',
      estimatedTime: 60,
      highFrequencyUnits: ['heat transfer', 'timing'],
      encodingHook: 'Probe perpendicular to the grain, through the thickest part, never in fat — the number is a proxy for tenderness, not tenderness itself.',
    },
    {
      number: 5,
      title: 'Trimming — the geometry that judges score',
      artifactOneLiner: 'Trim a brisket to KCBS competition shape without losing the point',
      materials: [
        {
          title: 'KCBS Rules — Beef Brisket',
          url: 'https://www.kcbs.us/rules.php',
          sourceType: 'off-list',
          estimatedDuration: 25,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:25:00.000Z' },
        },
        {
          title: 'Heim BBQ — Trimming a Competition Brisket',
          url: 'https://heimbbq.com/trimming-a-competition-brisket/',
          sourceType: 'off-list',
          estimatedDuration: 45,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:27:00.000Z' },
        },
      ],
      selfCheck: 'Does my trimmed brisket lay flat with a uniform 1/4-inch fat cap and no silver skin on the point?',
      estimatedTime: 75,
      highFrequencyUnits: ['meat selection', 'presentation'],
      encodingHook: 'Trim to what the judges will see in the box, not what the butcher saw on the counter.',
    },
    {
      number: 6,
      title: 'Catch-up and Spaced Review — Foundations',
      artifactOneLiner:
        'Catch up on missed foundations work and re-touch the heat-transfer, fire and trimming units from sessions 1–5',
      materials: [
        {
          title: 'Engineering Toolbox — Heat Transfer Overview',
          url: 'https://www.engineeringtoolbox.com/heat-transfer-d_430.html',
          sourceType: 'preferred',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-status', checkedAt: '2026-01-10T09:30:00.000Z' },
        },
        {
          title: 'Amazing Ribs — Pit Management',
          url: 'https://amazingribs.com/technique-and-setup/the-science-of-grilling-and-smoking/pit-management/',
          sourceType: 'off-list',
          estimatedDuration: 35,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:32:00.000Z' },
        },
      ],
      selfCheck:
        'Have I caught up on missed foundations work and re-read the most-used sections from sessions 1–5?',
      estimatedTime: 65,
      highFrequencyUnits: ['heat transfer', 'fire management', 'meat selection', 'timing'],
      consolidation: true,
    },
    {
      number: 7,
      title: 'Brisket — the stall and the wrap',
      artifactOneLiner: 'Pull a brisket at 203°F with a probe-slide tender and a dark mahogany bark',
      materials: [
        {
          title: 'Aaron Franklin — Brisket Tutorial',
          url: 'https://www.youtube.com/watch?v=tFT2k9a4-bris',
          sourceType: 'off-list',
          estimatedDuration: 50,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:35:00.000Z' },
        },
        {
          title: 'Heim BBQ — Brisket Cook Notes',
          url: 'https://heimbbq.com/brisket-cook-notes/',
          sourceType: 'off-list',
          estimatedDuration: 40,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:37:00.000Z' },
        },
      ],
      selfCheck: 'Does my finished brisket pass the probe slide and present a uniform bark in the turn-in box?',
      estimatedTime: 90,
      highFrequencyUnits: ['heat transfer', 'timing', 'presentation'],
      encodingHook: 'The stall is not a problem to solve — it is the bark-to-tender transition. Wrap to push through, not to rescue.',
    },
    {
      number: 8,
      title: 'Ribs — St. Louis cut, membrane, and bend',
      artifactOneLiner: 'Pull ribs that bend without cracking and show a clean bite',
      materials: [
        {
          title: 'KCBS Rules — Pork Ribs',
          url: 'https://www.kcbs.us/rules.php',
          sourceType: 'off-list',
          estimatedDuration: 15,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:40:00.000Z' },
        },
        {
          title: 'Smoking-Meat.com — 3-2-1 Rib Method',
          url: 'https://smoking-meat.com/3-2-1-method/',
          sourceType: 'off-list',
          estimatedDuration: 45,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:42:00.000Z' },
        },
      ],
      selfCheck: 'Do my ribs bend to 90 degrees without the surface cracking, and does the bite pull clean?',
      estimatedTime: 70,
      highFrequencyUnits: ['meat selection', 'timing', 'presentation'],
      encodingHook: 'Pull by feel — the bend test is faster than the temperature test and judges see the bite, not the number.',
    },
    {
      number: 9,
      title: 'Pork shoulder / pulled pork',
      artifactOneLiner: 'Pull a Boston butt that shreds cleanly with a dark bark and visible smoke ring',
      materials: [
        {
          title: 'Amazing Ribs — Pulled Pork',
          url: 'https://amazingribs.com/recipes/pork-recipes/pull-your-own-pulled-pork/',
          sourceType: 'off-list',
          estimatedDuration: 50,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:45:00.000Z' },
        },
      ],
      selfCheck: 'Does my pulled pork shred cleanly with a fork and keep a visible smoke ring through the bark?',
      estimatedTime: 60,
      highFrequencyUnits: ['meat selection', 'timing', 'rub chemistry'],
      encodingHook: 'A pork shoulder is a brisket forgiving — same stall, lower stakes, two-hour wider window.',
    },
    {
      number: 10,
      title: 'Chicken — skin, bite and the turn-in window',
      artifactOneLiner: 'Produce competition thigh meat with crispy skin and a juicy bite',
      materials: [
        {
          title: 'Heim BBQ — Competition Chicken',
          url: 'https://heimbbq.com/competition-chicken/',
          sourceType: 'off-list',
          estimatedDuration: 45,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:48:00.000Z' },
        },
      ],
      selfCheck: 'Does my turn-in chicken thigh have crispy skin, a clean bite, and no pink near the bone?',
      estimatedTime: 55,
      highFrequencyUnits: ['meat selection', 'timing', 'rub chemistry', 'presentation'],
      encodingHook: 'Chicken rewards precision: trim early, season under the skin, and pull at 175°F internal — past that you are drying it.',
    },
    {
      number: 11,
      title: 'Catch-up and Spaced Review — Proteins',
      artifactOneLiner:
        'Catch up on missed protein work and re-touch the four-meat timing units from sessions 7–10',
      materials: [
        {
          title: 'Smoking-Meat.com — Competition Calendar',
          url: 'https://smoking-meat.com/competition-calendar/',
          sourceType: 'off-list',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:51:00.000Z' },
        },
      ],
      selfCheck:
        'Have I caught up on missed protein work and re-read the most-used timing sections from sessions 7–10?',
      estimatedTime: 50,
      highFrequencyUnits: ['timing', 'meat selection', 'rub chemistry', 'presentation'],
      consolidation: true,
    },
    {
      number: 12,
      title: 'Holding and the holding box',
      artifactOneLiner: 'Hold brisket and pulled pork in a faux cambro at 160°F for two hours without losing bark',
      materials: [
        {
          title: 'Smoking-Meat.com — Faux Cambro Holding',
          url: 'https://smoking-meat.com/faux-cambro/',
          sourceType: 'off-list',
          estimatedDuration: 30,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:54:00.000Z' },
        },
      ],
      selfCheck: 'Does my held brisket come out of the cambro above 145°F with the bark still audible?',
      estimatedTime: 45,
      highFrequencyUnits: ['timing', 'heat transfer', 'presentation'],
      encodingHook: 'The cambro is part of the cook — a brisket held for an hour is not the same brisket that came off the pit.',
    },
    {
      number: 13,
      title: 'Building the turn-in box',
      artifactOneLiner: 'Assemble a KCBS-compliant box for brisket, ribs, pork and chicken',
      materials: [
        {
          title: 'KCBS Rules — Presentation and Garnish',
          url: 'https://www.kcbs.us/rules.php',
          sourceType: 'off-list',
          estimatedDuration: 20,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:57:00.000Z' },
        },
        {
          title: 'Heim BBQ — Turn-In Box Walkthrough',
          url: 'https://heimbbq.com/turn-in-box/',
          sourceType: 'off-list',
          estimatedDuration: 35,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T09:59:00.000Z' },
        },
      ],
      selfCheck: 'Does every box meet KCBS rules on garnish, uniformity and prohibited items?',
      estimatedTime: 65,
      highFrequencyUnits: ['presentation', 'timing', 'meat selection'],
      encodingHook: 'Uniformity scores higher than beauty — six identical pieces outscore six beautiful but mismatched ones.',
    },
    {
      number: 14,
      title: 'Cook day — full competition run-through',
      artifactOneLiner: 'Run a four-protein cook on a single day and turn in on time at all four windows',
      materials: [
        {
          title: 'Aaron Franklin — Competition Day Walkthrough',
          url: 'https://aaron-franklin.com/competition-day',
          sourceType: 'off-list',
          estimatedDuration: 60,
          paid: false,
          verification: { status: 'verified-by-content', checkedAt: '2026-01-10T10:01:00.000Z' },
        },
        {
          title: 'Meathead at Amazing Ribs — The Whole Hog Cook',
          url: 'https://amazingribs.com/technique-and-setup/the-science-of-grilling-and-smoking/whole-hog-cook/',
          sourceType: 'off-list',
          estimatedDuration: 50,
          paid: false,
          verification: { status: 'replaced-after-failure', checkedAt: '2026-01-10T10:03:00.000Z' },
        },
      ],
      selfCheck: 'Did I hit all four turn-in windows with each protein at the right internal temperature and presentation?',
      estimatedTime: 120,
      highFrequencyUnits: ['timing', 'heat transfer', 'fire management', 'presentation', 'meat selection'],
      encodingHook: 'Cook day is a clock problem with a fire problem layered on — write the timeline first, then solve the pit.',
    },
  ],
}