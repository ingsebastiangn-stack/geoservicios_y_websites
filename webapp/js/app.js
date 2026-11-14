// Crear el mapa centrado en Colombia
const map = L.map('map').setView([4.5709, -74.2973], 6);

// Agregar capa base de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

// URL del servicio WMS de GeoServer
const geoserverUrl = 'https://geoportal.dane.gov.co/mparcgis/services/MGN2024/Serv_CapasMGN_2024/MapServer/WMSServer';

// Agregar capa WMS de departamentos
const departamentosWMS = L.tileLayer.wms(geoserverUrl, {
    layers: '8',
    format: 'image/png',
    transparent: true,
    attribution: 'DANE - Departamento Administrativo Nacional de Estadística'
}).addTo(map);

// ---------------------------------------------------------------------------
// Área de cada departamento
// El GeoJSON del DANE solo trae el código y el nombre, así que el área (km²) se
// calcula aquí con la fórmula esférica. Sirve para colorear y para la leyenda.
// ---------------------------------------------------------------------------
const RADIO_TIERRA_KM = 6371.0088;

function areaAnillo(anillo) {
    const rad = Math.PI / 180;
    let suma = 0;
    for (let i = 0; i < anillo.length - 1; i++) {
        const [lon1, lat1] = anillo[i];
        const [lon2, lat2] = anillo[i + 1];
        suma += (lon2 - lon1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
    }
    return Math.abs(suma * RADIO_TIERRA_KM * RADIO_TIERRA_KM / 2);
}

// Un polígono es [anillo exterior, ...huecos]: el área es el exterior menos los huecos
function areaPoligono(poligono) {
    return poligono.reduce((total, anillo, i) => total + (i === 0 ? areaAnillo(anillo) : -areaAnillo(anillo)), 0);
}

function areaKm2(geometry) {
    if (geometry.type === 'Polygon') return areaPoligono(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.reduce((t, p) => t + areaPoligono(p), 0);
    return 0;
}

function formatoNumero(n) {
    return Math.round(n).toLocaleString('es-CO');
}

// ---------------------------------------------------------------------------
// Estilo por atributo (mapa coroplético por área)
// ---------------------------------------------------------------------------
function getColor(area) {
    return area > 50000 ? '#800026' :
           area > 40000 ? '#BD0026' :
           area > 30000 ? '#E31A1C' :
           area > 20000 ? '#FC4E2A' :
           area > 10000 ? '#FD8D3C' :
           area > 5000  ? '#FEB24C' :
           area > 2000  ? '#FED976' :
                          '#FFEDA0';
}

function style(feature) {
    return {
        fillColor: getColor(feature.properties.area_km2),
        weight: 2,
        opacity: 1,
        color: '#232323',
        fillOpacity: 0.7
    };
}

// URL del servicio WFS
const departamentosWFSUrl = 'datos/departamentos.geojson'; // Cambia esto a la URL de tu servicio WFS
let departamentosGeoJSON; // Variable para almacenar la capa GeoJSON

// Cargar y mostrar departamentos como GeoJSON
fetch(departamentosWFSUrl)
    .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
    })
    .then(data => {
        // Calcular el área de cada departamento antes de dibujarlo
        data.features.forEach(f => { f.properties.area_km2 = areaKm2(f.geometry); });

        // Crear capa GeoJSON
        departamentosGeoJSON = L.geoJSON(data, {
            style: style,
            onEachFeature: onEachFeature
        });

        // Agregar al mapa
        departamentosGeoJSON.addTo(map);
        controlLayer.addOverlay(departamentosGeoJSON, "Departamentos (WFS)"); // Agregar al control de capas

        // Ajustar vista al extent de los datos
        map.fitBounds(departamentosGeoJSON.getBounds());
    })
    .catch(error => {
        console.error('Error cargando WFS:', error);
        info.setError('No se pudo cargar datos/departamentos.geojson. ' +
            'Abre la página desde un servidor (por ejemplo python -m http.server), no con doble clic.');
    });

// Agregar capa WMS de municipios
const municipiosWMS = L.tileLayer.wms(geoserverUrl, {
    layers: '7',
    format: 'image/png',
    transparent: true,
    attribution: 'DANE - Departamento Administrativo Nacional de Estadística'
});

// Capas base
const baseMaps = {
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }),
    "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    })
};

// Capas superpuestas
let overlayMaps = {
    "Departamentos": departamentosWMS,
    "Municipios": municipiosWMS
};

// Agregar control de capas (plegado en pantallas pequeñas para no tapar el mapa)
const controlLayer = L.control.layers(baseMaps, overlayMaps, {
    collapsed: window.innerWidth < 600
}).addTo(map);

// Agregar capa base por defecto
baseMaps["OpenStreetMap"].addTo(map);

function onEachFeature(feature, layer) {
    // Popup al hacer clic
    if (feature.properties) {
        const popupContent = `
            <div style="text-align: center;">
                <h3>${feature.properties.dpto_cnmbr}</h3>
                <p><strong>Código:</strong> ${feature.properties.dpto_ccdgo}</p>
                <p><strong>Área aprox.:</strong> ${formatoNumero(feature.properties.area_km2)} km²</p>
            </div>
        `;
        layer.bindPopup(popupContent);
    }

    // Highlight al pasar el mouse (y panel de información al tocar, en el celular)
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: function (e) {
            zoomToFeature(e);
            info.update(e.target.feature.properties);
        }
    });
}

function highlightFeature(e) {
    const layer = e.target;

    layer.setStyle({
        weight: 5,
        color: '#666',
        fillOpacity: 0.85
    });

    layer.bringToFront();
    info.update(layer.feature.properties);
}

function resetHighlight(e) {
    // resetStyle devuelve el estilo por área (no uno fijo)
    departamentosGeoJSON.resetStyle(e.target);
    info.update();
}

function zoomToFeature(e) {
    map.fitBounds(e.target.getBounds());
}

// Control de escala
L.control.scale({
    position: 'bottomleft',
    metric: true,
    imperial: false
}).addTo(map);

// Panel de información: cambia con el departamento bajo el cursor
const info = L.control({position: 'topleft'});

info.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info');
    this.update();
    return this._div;
};

info.update = function (props) {
    this._div.innerHTML = `
        <h4>Colombia - Servicios Geográficos</h4>
        <p class="descripcion">Visualización de departamentos y municipios</p>
        <div class="detalle">${props
            ? `<b>${props.dpto_cnmbr}</b><br>Código: ${props.dpto_ccdgo}<br>Área aprox.: ${formatoNumero(props.area_km2)} km²`
            : 'Pasa el cursor sobre un departamento'}</div>
        <p class="fuente"><small>Datos: DANE | Servicio WMS: DANE</small></p>
    `;
};

info.setError = function (mensaje) {
    this._div.innerHTML = `<h4>Colombia - Servicios Geográficos</h4><p class="error">${mensaje}</p>`;
};

info.addTo(map);

// Leyenda: las clases de área del mapa coroplético
const legend = L.control({position: 'bottomright'});

legend.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    const grades = [0, 2000, 5000, 10000, 20000, 30000, 40000, 50000];

    div.innerHTML = '<strong>Área (km²)</strong><br>';

    for (let i = 0; i < grades.length; i++) {
        div.innerHTML +=
            '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
            grades[i].toLocaleString('es-CO') +
            (grades[i + 1] ? ' &ndash; ' + grades[i + 1].toLocaleString('es-CO') + '<br>' : '+');
    }

    return div;
};

legend.addTo(map);

// Crear control de búsqueda
const searchControl = L.control({position: 'topright'});

searchControl.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'search-control');
    div.innerHTML = `
        <input type="text" id="search-input" placeholder="${window.innerWidth < 600 ? 'Departamento...' : 'Buscar departamento...'}">
        <button id="search-button">Buscar</button>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
};

searchControl.addTo(map);

// Quita tildes y mayúsculas para que "atlantico" encuentre "ATLÁNTICO"
function normalizar(texto) {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Función de búsqueda
document.addEventListener('DOMContentLoaded', function() {
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');

    function buscar() {
        const searchText = normalizar(searchInput.value.trim());
        if (!searchText || !departamentosGeoJSON) return;

        let encontrado = null;
        departamentosGeoJSON.eachLayer(function(layer) {
            const nombre = normalizar(layer.feature.properties.dpto_cnmbr);
            if (!encontrado && nombre.includes(searchText)) {
                encontrado = layer;
            }
        });

        if (encontrado) {
            map.fitBounds(encontrado.getBounds());
            encontrado.openPopup();
            info.update(encontrado.feature.properties);
        } else {
            alert('No se encontró el departamento: ' + searchInput.value);
        }
    }

    searchButton.addEventListener('click', buscar);
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') buscar();
    });
});

// Marcador de Bogotá
const bogotaMarker = L.marker([4.7110, -74.0721])
    .addTo(map)
    .bindPopup('<b>Bogotá D.C.</b><br>Capital de Colombia');
