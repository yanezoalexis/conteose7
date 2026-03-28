"use client";

import { useState, useEffect, useRef } from "react";
import { MapPin, Users, Plus, Search, X, Clock, Trash2, Wifi, WifiOff } from "lucide-react";

interface Bombero {
  id: string;
  nombre: string;
  rut: string;
  grado: string;
  lat: number;
  lng: number;
  posicion: string;
  estado: "OK" | "CANSADO" | "AGOTADO" | "LESIONADO";
  horaLlegada: string;
  ultimoGps: string;
}

const GRADOS = [
  "Comandante", "Vicecomandante", "Secretario", "Tesorero", "Capitán",
  "Teniente 1°", "Teniente 2°", "Teniente 3°", "Ayudante",
  "Sargento 1°", "Sargento 2°", "Cabo 1°", "Cabo 2°", "Bombero"
];

const ESTADOS = {
  OK: { color: "#22c55e", label: "OK" },
  CANSADO: { color: "#eab308", label: "CANSADO" },
  AGOTADO: { color: "#f97316", label: "AGOTADO" },
  LESIONADO: { color: "#ef4444", label: "LESIONADO" },
};

const SUBCLASES = [
  "1-1-1 Incendio estructura menor", "1-1-2 Incendio estructura mayor",
  "1-2-1 Incendio departamento", "1-3-1 Incendio casa",
  "2-1 Incendio pasto/bosque", "3-1 Volcamiento",
  "4-1 Derrame menor", "5-1 Excarcelación simple",
  "6-1 Rescate persona", "6-3 Rescate en altura",
  "7-1 Apoyo otro organismo", "8-1 Alarma mal uso"
];

export default function ConteoPage() {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const watchIdRef = useRef<number | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [bomberos, setBomberos] = useState<Bombero[]>([]);
  const [showPanel, setShowPanel] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [gpsActive, setGpsActive] = useState(false);
  const [lastGpsUpdate, setLastGpsUpdate] = useState<string>("");
  
  const [setupData, setSetupData] = useState({
    nombre: "",
    rut: "",
    grado: "Bombero",
    emergenciaDireccion: "",
    emergenciaTipo: "",
  });

  const [nuevaEmergencia, setNuevaEmergencia] = useState({
    direccion: "",
    tipo: "",
    lat: 0,
    lng: 0,
  });

  const [newBombero, setNewBombero] = useState({
    nombre: "",
    rut: "",
    grado: "Bombero",
    posicion: "",
  });

  const [emergenciaActiva, setEmergenciaActiva] = useState<{
    direccion: string;
    tipo: string;
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("conteo_se7_mi_info");
    if (stored) {
      const data = JSON.parse(stored);
      setSetupData(data);
      setShowSetupModal(false);
    }

    const storedEmergencia = localStorage.getItem("conteo_se7_emergencia");
    if (storedEmergencia) {
      setEmergenciaActiva(JSON.parse(storedEmergencia));
    }

    const storedBomberos = localStorage.getItem("conteo_se7_bomberos");
    if (storedBomberos) {
      setBomberos(JSON.parse(storedBomberos));
    }

    setIsOnline(navigator.onLine);
    window.addEventListener("online", () => setIsOnline(true));
    window.addEventListener("offline", () => setIsOnline(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("conteo_se7_bomberos", JSON.stringify(bomberos));
  }, [bomberos]);

  useEffect(() => {
    async function initMap() {
      if (typeof window === "undefined") return;

      const L = await import("leaflet");
      
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });

      const center: [number, number] = emergenciaActiva 
        ? [emergenciaActiva.lat, emergenciaActiva.lng]
        : [-33.0245, -71.5511];

      const map = L.map("map").setView(center, 16);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      if (emergenciaActiva) {
        const marker = L.marker(center)
          .addTo(map)
          .bindPopup(`<b>EMERGENCIA</b><br>${emergenciaActiva.direccion}<br>${emergenciaActiva.tipo}`);
        markersRef.current.set("emergencia", marker);
      }

      mapRef.current = { map, L };
      setIsMapLoaded(true);

      if (navigator.geolocation) {
        // GPS ultra rápido - actualización cada 1 segundo máximo
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, accuracy, speed } = pos.coords;
            
            // Actualizar estados de GPS
            setGpsActive(true);
            setLastGpsUpdate(new Date().toLocaleTimeString());
            
            if (mapRef.current) {
              const { L } = mapRef.current;
              
              // Actualizar posición inmediatamente
              const existingMarker = markersRef.current.get("mi-ubicacion");
              if (existingMarker) {
                existingMarker.setLatLng([latitude, longitude]);
                existingMarker.getPopup()?.setContent(`
                  <div style="min-width: 150px;">
                    <strong>TU UBICACIÓN</strong><br>
                    <span style="color: #22c55e;">● GPS ACTIVO</span><br>
                    Lat: ${latitude.toFixed(6)}<br>
                    Lng: ${longitude.toFixed(6)}<br>
                    Precisión: ${accuracy.toFixed(0)}m
                  </div>
                `);
              } else {
                // Crear marcador con animación
                const icon = L.divIcon({
                  className: "mi-ubicacion",
                  html: `
                    <div style="
                      position: relative;
                      width: 30px; height: 30px;
                    ">
                      <div style="
                        width: 50px; height: 50px;
                        background: rgba(59, 130, 246, 0.3);
                        border-radius: 50%;
                        position: absolute;
                        top: -10px; left: -10px;
                        animation: gps-pulse 1.5s ease-out infinite;
                      "></div>
                      <div style="
                        width: 30px; height: 30px;
                        background: #3b82f6;
                        border-radius: 50%;
                        border: 4px solid white;
                        box-shadow: 0 0 15px rgba(59, 130, 246, 0.8);
                        position: absolute;
                      ">
                        <div style="
                          width: 10px; height: 10px;
                          background: white;
                          border-radius: 50%;
                          position: absolute;
                          top: 50%; left: 50%;
                          transform: translate(-50%, -50%);
                        "></div>
                      </div>
                    </div>
                  `,
                  iconSize: [30, 30],
                  iconAnchor: [15, 15],
                });

                const marker = L.marker([latitude, longitude], { icon })
                  .addTo(map)
                  .bindPopup(`
                    <div style="min-width: 150px;">
                      <strong>TU UBICACIÓN</strong><br>
                      <span style="color: #22c55e;">● GPS ACTIVO</span><br>
                      Lat: ${latitude.toFixed(6)}<br>
                      Lng: ${longitude.toFixed(6)}<br>
                      Precisión: ${accuracy.toFixed(0)}m
                    </div>
                  `);
                markersRef.current.set("mi-ubicacion", marker);
              }
            }
          },
          (err) => {
            console.log("GPS error:", err.message);
          },
          { 
            enableHighAccuracy: true,  // Máxima precisión GPS
            maximumAge: 0,             // Sin caché, siempre GPS fresco
            timeout: 5000              // Timeout 5 segundos
          }
        );
      }
    }

    initMap();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (mapRef.current?.map) {
        mapRef.current.map.remove();
      }
    };
  }, [emergenciaActiva]);

  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;

    const { map, L } = mapRef.current;

    markersRef.current.forEach((m, key) => {
      if (key !== "emergencia" && key !== "mi-ubicacion") {
        m.remove();
        markersRef.current.delete(key);
      }
    });

    bomberos.forEach((b) => {
      if (!b.lat || !b.lng) return;

      const icon = L.divIcon({
        className: "bombero-marker",
        html: `
          <div style="
            width: 40px; height: 40px; border-radius: 50%;
            background-color: ${ESTADOS[b.estado].color};
            border: 4px solid white;
            box-shadow: 0 3px 10px rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center;
            font-weight: bold; color: white; font-size: 16px;
          ">${b.nombre.charAt(0)}</div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -25],
      });

      const marker = L.marker([b.lat, b.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="min-width: 180px;">
            <strong style="font-size: 15px;">${b.nombre}</strong><br>
            <span style="color: #666; font-size: 12px;">${b.grado}</span><br>
            <span style="font-size: 12px;">RUT: ${b.rut}</span><br>
            <span style="font-size: 12px;">📍 ${b.posicion}</span><br>
            <span style="font-size: 12px; font-weight: bold; color: ${ESTADOS[b.estado].color};">
              ${ESTADOS[b.estado].label}
            </span>
          </div>
        `);

      markersRef.current.set(b.id, marker);
    });
  }, [bomberos, isMapLoaded]);

  const handleSetup = () => {
    if (!setupData.nombre || !setupData.rut) {
      alert("Nombre y RUT son requeridos");
      return;
    }
    
    localStorage.setItem("conteo_se7_mi_info", JSON.stringify(setupData));
    setShowSetupModal(false);
  };

  const handleCrearEmergencia = () => {
    if (!nuevaEmergencia.direccion || !nuevaEmergencia.tipo) {
      alert("Dirección y tipo son requeridos");
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const emergencia = {
            direccion: nuevaEmergencia.direccion,
            tipo: nuevaEmergencia.tipo,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setEmergenciaActiva(emergencia);
          localStorage.setItem("conteo_se7_emergencia", JSON.stringify(emergencia));
          
          if (mapRef.current) {
            mapRef.current.map.setView([pos.coords.latitude, pos.coords.longitude], 16);
          }
        },
        () => {
          const emergencia = {
            direccion: nuevaEmergencia.direccion,
            tipo: nuevaEmergencia.tipo,
            lat: -33.0245,
            lng: -71.5511,
          };
          setEmergenciaActiva(emergencia);
          localStorage.setItem("conteo_se7_emergencia", JSON.stringify(emergencia));
        }
      );
    }
  };

  const handleAgregarBombero = () => {
    if (!newBombero.nombre || !newBombero.rut) {
      alert("Nombre y RUT son requeridos");
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          agregarBombero(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          const center = mapRef.current?.map.getCenter();
          agregarBombero(center?.lat || -33.0245, center?.lng || -71.5511);
        }
      );
    } else {
      agregarBombero(-33.0245, -71.5511);
    }
  };

  const agregarBombero = (lat: number, lng: number) => {
    const bombero: Bombero = {
      id: Date.now().toString(),
      nombre: newBombero.nombre,
      rut: newBombero.rut,
      grado: newBombero.grado,
      lat,
      lng,
      posicion: newBombero.posicion || "En escena",
      estado: "OK",
      horaLlegada: new Date().toISOString(),
      ultimoGps: new Date().toISOString(),
    };

    setBomberos([...bomberos, bombero]);
    setNewBombero({ nombre: "", rut: "", grado: "Bombero", posicion: "" });
    setShowAddModal(false);
  };

  const handleRemoveBombero = (id: string) => {
    setBomberos(bomberos.filter((b) => b.id !== id));
  };

  const handleUpdateEstado = (id: string, estado: Bombero["estado"]) => {
    setBomberos(bomberos.map((b) => b.id === id ? { ...b, estado } : b));
  };

  const handleUpdatePosition = (id: string) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBomberos(bomberos.map((b) => 
            b.id === id ? { 
              ...b, 
              lat: pos.coords.latitude, 
              lng: pos.coords.longitude,
              ultimoGps: new Date().toISOString()
            } : b
          ));
        },
        () => alert("No se pudo obtener GPS")
      );
    }
  };

  const handleMiPosicion = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (mapRef.current) {
            mapRef.current.map.setView([pos.coords.latitude, pos.coords.longitude], 18);
          }
        },
        () => alert("No se pudo obtener GPS")
      );
    }
  };

  const getTiempoEnEscena = (hora: string) => {
    const diff = Date.now() - new Date(hora).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const getTiempoGps = (hora: string) => {
    const diff = Date.now() - new Date(hora).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    return `${mins}m`;
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-gray-900">
      {/* Mapa */}
      <div className="flex-1 relative">
        <div id="map" className="w-full h-full" />
        
        {/* Header flotante */}
        <div className="absolute top-4 left-4 z-[1000] bg-gray-900/95 backdrop-blur rounded-xl p-4 shadow-2xl border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xl">7</span>
            </div>
            <div className="flex-1">
              <h1 className="text-white font-bold text-xl" style={{ fontFamily: "Oswald, sans-serif" }}>
                CONTEO SE7
              </h1>
              <p className="text-gray-400 text-xs">7ma Compañía - GPS en Tiempo Real</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                gpsActive ? "bg-green-500/30 text-green-400" : "bg-gray-500/30 text-gray-400"
              }`}>
                <span className={`w-2 h-2 rounded-full ${gpsActive ? "bg-green-400 animate-pulse" : "bg-gray-400"}`}></span>
                {gpsActive ? "GPS ACTIVO" : "GPS OFF"}
              </div>
              {lastGpsUpdate && (
                <span className="text-[10px] text-gray-500">Última vez: {lastGpsUpdate}</span>
              )}
            </div>
          </div>
          
          {emergenciaActiva && (
            <div className="bg-red-900/30 rounded-lg p-2 mb-3 border border-red-500/30">
              <p className="text-red-400 text-sm font-medium">🚨 {emergenciaActiva.tipo}</p>
              <p className="text-white text-xs">{emergenciaActiva.direccion}</p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <div className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold text-white">{bomberos.length}</div>
              <div className="text-[10px] text-gray-400">TOTAL</div>
            </div>
            <div className="bg-green-900/30 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold text-green-400">{bomberos.filter(b => b.estado === "OK").length}</div>
              <div className="text-[10px] text-green-400">OK</div>
            </div>
            <div className="bg-yellow-900/30 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold text-yellow-400">{bomberos.filter(b => b.estado === "CANSADO" || b.estado === "AGOTADO").length}</div>
              <div className="text-[10px] text-yellow-400">CANSADO</div>
            </div>
            <div className="bg-red-900/30 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold text-red-400">{bomberos.filter(b => b.estado === "LESIONADO").length}</div>
              <div className="text-[10px] text-red-400">LESIONADO</div>
            </div>
          </div>
        </div>

        {/* Botón mi posición */}
        <button
          onClick={handleMiPosicion}
          className="absolute bottom-24 right-6 z-[1000] w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg flex items-center justify-center transition-colors"
          title="Mi ubicación GPS"
        >
          <MapPin className="w-6 h-6 text-white" />
        </button>

        {/* Botón agregar */}
        <button
          onClick={() => setShowAddModal(true)}
          className="absolute bottom-6 right-6 z-[1000] w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full shadow-lg flex items-center justify-center transition-colors"
        >
          <Plus className="w-7 h-7 text-white" />
        </button>
      </div>

      {/* Panel lateral */}
      {showPanel && (
        <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-red-500" />
                Personal en Escena
              </h2>
              <button onClick={() => setShowPanel(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-xs text-gray-500 mb-2">
              {setupData.nombre} ({setupData.grado})
            </p>
          </div>

          {/* Lista de bomberos */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {bomberos.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No hay personal agregado</p>
                <p className="text-xs mt-1">Click en + para agregar</p>
              </div>
            ) : (
              bomberos.map((b) => (
                <div key={b.id} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg" 
                          style={{ backgroundColor: ESTADOS[b.estado].color }}>
                          {b.nombre.charAt(0)}
                        </div>
                        <div 
                          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-900"
                          style={{ backgroundColor: ESTADOS[b.estado].color }}
                          title={ESTADOS[b.estado].label}
                        />
                      </div>
                      <div>
                        <p className="text-white font-medium">{b.nombre}</p>
                        <p className="text-gray-400 text-xs">{b.grado}</p>
                        <p className="text-gray-500 text-xs">{b.rut}</p>
                      </div>
                    </div>
                    <button onClick={() => handleRemoveBombero(b.id)} className="text-gray-500 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-xs text-gray-400 mb-2 flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> {b.posicion}
                    <span className="mx-1">•</span>
                    <Clock className="w-3 h-3" /> {getTiempoEnEscena(b.horaLlegada)}
                  </div>

                  {/* Estados */}
                  <div className="flex gap-1 mb-2">
                    {(Object.keys(ESTADOS) as Array<keyof typeof ESTADOS>).map((estado) => (
                      <button
                        key={estado}
                        onClick={() => handleUpdateEstado(b.id, estado)}
                        className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-all ${
                          b.estado === estado ? "text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                        }`}
                        style={b.estado === estado ? { backgroundColor: ESTADOS[estado].color } : {}}
                      >
                        {ESTADOS[estado].label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => handleUpdatePosition(b.id)}
                    className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 flex items-center justify-center gap-1"
                  >
                    <MapPin className="w-3 h-3" /> Actualizar GPS ({getTiempoGps(b.ultimoGps)})
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!showPanel && (
        <button
          onClick={() => setShowPanel(true)}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-[1000] w-10 h-20 bg-gray-800/95 backdrop-blur rounded-l-lg flex items-center justify-center border border-l-0 border-gray-700"
        >
          <Users className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Modal Setup Inicial */}
      {showSetupModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[3000] p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="p-6 border-b border-gray-700 text-center">
              <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-4xl">7</span>
              </div>
              <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "Oswald, sans-serif" }}>
                CONTEO SE7
              </h2>
              <p className="text-gray-400 text-sm">Sistema de Conteo GPS en Tiempo Real</p>
            </div>
            
            <div className="p-6 space-y-4">
              <h3 className="text-white font-bold">Configuración inicial</h3>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Tu Nombre *</label>
                <input
                  type="text"
                  value={setupData.nombre}
                  onChange={(e) => setSetupData({ ...setupData, nombre: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Tu RUT *</label>
                <input
                  type="text"
                  value={setupData.rut}
                  onChange={(e) => setSetupData({ ...setupData, rut: e.target.value })}
                  placeholder="Ej: 12.345.678-5"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Tu Grado</label>
                <select
                  value={setupData.grado}
                  onChange={(e) => setSetupData({ ...setupData, grado: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
                >
                  {GRADOS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <hr className="border-gray-700" />

              <h3 className="text-white font-bold">Crear Emergencia (opcional)</h3>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Dirección</label>
                <input
                  type="text"
                  value={nuevaEmergencia.direccion}
                  onChange={(e) => setNuevaEmergencia({ ...nuevaEmergencia, direccion: e.target.value })}
                  placeholder="Ej: Av. Peters 123"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Tipo de Emergencia</label>
                <select
                  value={nuevaEmergencia.tipo}
                  onChange={(e) => setNuevaEmergencia({ ...nuevaEmergencia, tipo: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
                >
                  <option value="">Seleccionar...</option>
                  {SUBCLASES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-700">
              <button
                onClick={handleCrearEmergencia}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold mb-2"
              >
                Crear Emergencia + Iniciar
              </button>
              <button
                onClick={handleSetup}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Solo Configurar (sin emergencia)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar bombero */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-red-500" />
                Agregar Bombero
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">Nombre *</label>
                <input
                  type="text"
                  value={newBombero.nombre}
                  onChange={(e) => setNewBombero({ ...newBombero, nombre: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">RUT *</label>
                <input
                  type="text"
                  value={newBombero.rut}
                  onChange={(e) => setNewBombero({ ...newBombero, rut: e.target.value })}
                  placeholder="Ej: 12.345.678-5"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">Grado</label>
                <select
                  value={newBombero.grado}
                  onChange={(e) => setNewBombero({ ...newBombero, grado: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
                >
                  {GRADOS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">Posición en escena</label>
                <input
                  type="text"
                  value={newBombero.posicion}
                  onChange={(e) => setNewBombero({ ...newBombero, posicion: e.target.value })}
                  placeholder="Ej: Piso 2, sector norte"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                La ubicación GPS se obtendrá automáticamente
              </p>
            </div>
            <div className="p-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleAgregarBombero}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium"
              >
                Agregar + GPS
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @import "leaflet/dist/leaflet.css";
        .leaflet-container { height: 100%; width: 100%; background: #1a1a2e; }
        
        @keyframes gps-pulse {
          0% {
            transform: scale(0.5);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        
        .gps-indicator {
          display: inline-block;
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          animation: gps-blink 1s infinite;
        }
        
        @keyframes gps-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
