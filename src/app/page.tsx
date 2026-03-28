'use client';

import { useEffect, useState, useRef } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>('Iniciando...');
  
  const watchIdRef = useRef<number | null>(null);
  const lastGpsUpload = useRef<number>(0);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Cargando emergencia...');
      const { data: empData, error: empError } = await supabase
        .from('emergencias')
        .select('*')
        .eq('estado', 'ACTIVA')
        .limit(1)
        .single();

      if (empError) {
        console.error('Error emergencia:', empError);
        setError('No se pudo cargar la emergencia');
        setIsLoading(false);
        return;
      }

      console.log('Emergencia:', empData);
      setEmergencia(empData);

      const { data: enfEmergData } = await supabase
        .from('bombero_emergencia')
        .select('*, bombero:bomberos(*)')
        .eq('emergencia_id', empData.id);

      setBomberosEnEmergencia(enfEmergData || []);

      console.log('Cargando bomberos...');
      const { data: bomData, error: bomError } = await supabase
        .from('bomberos')
        .select('*')
        .eq('es_activo', true)
        .order('nombre');

      if (bomError) {
        console.error('Error bomberos:', bomError);
        setError('No se pudieron cargar los bomberos');
        setIsLoading(false);
        return;
      }

      console.log('Bomberos:', bomData);
      setBomberos(bomData || []);

      const storedBomberoId = localStorage.getItem('bomberoId');
      if (storedBomberoId) {
        const bomberoData = bomData?.find(b => b.id === storedBomberoId);
        if (bomberoData) {
          setMiBombero(bomberoData);
          
          const registro = enfEmergData?.find(e => e.bombero_id === storedBomberoId);
          if (registro) {
            iniciarGPS(empData.id, storedBomberoId);
          }
        } else {
          localStorage.removeItem('bomberoId');
          setShowRegistro(true);
        }
      } else {
        setShowRegistro(true);
      }
    } catch (err) {
      console.error('Error general:', err);
      setError('Error de conexión: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }

  function iniciarGPS(emergenciaId: string, bomberoId: string) {
    setGpsStatus('Solicitando GPS...');

    if (!('geolocation' in navigator)) {
      setGpsStatus('GPS no disponible');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsStatus('GPS activo');
        const nuevaPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setMiPosicion(nuevaPos);

        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const p = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
            setMiPosicion(p);

            const now = Date.now();
            if (now - lastGpsUpload.current >= 2000) {
              lastGpsUpload.current = now;
              subirPosicion(emergenciaId, bomberoId, p);
            }
          },
          (err) => {
            setGpsStatus('Error GPS: ' + err.message);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      },
      (err) => {
        let msg = 'Permiso GPS denegado';
        if (err.code === err.POSITION_UNAVAILABLE) msg = 'GPS no disponible';
        if (err.code === err.TIMEOUT) msg = 'GPS timeout';
        setGpsStatus(msg);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
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
    } catch (err) {
      console.error('Error subiendo posición:', err);
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

      const { data } = await supabase
        .from('bombero_emergencia')
        .select('*, bombero:bomberos(*)')
        .eq('emergencia_id', emergencia.id);

      setBomberosEnEmergencia(data || []);
      setShowRegistro(false);
      iniciarGPS(emergencia.id, bombero.id);
    } catch (err) {
      console.error('Error registrando:', err);
      alert('Error al registrarse');
    }
  }

  function cerrarSesion() {
    localStorage.removeItem('bomberoId');
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    setMiBombero(null);
    setMiPosicion(null);
    setShowRegistro(true);
    setGpsStatus('Iniciando...');
  }

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

  if (error) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Error</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button onClick={cargarDatos} className="bg-blue-600 text-white px-6 py-3 rounded-xl">
            Reintentar
          </button>
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
              <p className="text-gray-400 text-xs">{emergencia?.codigo}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className={`px-2 py-1 rounded text-xs ${
              gpsStatus.includes('activo') ? 'bg-green-900/50 text-green-400' :
              gpsStatus.includes('Error') ? 'bg-red-900/50 text-red-400' :
              'bg-yellow-900/50 text-yellow-400'
            }`}>
              {gpsStatus}
            </div>
            {miBombero && (
              <button onClick={cerrarSesion} className="text-gray-400 text-xs hover:text-white">
                Salir
              </button>
            )}
          </div>
        </div>

        {miPosicion && (
          <div className="mt-2 text-xs text-green-400">
            ✅ {miPosicion.lat.toFixed(6)}, {miPosicion.lng.toFixed(6)} (±{Math.round(miPosicion.accuracy)}m)
          </div>
        )}
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <GpsMap
            emergenciaLat={emergencia?.latitud ?? -33.0245}
            emergenciaLng={emergencia?.longitud ?? -71.5513}
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
              </div>
            ))}
          </div>
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
              <p className="text-gray-400 text-sm mt-2">Selecciona tu nombre</p>
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
