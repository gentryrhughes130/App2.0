export type ResonXSkin = {
  id: string;
  name: string;
  accent: string;
  background: string;
  panel: string;
  text: string;
};

export const builtInSkins: ResonXSkin[] = [
  { id: 'ember', name: 'Ember', accent: '#F0A35B', background: '#131514', panel: '#1B1E1C', text: '#F7F3EA' },
  { id: 'arctic', name: 'Arctic', accent: '#83C5BE', background: '#101719', panel: '#182326', text: '#EAF6F4' },
  { id: 'mono', name: 'Mono', accent: '#E5E5E5', background: '#111111', panel: '#202020', text: '#FFFFFF' },
];

export function parseSkin(value: unknown): ResonXSkin | null {
  if (!value || typeof value !== 'object') return null;
  const skin = value as Partial<ResonXSkin>;
  if (![skin.id, skin.name, skin.accent, skin.background, skin.panel, skin.text].every((item) => typeof item === 'string')) return null;
  return skin as ResonXSkin;
}

export async function downloadSkin(url: string): Promise<ResonXSkin> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Skin download failed: ${response.status}`);
  const skin = parseSkin(await response.json());
  if (!skin) throw new Error('Downloaded skin has an invalid ResonX format');
  return skin;
}
