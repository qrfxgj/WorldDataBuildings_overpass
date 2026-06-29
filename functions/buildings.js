const ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function queryOverpass(minLat, minLon, maxLat, maxLon) {
  const query = `[out:json][timeout:20];way["building"](${minLat},${minLon},${maxLat},${maxLon});out center;`;

  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 OverpassProxy/1.0',
        },
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) continue;

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { continue; }

      return (data.elements || [])
        .filter(el => el.type === 'way' && el.center)
        .map(el => ({
          lat: el.center.lat,
          lon: el.center.lon,
          h: el.tags?.['building:levels']
            ? Math.max(6, parseInt(el.tags['building:levels']) * 4)
            : 20
        }));

    } catch(e) {
      console.log(`Blad ${endpoint}: ${e.message}`);
    }
  }
  return null;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  const minLat = url.searchParams.get('minLat');
  const minLon = url.searchParams.get('minLon');
  const maxLat = url.searchParams.get('maxLat');
  const maxLon = url.searchParams.get('maxLon');

  if (!minLat || !minLon || !maxLat || !maxLon) {
    return new Response(JSON.stringify({ error: 'Brak parametrow' }), { status: 400 });
  }

  const lat0 = parseFloat(minLat);
  const lon0 = parseFloat(minLon);
  const lat1 = parseFloat(maxLat);
  const lon1 = parseFloat(maxLon);
  const latMid = (lat0 + lat1) / 2;
  const lonMid = (lon0 + lon1) / 2;

  const quarters = [
    [lat0, lon0, latMid, lonMid],
    [lat0, lonMid, latMid, lon1],
    [latMid, lon0, lat1, lonMid],
    [latMid, lonMid, lat1, lon1],
  ];

  const results = await Promise.all(
    quarters.map(([a, b, c, d]) => queryOverpass(a, b, c, d))
  );

  const seen = new Set();
  const buildings = [];

  for (const chunk of results) {
    if (!chunk) continue;
    for (const b of chunk) {
      const key = `${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;
      if (!seen.has(key)) {
        seen.add(key);
        buildings.push(b);
      }
    }
  }

  return new Response(JSON.stringify({ buildings }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
