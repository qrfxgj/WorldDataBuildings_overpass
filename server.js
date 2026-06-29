const express = require('express');
const app = express();

app.get('/buildings', async (req, res) => {
  const { minLat, minLon, maxLat, maxLon } = req.query;
  const query = `[out:json][timeout:25];way["building"](${minLat},${minLon},${maxLat},${maxLon});out center;`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28000);

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal
    });
    const data = await response.json();
    const buildings = (data.elements || [])
      .filter(el => el.type === 'way' && el.center)
      .map(el => ({
        lat: el.center.lat,
        lon: el.center.lon,
        h: el.tags?.['building:levels']
          ? Math.max(6, parseInt(el.tags['building:levels']) * 4)
          : 20
      }));
    res.json({ buildings });
  } catch(e) {
    res.status(500).json({ error: e.message });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy działa'));
