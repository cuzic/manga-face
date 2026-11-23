// The conformance check: svg-diagram's comic() runs every manifest through its loadCharacter (shape, anchors, licence, the fragment whitelist) and throws on a bad one.
// loadCharacter itself is not a public export, so this is the public way to reach it.
import {comic} from 'svg-diagram';
import type {CharacterManifest} from 'svg-diagram';

/** Throws (with loadCharacter's message) if svg-diagram would refuse the manifest. */
export function assertLoads(m: CharacterManifest): void {
  comic({version: 1, title: 'conformance', layout: '1x2', cast: {me: {name: 'me', asset: m.id}}, panels: [
    {id: 'p1', stage: [{who: 'me', at: 'left', expression: 'neutral'}], dialogue: []},
    {id: 'p2', stage: [{who: 'me', at: 'left', expression: 'neutral'}], dialogue: []},
  ]}, {characters: {[m.id]: m}});
}
