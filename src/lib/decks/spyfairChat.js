// Location-agnostic chat content for the solo SPYFAIR chat feed (bots vs. a human
// spy, or bots questioning a human non-spy). Paired with src/lib/partyBots.js,
// which fills the {role}/{name} slots.
//
// CRITICAL: non-spy lines may hint the shared location ONLY through the {role}
// slot (a role belongs to exactly one SPYFAIR_LOCATIONS entry) — never by naming
// the location itself. No template in this file may contain the literal text of
// any SPYFAIR_LOCATIONS[i].name, case-insensitive; spyfairChat.test.js enforces
// this across every array below.

export const NON_SPY_STATEMENT_TEMPLATES = [
  'BUSY SHIFT FOR A {role} TODAY, HONESTLY.',
  'THE {role} DOES ALL THE REAL WORK AROUND HERE.',
  'AS THE {role}, I SEE EVERYTHING THAT GOES ON.',
  'BEING A {role} IS NOT AS GLAMOROUS AS IT SOUNDS.',
  "MY FEET ARE KILLING ME — {role} LIFE FOR YOU.",
  'NOBODY APPRECIATES A GOOD {role} UNTIL SOMETHING GOES WRONG.',
  "IF YOU NEED ANYTHING, JUST ASK THE {role}. THAT'S ME.",
  'TRAINING TO BE A {role} TOOK LONGER THAN YOU WOULD THINK.',
  'SOME DAYS I WISH I WAS NOT THE {role} AROUND HERE.',
  'THE {role} GIG PAYS THE BILLS, CAN NOT COMPLAIN.',
  "PEOPLE ALWAYS ASSUME THEY KNOW WHAT A {role} DOES. THEY DO NOT.",
]

export const SPY_STATEMENT_TEMPLATES = [
  'YEAH... PRETTY NORMAL DAY SO FAR.',
  'HONESTLY? JUST TRYING TO KEEP UP.',
  "CAN'T COMPLAIN, SAME OLD SAME OLD.",
  "IT'S BEEN A WEIRD ONE, NOT GONNA LIE.",
  'OH YOU KNOW, JUST DOING MY THING.',
  'BUSY BUSY. ASK ME LATER.',
  "I'D RATHER NOT GET INTO IT RIGHT NOW.",
]

export const PROMPT_TEMPLATES = [
  'HEY {name}, WHAT DO YOU ACTUALLY DO HERE?',
  '{name}, DESCRIBE YOUR TYPICAL DAY IN ONE LINE.',
  "QUICK ONE, {name} — WHO'S YOUR BOSS AROUND HERE?",
  "{name}, WHAT'S THE WORST PART OF YOUR JOB?",
  'SO {name}, HOW LONG HAVE YOU BEEN DOING THIS?',
  '{name}, WHAT WOULD I SEE IF I WALKED IN RIGHT NOW?',
]

export const SPY_REPLY_STYLES = [
  {
    id: 'vague',
    label: 'STAY VAGUE',
    render: () => "I'D RATHER NOT SAY TOO MUCH, YOU KNOW?",
  },
  {
    id: 'deflect',
    label: 'DEFLECT',
    render: (ctx) => `GOOD QUESTION, ${ctx.askerName} — WHAT'S YOUR ANGLE HERE?`,
  },
  {
    id: 'gamble',
    label: 'CONFIDENT GUESS',
    render: (ctx) => (ctx.roleWord
      ? `EASY. I'M BASICALLY THE ${ctx.roleWord.toUpperCase()} OF THIS PLACE.`
      : 'EASY. I PRETTY MUCH RUN THIS PLACE.'),
  },
]
