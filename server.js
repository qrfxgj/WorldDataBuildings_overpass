const fetch = require('node-fetch');
const express = require('express');
const app = express();

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
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
          'User-Agent': 'Mozilla/5.0 (compatible; BuildingProxy/1.0)',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 22000,
      });

      const text = await response.text();
      console.log(`[${endpoint}] status: ${response.status}, start: ${text.slice(0, 60)}`);

      if (!response.ok) {
        console.warn(`${endpoint} zwrocil ${response.status}`);
        continue;
      }

      if (text.trim().startsWith('<')) {
        console.warn(`${endpoint} zwrocil HTML - pomijam`);
        continue;
      }

      let data;
      try { data = JSON.parse(text); } catch(e) {
        console.warn(`JSON parse error: ${e.message}`);
        continue;
      }

      const buildings = (data.elements || [])
        .filter(el => el.type === 'way' && el.center)
        .map(el => ({
          lat: el.center.lat,
          lon: el.center.lon,
          h: el.tags?.['building:levels']
            ? Math.max(6, parseInt(el.tags['building:levels']) * 4)
            : 20
        }));

      console.log(`OK: ${buildings.length} budynkow z ${endpoint}`);
      return buildings;

    } catch(e) {
      console.warn(`Blad ${endpoint}: ${e.message}`);
    }
  }
  return null;
}

app.get('/buildings', async (req, res) => {
  const { minLat, minLon, maxLat, maxLon } = req.query;

  if (!minLat || !minLon || !maxLat || !maxLon) {
    return res.status(400).json({ error: 'Brak parametrow' });
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

  try {
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

    console.log(`Zwracam ${buildings.length} budynkow lacznie`);
    res.json({ buildings });

  } catch(e) {
    console.error('Blad:', e.message);
    res.status(500).json({ error: e.message });
  }
});

setInterval(async () => {
  try {
    await fetch('https://worlddatabuildings-overpass.onrender.com/buildings?minLat=52.2&minLon=21.0&maxLat=52.3&maxLon=21.1');
    console.log('Keep-alive ping');
  } catch(e) {}
}, 14 * 60 * 1000);

app.listen(process.env.PORT || 3000, () => console.log('Proxy dziala'));
