// Proxy hacia la API de Geocoding de Google -- la key (MAPKEY) vive solo
// aqui, nunca se expone al frontend. Ver DISENO-GEOCODIFICACION-INVERSA.md.
const MAPKEY = process.env.MAPKEY;

// address_components.types confirmados empiricamente contra la API real
// para Panama (ver seccion 3 del diseno): administrative_area_level_1 es
// la provincia, administrative_area_level_2 el distrito (a veces con el
// prefijo "Distrito de ", que se normaliza). El corregimiento NO llega
// nunca en las pruebas hechas -- Google no tiene ese nivel para Panama,
// asi que queda para que el usuario lo escriba a mano.
function mapearComponentes(components) {
  const buscar = (tipo) => components.find((c) => c.types.includes(tipo))?.long_name || null;
  const distrito = buscar('administrative_area_level_2');
  return {
    pais: buscar('country'),
    provincia: buscar('administrative_area_level_1'),
    distrito: distrito ? distrito.replace(/^Distrito de /i, '') : null,
    corregimiento: null,
  };
}

// GET /api/geocodificacion/reverse?lat=&lng=
async function reverseGeocode(req, res, next) {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ mensaje: 'lat y lng son requeridos' });
    if (!MAPKEY) return res.status(500).json({ mensaje: 'Geocodificacion no configurada en el servidor' });

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&key=${MAPKEY}&language=es&region=pa`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status !== 'OK' || !data.results?.[0]) {
      return res.status(404).json({ mensaje: 'No se pudo determinar la division politica para ese punto' });
    }

    res.json(mapearComponentes(data.results[0].address_components));
  } catch (err) { next(err); }
}

module.exports = { reverseGeocode };
