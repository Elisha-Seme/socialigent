// Shared writing-style rules and post-processing to keep generated captions
// reading like a human wrote them. Two layers:
//  1. HUMAN_WRITING_RULES — injected into generation prompts (bans AI tells)
//  2. stripAiMarkers()    — deterministic cleanup of markers models still emit
//
// NOTE: supabase/functions/generate-drafts/index.ts (Deno) cannot import this
// file — it carries an inline copy. Keep both in sync when editing.

export const HUMAN_WRITING_RULES = `
WRITING STYLE — the post must read like a busy professional typed it themselves, not like AI. Follow ALL of these:
- NEVER use em dashes (—) or en dashes (–). Use a comma, a period, or a plain hyphen instead.
- Banned words/phrases: delve, unlock, unleash, leverage, elevate, empower, harness, foster, robust, seamless, game-changer, game changing, cutting-edge, transformative, revolutionize, navigate the landscape, in today's fast-paced world, in the ever-evolving, look no further, dive in, let's explore, here's the thing, let that sink in, read that again, the best part?, but here's the kicker.
- NEVER use the "It's not just X, it's Y" or "X isn't about Y. It's about Z." sentence pattern.
- No rhetorical-question hooks ("Ever wondered...?", "What if I told you...?"). Open with a concrete statement, observation, or short story instead.
- No engagement bait endings: no "Thoughts?", "Agree?", "Let me know in the comments", "Drop a 👇". End with a plain takeaway or a genuine, specific question.
- No emoji bullet lists (🚀 ✅ 💡 as bullets). At most 1 emoji in the whole post, or none.
- No "Punchy. One. Word. Sentences." and no three-part slogan patterns ("Faster. Smarter. Better.").
- Vary sentence length naturally. Use contractions (it's, don't, we're). Plain everyday words over corporate vocabulary.
- Be specific and concrete: real situations, numbers, examples. Cut empty filler sentences that could apply to any company.
- Hashtags: 2-3 maximum, specific to the topic (not #Success #Motivation #Growth), placed on the last line.`

const MARKER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\s*—\s*/g, ' - '],        // em dash → plain hyphen
  [/(?<=\d)\s*–\s*(?=\d)/g, '-'], // en dash in ranges (9–5 → 9-5)
  [/\s*–\s*/g, ' - '],        // remaining en dashes
  [/[“”]/g, '"'],   // curly double quotes
  [/[‘’]/g, "'"],   // curly single quotes / apostrophes
  [/…/g, '...'],         // ellipsis character
]

export function stripAiMarkers(text: string): string {
  let out = text
  for (const [pattern, replacement] of MARKER_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out
}
