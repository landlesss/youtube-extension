import type { Cue } from "../types";

export function toBilingualCues(original: Cue[], translated: Cue[]): Cue[] {
  return original.map((cue, i) => ({
    ...cue,
    text: translated[i] ? `${cue.text}\n${translated[i].text}` : cue.text,
  }));
}
