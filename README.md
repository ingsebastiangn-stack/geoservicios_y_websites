# geoservicios_y_websites

Aplicación web con Leaflet del curso de Servicios Web Geográficos (Capítulo 11): mapa de departamentos y municipios de Colombia que consume servicios WMS y datos GeoJSON.

**Mapa en línea:** https://ingsebastiangn-stack.github.io/geoservicios_y_websites/

## Qué hace el mapa

- Mapa base de OpenStreetMap o satélite (Esri), con control de capas.
- Capas WMS del DANE (departamentos y municipios, MGN 2024).
- Departamentos en GeoJSON (`webapp/datos/departamentos.geojson`), coloreados por área.
- Al pasar el cursor, el departamento se resalta y el panel de información muestra su nombre, código y área. Al hacer clic se hace zoom y se abre un popup.
- Leyenda con las clases de área.
- Búsqueda de departamentos por nombre (sin importar tildes ni mayúsculas).
- Escala y diseño adaptable a celulares.

## De dónde salen los datos

- **WMS (imágenes):** DANE, servicio `Serv_CapasMGN_2024` (capa 8 departamentos y capa 7 municipios), pedido directamente desde el navegador.
- **Departamentos en GeoJSON:** `webapp/datos/departamentos.geojson`. El capítulo los pide al WFS de un GeoServer local (`localhost:8080`). En la versión publicada se leen de este archivo por dos razones: un GeoServer local no se alcanza desde internet, y el WFS del DANE no permite CORS, de modo que el navegador bloquea la respuesta cuando la página está en `github.io` (se comprobó). Para usar un GeoServer propio, cambia `departamentosWFSUrl` en `js/app.js` por la URL del WFS con `outputFormat=application/json`.
- **Área:** el GeoJSON solo trae código y nombre, así que el área en km² se calcula en el navegador al cargar los datos.

## Estructura

```
index.html            # redirige a webapp/ (GitHub Pages solo publica la raíz o /docs)
webapp/
├── index.html        # página del mapa
├── css/style.css     # estilos (paneles, leyenda, búsqueda, celulares)
├── js/app.js         # lógica del mapa
├── assets/images/    # imágenes y recursos (vacía por ahora)
└── datos/departamentos.geojson
```

## Ejecutar en local (11.10)

Con Python instalado, desde la carpeta del repositorio:

```bash
cd webapp
python -m http.server 8000
```

Abre http://localhost:8000. No abras `index.html` con doble clic: el navegador bloquea la carga de `datos/departamentos.geojson` desde `file://`.

## Publicar en GitHub Pages

1. En GitHub, **Settings → Pages**.
2. En **Build and deployment**, elige **Deploy from a branch**.
3. Rama `main` y carpeta `/ (root)`, y guarda.
4. Tras uno o dos minutos, el mapa queda en https://ingsebastiangn-stack.github.io/geoservicios_y_websites/

> GitHub Pages solo ofrece `/ (root)` o `/docs`, no `/webapp`. Por eso hay un `index.html` en la raíz que redirige a `webapp/`.

## CORS

El mapa solo consume servicios públicos (WMS del DANE, teselas de OpenStreetMap y Esri) y un archivo propio, así que no necesita configurar CORS. Si se cambian las capas por un GeoServer local, ese sí debe permitir CORS (ver el Capítulo 11, sección 11.10).
