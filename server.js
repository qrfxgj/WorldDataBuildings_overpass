const express = require('express');
const app = express();

const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

app.get('/buildings', async (req, res) => {
  const { minLat, minLon, maxLat, maxLon } = req.query;

  if (!minLat || !minLon || !maxLat || !maxLon) {
    return res.status(400).json({ error: 'Brak parametrów' });
  }

  const query = `[out:json][timeout:25];way["building"](${minLat},${minLon},${maxLat},${maxLon});out center;`;

  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 OverpassProxy/1.0',
        },
        signal: controller.signal
      });

      const text = await response.text();
      console.log(`[${endpoint}] status: ${response.status}, poczatek odpowiedzi: ${text.slice(0, 100)}`);

      if (!response.ok) {
        console.warn(`Endpoint ${endpoint} zwrocil ${response.status}`);
        continue;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch(e) {
        console.warn(`Nie JSON z ${endpoint}:`, text.slice(0, 200));
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

      console.log(`Zwracam ${buildings.length} budynkow z ${endpoint}`);
      return res.json({ buildings });

    } catch(e) {
      console.warn(`Blad dla ${endpoint}:`, e.message);
    } finally {
      clearTimeout(timeout);
    }
  }

  res.status(500).json({ error: 'Wszystkie endpointy zawiodly' });
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy dziala'));
