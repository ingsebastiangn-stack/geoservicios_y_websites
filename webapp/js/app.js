// Crear el mapa. La vista inicial es la de Cundinamarca: al cargar los datos se
// ajusta al departamento elegido (ver DEPARTAMENTO_ELEGIDO más abajo).
const map = L.map('map').setView([4.8, -74.2], 8);

// Los municipios van en un panel propio, por encima de los departamentos
map.createPane('municipios');
map.getPane('municipios').style.zIndex = 450;

// Agregar capa base de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

// URL del servicio WMS de GeoServer
const geoserverUrl = 'https://geoportal.dane.gov.co/mparcgis/services/MGN2024/Serv_CapasMGN_2024/MapServer/WMSServer';

// Departamento elegido para el filtro: código DANE de Cundinamarca.
// Para abrir el mapa en otro departamento basta cambiar este código (por ejemplo '15' = Boyacá,
// '44' = La Guajira). Con '' se muestra todo el país.
const DEPARTAMENTO_ELEGIDO = '25';

// Agregar capa WMS de departamentos
// Nota: el servicio del DANE es un ArcGIS MapServer y no admite filtros por atributo (CQL).
// Por eso, al filtrar, se restringe la carga de teselas a la extensión del departamento ('bounds').
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

// Los nombres del DANE vienen en mayúsculas: "LA GUAJIRA" -> "La Guajira"
function titulo(texto) {
    const chicas = ['de', 'del', 'la', 'las', 'los', 'y', 'el']; // van en minúscula, salvo al inicio
    return texto.toLowerCase().split(' ').map((palabra, i) => {
        if (i > 0 && chicas.includes(palabra)) return palabra;
        return palabra.replace(/(^|[.,(-])([a-záéíóúñü])/g, (m, antes, letra) => antes + letra.toUpperCase());
    }).join(' ');
}

// ---------------------------------------------------------------------------
// Estilo por atributo (mapa coroplético por área)
// ---------------------------------------------------------------------------
const GRADOS_DEPARTAMENTO = [0, 2000, 5000, 10000, 20000, 30000, 40000, 50000];
const GRADOS_MUNICIPIO = [0, 50, 100, 250, 500, 1000, 2000, 5000];
const COLORES = ['#FFEDA0', '#FED976', '#FEB24C', '#FD8D3C', '#FC4E2A', '#E31A1C', '#BD0026', '#800026'];

// Devuelve el color de la clase a la que pertenece el valor
function colorPorClase(valor, grados) {
    let clase = 0;
    for (let i = 0; i < grados.length; i++) {
        if (valor > grados[i]) clase = i;
    }
    return COLORES[clase];
}

function getColor(area) {
    return colorPorClase(area, GRADOS_DEPARTAMENTO);
}

function getColorMunicipio(area) {
    return colorPorClase(area, GRADOS_MUNICIPIO);
}

function style(feature) {
    return {
        fillColor: getColor(feature.properties.area_km2),
        weight: filtro ? 3 : 2,
        opacity: 1,
        color: '#232323',
        // Con el filtro activo, los municipios van encima: el departamento queda como contorno
        fillOpacity: filtro ? 0.1 : 0.7
    };
}

function styleMunicipio(feature) {
    return {
        fillColor: getColorMunicipio(feature.properties.mpio_narea),
        weight: 1,
        opacity: 1,
        color: '#555',
        fillOpacity: 0.6
    };
}

// ---------------------------------------------------------------------------
// Datos y estado del filtro
// ---------------------------------------------------------------------------
// URL del servicio WFS
const departamentosWFSUrl = 'datos/departamentos.geojson'; // Cambia esto a la URL de tu servicio WFS
let datosDepartamentos = null;   // GeoJSON completo (33 departamentos) con el área ya calculada
let departamentosGeoJSON = null; // Capa GeoJSON de departamentos (todos, o solo el elegido)
let municipiosGeoJSON = null;    // Capa GeoJSON con los municipios del departamento elegido
let filtro = null;               // { codigo, nombre, municipios } o null (todo el país)
let tokenFiltro = 0;             // evita mezclar respuestas si se cambia rápido de departamento
const pedidosMunicipios = {};    // municipios ya pedidos, por código de departamento

// Cargar los departamentos (una sola vez) y aplicar el filtro elegido
fetch(departamentosWFSUrl)
    .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
    })
    .then(data => {
        // Calcular el área de cada departamento antes de dibujarlo
        data.features.forEach(f => { f.properties.area_km2 = areaKm2(f.geometry); });
        datosDepartamentos = data;

        llenarSelector();
        aplicarFiltro(DEPARTAMENTO_ELEGIDO);
    })
    .catch(error => {
        console.error('Error cargando WFS:', error);
        info.setError('No se pudo cargar datos/departamentos.geojson. ' +
            'Abre la página desde un servidor (por ejemplo python -m http.server), no con doble clic.');
    });

function quitarCapa(capa) {
    if (!capa) return;
    map.removeLayer(capa);
    controlLayer.removeLayer(capa);
}

// Muestra solo el departamento con ese código (y sus municipios). Con '' muestra todo el país.
function aplicarFiltro(codigo) {
    if (!datosDepartamentos) return;
    const token = ++tokenFiltro;

    const elegido = datosDepartamentos.features.find(f => f.properties.dpto_ccdgo === codigo);
    filtro = elegido ? { codigo: codigo, nombre: titulo(elegido.properties.dpto_cnmbr), municipios: null } : null;
    document.getElementById('dpto-select').value = filtro ? codigo : '';

    // Quitar lo que había del filtro anterior
    quitarCapa(departamentosGeoJSON);
    quitarCapa(municipiosGeoJSON);
    municipiosGeoJSON = null;

    // Departamentos: todos, o solo el elegido
    departamentosGeoJSON = L.geoJSON(datosDepartamentos, {
        filter: feature => !filtro || feature.properties.dpto_ccdgo === filtro.codigo,
        style: style,
        onEachFeature: onEachFeature
    }).addTo(map);
    controlLayer.addOverlay(departamentosGeoJSON, "Departamentos (WFS)"); // Agregar al control de capas

    // Limitar las teselas de los dos WMS a la extensión del departamento (o quitar el límite)
    const bounds = departamentosGeoJSON.getBounds();
    departamentosWMS.options.bounds = filtro ? bounds : null;
    municipiosWMS.options.bounds = filtro ? bounds : null;
    departamentosWMS.redraw();
    municipiosWMS.redraw();

    // Ajustar vista al extent de los datos
    map.fitBounds(bounds, { padding: [10, 10] });

    legend.update();
    info.update();

    if (filtro) cargarMunicipios(codigo, token);
}

// Municipios del departamento elegido (un archivo pequeño por departamento)
function cargarMunicipios(codigo, token) {
    if (!pedidosMunicipios[codigo]) {
        pedidosMunicipios[codigo] = fetch('datos/municipios/' + codigo + '.geojson')
            .then(response => {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            });
    }

    pedidosMunicipios[codigo]
        .then(data => {
            if (token !== tokenFiltro) return; // ya se eligió otro departamento

            municipiosGeoJSON = L.geoJSON(data, {
                pane: 'municipios',
                style: styleMunicipio,
                onEachFeature: onEachMunicipio
            }).addTo(map);
            controlLayer.addOverlay(municipiosGeoJSON, "Municipios (GeoJSON)");

            filtro.municipios = data.features.length;
            info.update();
        })
        .catch(error => {
            console.error('Error cargando municipios:', error);
            delete pedidosMunicipios[codigo];
            if (token === tokenFiltro) {
                info.setError('No se pudieron cargar los municipios de ' + filtro.nombre + '.');
            }
        });
}

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
    if (filtro) return; // con el filtro activo, el resaltado lo hacen los municipios

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
    if (filtro) return;

    // resetStyle devuelve el estilo por área (no uno fijo)
    departamentosGeoJSON.resetStyle(e.target);
    info.update();
}

function zoomToFeature(e) {
    map.fitBounds(e.target.getBounds());
}

// Interacción de los municipios: popup al hacer clic y resaltado al pasar el cursor
function onEachMunicipio(feature, layer) {
    const p = feature.properties;

    layer.bindPopup(`
        <div style="text-align: center;">
            <h3>${titulo(p.mpio_cnmbr)}</h3>
            <p>${titulo(p.mpio_tipo)} de ${titulo(p.dpto_cnmbr)}</p>
            <p><strong>Código DANE:</strong> ${p.mpio_cdpmp}</p>
            <p><strong>Área aprox.:</strong> ${formatoNumero(p.mpio_narea)} km²</p>
        </div>
    `);

    layer.on({
        mouseover: function (e) {
            e.target.setStyle({ weight: 3, color: '#222', fillOpacity: 0.85 });
            e.target.bringToFront();
            info.update(p);
        },
        mouseout: function (e) {
            municipiosGeoJSON.resetStyle(e.target);
            info.update();
        },
        click: function () {
            info.update(p);
        }
    });
}

// Control de escala
L.control.scale({
    position: 'bottomleft',
    metric: true,
    imperial: false
}).addTo(map);

// Panel de información: cambia con el departamento o municipio bajo el cursor
const info = L.control({position: 'topleft'});

info.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info');
    this.update();
    return this._div;
};

info.update = function (props) {
    const lugar = filtro ? filtro.nombre : 'Colombia';
    let detalle;

    if (props && props.mpio_cnmbr) {
        detalle = `<b>${titulo(props.mpio_cnmbr)}</b><br>${titulo(props.mpio_tipo)} de ${titulo(props.dpto_cnmbr)}<br>` +
            `Código: ${props.mpio_cdpmp}<br>Área aprox.: ${formatoNumero(props.mpio_narea)} km²`;
    } else if (props) {
        detalle = `<b>${props.dpto_cnmbr}</b><br>Código: ${props.dpto_ccdgo}<br>Área aprox.: ${formatoNumero(props.area_km2)} km²`;
    } else if (filtro) {
        detalle = filtro.municipios === null
            ? 'Cargando municipios…'
            : `<b>${filtro.municipios} municipios</b><br>Pasa el cursor sobre un municipio`;
    } else {
        detalle = 'Pasa el cursor sobre un departamento';
    }

    this._div.innerHTML = `
        <h4>${lugar} - Servicios Geográficos</h4>
        <p class="descripcion">${filtro ? 'Visualización del departamento y sus municipios' : 'Visualización de departamentos y municipios'}</p>
        <div class="detalle">${detalle}</div>
        <p class="fuente"><small>Datos: DANE | Servicio WMS: DANE</small></p>
    `;
};

info.setError = function (mensaje) {
    this._div.innerHTML = `<h4>Colombia - Servicios Geográficos</h4><p class="error">${mensaje}</p>`;
};

info.addTo(map);

// Leyenda: las clases de área del mapa coroplético (de departamentos, o de municipios si hay filtro)
const legend = L.control({position: 'bottomright'});

legend.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info legend');
    this.update();
    return this._div;
};

legend.update = function () {
    const grades = filtro ? GRADOS_MUNICIPIO : GRADOS_DEPARTAMENTO;
    let html = '<strong>' + (filtro ? 'Área de municipios (km²)' : 'Área (km²)') + '</strong><br>';

    for (let i = 0; i < grades.length; i++) {
        html +=
            '<i style="background:' + COLORES[i] + '"></i> ' +
            grades[i].toLocaleString('es-CO') +
            (grades[i + 1] ? ' &ndash; ' + grades[i + 1].toLocaleString('es-CO') + '<br>' : '+');
    }

    this._div.innerHTML = html;
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

// Selector para filtrar por departamento
const filtroControl = L.control({position: 'topright'});

filtroControl.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'filtro-control');
    div.innerHTML = `
        <select id="dpto-select" aria-label="Filtrar por departamento">
            <option value="">Cargando departamentos...</option>
        </select>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
};

filtroControl.addTo(map);

// Llena el selector con los 33 departamentos (en orden alfabético) y lo conecta con el filtro
function llenarSelector() {
    const select = document.getElementById('dpto-select');
    const opciones = datosDepartamentos.features
        .map(f => ({ codigo: f.properties.dpto_ccdgo, nombre: titulo(f.properties.dpto_cnmbr) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    select.innerHTML = '<option value="">Todo el país</option>' +
        opciones.map(o => `<option value="${o.codigo}">${o.nombre}</option>`).join('');

    select.addEventListener('change', function () {
        aplicarFiltro(select.value);
    });
}

// Quita tildes y mayúsculas para que "atlantico" encuentre "ATLÁNTICO"
function normalizar(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Función de búsqueda: encuentra el departamento y lo elige en el filtro
document.addEventListener('DOMContentLoaded', function() {
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');

    function buscar() {
        const searchText = normalizar(searchInput.value.trim());
        if (!searchText || !datosDepartamentos) return;

        const encontrado = datosDepartamentos.features.find(f =>
            normalizar(f.properties.dpto_cnmbr).includes(searchText));

        if (encontrado) {
            aplicarFiltro(encontrado.properties.dpto_ccdgo);
            departamentosGeoJSON.eachLayer(function(layer) { layer.openPopup(); });
        } else {
            alert('No se encontró el departamento: ' + searchInput.value);
        }
    }

    searchButton.addEventListener('click', buscar);
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') buscar();
    });
});

// Marcador de Bogotá (capital de Colombia y de Cundinamarca)
const bogotaMarker = L.marker([4.7110, -74.0721])
    .addTo(map)
    .bindPopup('<b>Bogotá D.C.</b><br>Capital de Colombia y de Cundinamarca');
