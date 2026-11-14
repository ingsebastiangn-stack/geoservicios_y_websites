# geoservicios_y_websites

Aplicación web con Leaflet del curso de Servicios Web Geográficos (Capítulo 11): mapa de departamentos y municipios de Colombia que consume servicios WMS y datos GeoJSON.

## Enlaces

- **Repositorio:** https://github.com/ingsebastiangn-stack/geoservicios_y_websites
- **Mapa en línea:** https://ingsebastiangn-stack.github.io/geoservicios_y_websites/webapp/

## Qué hace el mapa

- Mapa base de OpenStreetMap o satélite (Esri), con control de capas.
- Capas WMS del DANE (departamentos y municipios, MGN 2024).
- **Filtro por departamento:** el mapa abre en **Cundinamarca** (el departamento elegido). Solo se ve ese departamento y sus 116 municipios; las teselas del WMS se limitan a su extensión. Con el selector de la esquina superior derecha se cambia a otro departamento o se vuelve a **Todo el país**.
- Departamentos y municipios en GeoJSON, coloreados por área (departamentos en la vista nacional; municipios cuando hay filtro).
- Al pasar el cursor, el departamento (o el municipio) se resalta y el panel de información muestra su nombre, código y área. Al hacer clic se abre un popup.
- Leyenda con las clases de área, que cambia según la vista.
- Búsqueda de departamentos por nombre (sin importar tildes ni mayúsculas): al encontrarlo, lo elige en el filtro.
- Escala y diseño adaptable a celulares.

## De dónde salen los datos

- **WMS (imágenes):** DANE, servicio `Serv_CapasMGN_2024` (capa 8 departamentos y capa 7 municipios), pedido directamente desde el navegador.
- **Departamentos en GeoJSON:** `webapp/datos/departamentos.geojson`. El capítulo los pide al WFS de un GeoServer local (`localhost:8080`). En la versión publicada se leen de este archivo por dos razones: un GeoServer local no se alcanza desde internet, y el WFS del DANE no permite CORS, de modo que el navegador bloquea la respuesta cuando la página está en `github.io` (se comprobó). Para usar un GeoServer propio, cambia `departamentosWFSUrl` en `js/app.js` por la URL del WFS con `outputFormat=application/json`.
- **Municipios en GeoJSON:** `webapp/datos/municipios/CODIGO.geojson`, un archivo por departamento (por ejemplo `25.geojson` para Cundinamarca). Salen del `municipios.geojson` del repositorio del curso (`data/`), dividido por departamento y con las coordenadas a 5 decimales, para que cada archivo pese entre 2 y 470 KB y solo se descargue el del departamento elegido.
- **Área:** el GeoJSON de departamentos solo trae código y nombre, así que ese área en km² se calcula en el navegador al cargar los datos. Los municipios traen su área (`mpio_narea`).
- **Por qué los dos WMS no se filtran por atributo:** el servicio del DANE es un ArcGIS MapServer y no admite filtros CQL; por eso se limita la extensión de las teselas (`bounds`) y los datos filtrados vienen del GeoJSON.
- **Bogotá D.C.** tiene código propio (11) en el DANE, por eso en la vista de Cundinamarca aparece como un hueco con el marcador de la capital.

## Estructura

```
index.html            # redirige a webapp/ (GitHub Pages solo publica la raíz o /docs)
webapp/
├── index.html        # página del mapa
├── css/style.css     # estilos (paneles, leyenda, búsqueda, selector, celulares)
├── js/app.js         # lógica del mapa (filtro por departamento: DEPARTAMENTO_ELEGIDO)
├── assets/images/    # imágenes y recursos (vacía por ahora)
└── datos/
    ├── departamentos.geojson
    └── municipios/       # 33 archivos, uno por departamento (25.geojson = Cundinamarca)
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
4. Tras uno o dos minutos, el mapa queda en https://ingsebastiangn-stack.github.io/geoservicios_y_websites/webapp/

> GitHub Pages solo ofrece `/ (root)` o `/docs`, no `/webapp`. Por eso hay un `index.html` en la raíz que redirige a `webapp/`.

## CORS

El mapa solo consume servicios públicos (WMS del DANE, teselas de OpenStreetMap y Esri) y archivos propios, así que no necesita configurar CORS. Si se cambian las capas por un GeoServer local, ese sí debe permitir CORS (ver el Capítulo 11, sección 11.10).
