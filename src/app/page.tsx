'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import type { Bombero, BomberoEnEmergencia, Estado, Emergencia } from '@/lib/types';

const GpsMap = dynamic(() => import('@/components/GpsMap').then(mod => ({ default: mod.GpsMap })), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-900 flex items-center justify-center"><div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div></div>
});

const ESTADO_COLORS: Record<Estado, string> = {
  OK: '#22c55e',
  CANSADO: '#eab308',
  AGOTADO: '#f97316',
  LESIONADO: '#ef4444',
};

export default function TrackingPage() {
  const [bomberos, setBomberos] = useState<Bombero[]>([]);
  const [bomberosEnEmergencia, setBomberosEnEmergencia] = useState<BomberoEnEmergencia[]>([]);
  const [emergencia, setEmergencia] = useState<Emergencia | null>(null);
  const [miBombero, setMiBombero] = useState<Bombero | null>(null);
  const [miPosicion, setMiPosicion] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegistro, setShowRegistro] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  
  const watchIdRef = useRef<number | null>(null);
  const lastGpsUpload = useRef<number>(0);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setIsLoading(true);
    
    try {
      // Cargar emergencia activa
      const { data: empData } = await supabase
        .from('emergencias')
        .select('*')
        .eq('estado', 'ACTIVA')
        .limit(1)
        .single();

        if (empData) {
        setEmergencia(empData);
        
        // Cargar bomberos en emergencia
        const { data: enfData } = await supabase
          .from('bombero_emergencia')
          .select('*, bombero:bomberos(*)')
          .eq('emergencia_id', empData.id);

        setBomberosEnEmergencia(enfData || []);
      }

      // Cargar TODOS los bomberos disponibles
      const { data: bomData } = await supabase
        .from('bomberos')
        .select('*')
        .eq('es_activo', true)
        .order('nombre');

      setBomberos(bomData || []);

      // Verificar si ya está registrado
      const storedBomberoId = localStorage.getItem('bomberoId');
      if (storedBomberoId) {
        const bomberoData = bomData?.find(b => b.id === storedBomberoId);
        if (bomberoData) {
          setMiBombero(bomberoData);
          
          // Verificar si está registrado en emergencia
          if (empData) {
            const { data: enfData } = await supabase
              .from('bombero_emergencia')
              .select('*')
              .eq('bombero_id', storedBomberoId)
              .eq('emergencia_id', empData.id)
              .single();
            
            if (enfData) {
              setIsRegistered(true);
              iniciarGPS(empData.id, storedBomberoId);
            }
          }
        } else {
          localStorage.removeItem('bomberoId');
          setShowRegistro(true);
        }
      } else {
        setShowRegistro(true);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function iniciarGPS(emergenciaId: string, bomberoId: string) {
    if (!('geolocation' in navigator)) {
      setGpsError('GPS no disponible en este dispositivo');
      return;
    }

    setGpsError('Solicitando acceso a ubicación...');

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsError(null);
          const nuevaPos = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setMiPosicion(nuevaPos);

          // Subir posición cada 2 segundos
          const now = Date.now();
          if (now - lastGpsUpload.current >= 2000) {
            lastGpsUpload.current = now;
            subirPosicion(emergenciaId, bomberoId, nuevaPos);
          }
        },
        (error) => {
          let msg = 'Error de GPS';
          if (error.code === 1) msg = 'Permite el acceso a ubicación';
          if (error.code === 2) msg = 'GPS no disponible';
          setGpsError(msg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } catch (error) {
      setGpsError('No se pudo iniciar GPS');
    }
  }

  async function subirPosicion(emergenciaId: string, bomberoId: string, pos: { lat: number; lng: number; accuracy: number }) {
    try {
      await supabase.from('posiciones_gps').insert({
        emergencia_id: emergenciaId,
        bombero_id: bomberoId,
        latitud: pos.lat,
        longitud: pos.lng,
        precision: pos.accuracy,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error subiendo posición:', error);
    }
  }

  async function seleccionarYRegistrar(bombero: Bombero) {
    if (!emergencia) return;

    localStorage.setItem('bomberoId', bombero.id);
    setMiBombero(bombero);

    try {
      await supabase.from('bombero_emergencia').insert({
        bombero_id: bombero.id,
        emergencia_id: emergencia.id,
        estado: 'OK',
        rol: 'Bombero',
      });

      // Recargar lista
      const { data: enfEmergData } = await supabase
        .from('bombero_emergencia')
        .select('*, bombero:bomberos(*)')
        .eq('emergencia_id', emergencia.id);

      setBomberosEnEmergencia(enfEmergData || []);
      setIsRegistered(true);
      setShowRegistro(false);
      
      // Iniciar GPS
      iniciarGPS(emergencia.id, bombero.id);
    } catch (error) {
      console.error('Error registrando:', error);
      alert('Error al registrarse. Intenta de nuevo.');
    }
  }

  async function cambiarEstado(nuevoEstado: Estado) {
    if (!miBombero || !emergencia) return;

    try {
      await supabase
        .from('bombero_emergencia')
        .update({ estado: nuevoEstado })
        .eq('bombero_id', miBombero.id)
        .eq('emergencia_id', emergencia.id);

      // Recargar
      const { data } = await supabase
        .from('bombero_emergencia')
        .select('*, bombero:bomberos(*)')
        .eq('emergencia_id', emergencia.id);

      setBomberosEnEmergencia(data || []);
    } catch (error) {
      console.error('Error cambiando estado:', error);
    }
  }

  function cerrarSesion() {
    localStorage.removeItem('bomberoId');
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    setMiBombero(null);
    setIsRegistered(false);
    setMiPosicion(null);
    setShowRegistro(true);
  }

  const emergenciaCoords = {
    lat: emergencia?.latitud ?? -33.0245,
    lng: emergencia?.longitud ?? -71.5513
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Conectando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-950">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-xl">🚒</span>
            </div>
            <div>
              <h1 className="text-white font-bold">ConteoSE7</h1>
              <p className="text-gray-400 text-xs">{emergencia?.codigo || 'Sin emergencia'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {miPosicion && (
              <div className="bg-blue-900/50 px-2 py-1 rounded text-blue-300 text-xs">
                📍 ±{Math.round(miPosicion.accuracy)}m
              </div>
            )}
            {miBombero && (
              <button onClick={cerrarSesion} className="text-gray-400 text-xs hover:text-white">
                Salir
              </button>
            )}
          </div>
        </div>

        {miPosicion && (
          <div className="mt-2 text-xs text-green-400">
            ✅ Ubicación activa: {miPosicion.lat.toFixed(6)}, {miPosicion.lng.toFixed(6)}
          </div>
        )}

        {gpsError && (
          <div className="mt-2 text-xs text-yellow-400">
            ⚠️ {gpsError}
          </div>
        )}
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <GpsMap
            emergenciaLat={emergenciaCoords.lat}
            emergenciaLng={emergenciaCoords.lng}
            miPosicion={miPosicion}
            bomberos={bomberosEnEmergencia}
          />
        </div>

        <aside className="w-80 bg-gray-900 border-l border-gray-800 overflow-y-auto hidden md:block">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-white font-semibold">Personal ({bomberosEnEmergencia.length})</h2>
          </div>

          <div className="p-4 space-y-3">
            {miBombero && (
              <div className="p-3 bg-blue-900/30 border border-blue-700 rounded-xl">
                <p className="text-blue-400 text-xs font-medium">TU UBICACIÓN</p>
                <p className="text-white font-medium">{miBombero.nombre}</p>
                <p className="text-gray-400 text-xs">{miBombero.grado}</p>
                {isRegistered && <p className="text-green-400 text-xs mt-1">✓ Registrado</p>}
              </div>
            )}

            {bomberosEnEmergencia.filter(b => b.bombero_id !== miBombero?.id).map((b) => (
              <div key={b.id} className="p-3 bg-gray-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white" style={{ backgroundColor: ESTADO_COLORS[b.estado] }}>
                    {(b.bombero?.nombre || 'B').charAt(0)}
                  </div>
                  <div>
                    <p className="text-white font-medium">{b.bombero?.nombre}</p>
                    <p className="text-xs" style={{ color: ESTADO_COLORS[b.estado] }}>{b.estado}</p>
                  </div>
                </div>
                {b.ultima_posicion && (
                  <p className="text-gray-500 text-xs mt-2">
                    📍 {b.ultima_posicion.latitud.toFixed(6)}, {b.ultima_posicion.longitud.toFixed(6)}
                  </p>
                )}
              </div>
            ))}
          </div>

          {miBombero && isRegistered && (
            <div className="p-4 border-t border-gray-800">
              <button
                onClick={() => {
                  const estados: Estado[] = ['OK', 'CANSADO', 'AGOTADO', 'LESIONADO'];
                  const estadoActual = bomberosEnEmergencia.find(b => b.bombero_id === miBombero.id)?.estado || 'OK';
                  const idxActual = estados.indexOf(estadoActual);
                  const siguiente = estados[(idxActual + 1) % estados.length];
                  cambiarEstado(siguiente);
                }}
                className="w-full bg-red-600 text-white font-semibold py-3 rounded-xl"
              >
                Cambiar Mi Estado
              </button>
            </div>
          )}
        </aside>
      </main>

      {showRegistro && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-700">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🚒</span>
              </div>
              <h2 className="text-white text-xl font-bold">¿Quién eres?</h2>
              <p className="text-gray-400 text-sm mt-2">
                Selecciona tu nombre para registrarte en la emergencia
              </p>
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {bomberos.map((b) => (
                <button
                  key={b.id}
                  onClick={() => seleccionarYRegistrar(b)}
                  className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left flex items-center gap-4 transition-colors"
                >
                  <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center">
                    <span className="text-red-400 font-bold text-lg">{b.nombre.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{b.nombre}</p>
                    <p className="text-gray-400 text-sm">{b.grado}</p>
                  </div>
                </button>
              ))}
            </div>

            {bomberos.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>No hay bomberos registrados</p>
                <p className="text-xs mt-2">Agrega datos en Supabase</p>
              </div>
            )}
          </div>
        </div>
      )}

      {gpsError && gpsError.includes('Permite') && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-yellow-900 text-white p-4 rounded-xl z-50">
          <p className="font-semibold">📍 Se necesita permiso de ubicación</p>
          <p className="text-sm mt-1">Toca el ícono de ubicación en tu navegador y permite el acceso</p>
        </div>
      )}
    </div>
  );
}
