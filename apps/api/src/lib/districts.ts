// Munich's 25 Stadtbezirke as the fog-of-war game board.
// A district is "visited" when the user genuinely showed up there:
// a café check-in, a completed meeting at a café, or an RSVP'd event
// whose location names the district. Centroids are approximate — we
// only need nearest-centroid matching, not cadastral precision.

export type District = {
  key: string
  name: string
  lat: number
  lng: number
  aliases: string[]
}

export const MUNICH_DISTRICTS: District[] = [
  { key: 'altstadt-lehel', name: 'Altstadt-Lehel', lat: 48.1374, lng: 11.5755, aliases: ['altstadt', 'lehel', 'marienplatz', 'odeonsplatz', 'viktualienmarkt'] },
  { key: 'ludwigsvorstadt-isarvorstadt', name: 'Ludwigsvorstadt-Isarvorstadt', lat: 48.129, lng: 11.562, aliases: ['ludwigsvorstadt', 'isarvorstadt', 'glockenbach', 'gärtnerplatz', 'gaertnerplatz', 'hauptbahnhof'] },
  { key: 'maxvorstadt', name: 'Maxvorstadt', lat: 48.1517, lng: 11.5675, aliases: ['maxvorstadt', 'königsplatz', 'koenigsplatz', 'tum', 'lmu', 'pinakothek'] },
  { key: 'schwabing-west', name: 'Schwabing-West', lat: 48.1636, lng: 11.5669, aliases: ['schwabing-west', 'schwabing west', 'elisabethmarkt'] },
  { key: 'au-haidhausen', name: 'Au-Haidhausen', lat: 48.1288, lng: 11.5934, aliases: ['haidhausen', 'au ', 'gasteig', 'ostbahnhof', 'werksviertel'] },
  { key: 'sendling', name: 'Sendling', lat: 48.1152, lng: 11.5385, aliases: ['sendling', 'grossmarkthalle', 'großmarkthalle'] },
  { key: 'sendling-westpark', name: 'Sendling-Westpark', lat: 48.1201, lng: 11.5192, aliases: ['westpark'] },
  { key: 'schwanthalerhoehe', name: 'Schwanthalerhöhe', lat: 48.1352, lng: 11.5394, aliases: ['schwanthalerhöhe', 'schwanthalerhoehe', 'westend', 'theresienwiese', 'oktoberfest', 'wiesn'] },
  { key: 'neuhausen-nymphenburg', name: 'Neuhausen-Nymphenburg', lat: 48.154, lng: 11.5216, aliases: ['neuhausen', 'nymphenburg', 'rotkreuzplatz', 'hirschgarten'] },
  { key: 'moosach', name: 'Moosach', lat: 48.1795, lng: 11.509, aliases: ['moosach'] },
  { key: 'milbertshofen-am-hart', name: 'Milbertshofen-Am Hart', lat: 48.1917, lng: 11.571, aliases: ['milbertshofen', 'am hart', 'olympiapark', 'bmw'] },
  { key: 'schwabing-freimann', name: 'Schwabing-Freimann', lat: 48.1745, lng: 11.6, aliases: ['schwabing', 'freimann', 'englischer garten', 'münchner freiheit', 'muenchner freiheit'] },
  { key: 'bogenhausen', name: 'Bogenhausen', lat: 48.153, lng: 11.636, aliases: ['bogenhausen', 'arabellapark'] },
  { key: 'berg-am-laim', name: 'Berg am Laim', lat: 48.125, lng: 11.633, aliases: ['berg am laim'] },
  { key: 'trudering-riem', name: 'Trudering-Riem', lat: 48.123, lng: 11.656, aliases: ['trudering', 'riem', 'messestadt', 'messe münchen', 'messe muenchen'] },
  { key: 'ramersdorf-perlach', name: 'Ramersdorf-Perlach', lat: 48.099, lng: 11.622, aliases: ['ramersdorf', 'perlach', 'neuperlach'] },
  { key: 'obergiesing-fasangarten', name: 'Obergiesing-Fasangarten', lat: 48.103, lng: 11.59, aliases: ['obergiesing', 'fasangarten'] },
  { key: 'untergiesing-harlaching', name: 'Untergiesing-Harlaching', lat: 48.098, lng: 11.572, aliases: ['giesing', 'untergiesing', 'harlaching', 'tierpark', 'hellabrunn'] },
  { key: 'thalkirchen-solln', name: 'Thalkirchen-Obersendling-Solln', lat: 48.079, lng: 11.523, aliases: ['thalkirchen', 'obersendling', 'forstenried', 'fürstenried', 'fuerstenried', 'solln'] },
  { key: 'hadern', name: 'Hadern', lat: 48.114, lng: 11.484, aliases: ['hadern', 'grosshadern', 'großhadern', 'klinikum'] },
  { key: 'pasing-obermenzing', name: 'Pasing-Obermenzing', lat: 48.144, lng: 11.462, aliases: ['pasing', 'obermenzing'] },
  { key: 'aubing', name: 'Aubing-Lochhausen-Langwied', lat: 48.156, lng: 11.409, aliases: ['aubing', 'lochhausen', 'langwied', 'freiham'] },
  { key: 'allach-untermenzing', name: 'Allach-Untermenzing', lat: 48.19, lng: 11.465, aliases: ['allach', 'untermenzing'] },
  { key: 'feldmoching-hasenbergl', name: 'Feldmoching-Hasenbergl', lat: 48.211, lng: 11.545, aliases: ['feldmoching', 'hasenbergl'] },
  { key: 'laim', name: 'Laim', lat: 48.133, lng: 11.503, aliases: ['laim'] },
]

// Munich bounding box sanity check so a café in Berlin doesn't clear a district.
const MUNICH_BOUNDS = { latMin: 48.0, latMax: 48.28, lngMin: 11.3, lngMax: 11.78 }

export function districtForPoint(lat: number, lng: number): District | null {
  if (lat < MUNICH_BOUNDS.latMin || lat > MUNICH_BOUNDS.latMax || lng < MUNICH_BOUNDS.lngMin || lng > MUNICH_BOUNDS.lngMax) {
    return null
  }
  let best: District | null = null
  let bestD = Infinity
  for (const d of MUNICH_DISTRICTS) {
    const dy = d.lat - lat
    const dx = (d.lng - lng) * Math.cos((lat * Math.PI) / 180)
    const dist = dy * dy + dx * dx
    if (dist < bestD) {
      bestD = dist
      best = d
    }
  }
  return best
}

export function districtForText(text: string | null | undefined): District | null {
  if (!text) return null
  const t = ` ${text.toLowerCase()} `
  for (const d of MUNICH_DISTRICTS) {
    if (t.includes(d.name.toLowerCase())) return d
    for (const a of d.aliases) {
      if (t.includes(a)) return d
    }
  }
  return null
}
