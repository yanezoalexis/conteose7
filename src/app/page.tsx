'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useGpsTracking } from '@/hooks/useGpsTracking';
import type { Bombero, BomberoEnEmergencia, Estado, Emergencia, PosicionGPS } from '@/lib/types';

const GpsMap = dynamic(() => import('@/components/GpsMap').then(mod => ({ default: mod.GpsMap })), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-900 flex items-center justify-center"><div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div></div>
});

const ESTADO_COLORS: Record<Estado, { bg: string; text: string }> = {
  OK: { bg: 'bg-green-500/20', text: 'text-green-400' },
  CANSADO: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  AGOTADO: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  LESIONADO: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

export default function TrackingPage() {
  const [bomberos, setBomberos] = useState<BomberoEnEmergencia[]>([]);
  const [emergencia, setEmergencia] = useState<Emergencia | null>(null);
  const [miBombero, setMiBombero] = useState<Bombero | null>(null);
  const [miAsignacionId, setMiAsignacionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegistro, setShowRegistro] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [log, setLog] = useState<string[]>([]);
  
  const lastGpsUpload = useRef<number>(0);
  const realtimeChannel = useRef<any>(null);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 5));
  }, []);

  const handleGpsPosition = useCallback(async (pos: { lat: number; lng: number; accuracy: number }) => {
    const bomberoId = localStorage.getItem('bomberoId');
    if (!bomberoId || !emergencia) return;

    let asignacionId = miAsignacionId;
    
    if (!asignacionId) {
      try {
        const { data } = await supabase
          .from('bombero_emergencia')
          .select('id')
          .eq('bombero_id', bomberoId)
          .eq('emergencia_id', emergencia.id)
          .single();
        
        if (data) {
          asignacionId = data.id;
          setMiAsignacionId(data.id);
        } else {
          addLog('⏳ No registrado aún');
          return;
        }
      } catch {
        addLog('❌ Error verificando registro');
        return;
      }
    }

    const now = Date.now();
    if (now - lastGpsUpload.current < 2000) return;
    lastGpsUpload.current = now;

    addLog(`📤 GPS: ${pos.lat.toFixed(6)}`);

    try {
      await supabase.from('posiciones_gps').insert({
        emergencia_id: emergencia.id,
        bombero_id: bomberoId,
        latitud: pos.lat,
        longitud: pos.lng,
        precision: pos.accuracy,
        timestamp: new Date().toISOString(),
      });
      addLog('✅ Sincronizado');
    } catch {
      addLog('❌ Error de conexión');
    }
  }, [emergencia, miAsignacionId, addLog]);

  const { position, error: gpsError, isTracking, startTracking, stopTracking, isSupported } = useGpsTracking(handleGpsPosition);

  const miPosicion = position ? { lat: position.lat, lng: position.lng, accuracy: position.accuracy } : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const bomberoId = localStorage.getItem('bomberoId');
    
    if (!bomberoId) {
      setShowRegistro(true);
      setIsLoading(false);
      return;
    }
    
    async function loadData() {
      try {
        const { data: bomberoData } = await supabase
          .from('bomberos')
          .select('*')
          .eq('id', bomberoId)
          .single();
        
        if (bomberoData) {
          setMiBombero(bomberoData);
        }
      } catch (e) {
        console.error('Error loading bombero:', e);
      }
    }
    
    loadData();
    loadEmergencia();
  }, []);

  async function loadEmergencia() {
    try {
      const { data: emergenciaData } = await supabase
        .from('emergencias')
        .select('*')
        .eq('estado', 'ACTIVA')
        .limit(1)
        .single();

      if (emergenciaData) {
        setEmergencia(emergenciaData);
        addLog(`🚨 ${emergenciaData.codigo}`);
        loadBomberos(emergenciaData.id);
      } else {
        setEmergencia({
          id: 'demo',
          codigo: 'DEMO-001',
          tipo: 'INCENDIO',
          direccion: 'Viña del Mar',
          latitud: -33.0245,
          longitud: -71.5513,
          estado: 'ACTIVA',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          hora_inicio: new Date().toISOString(),
        });
        addLog('🚨 Modo DEMO');
        setIsLoading(false);
      }
    } catch {
      setEmergencia({
        id: 'demo',
        codigo: 'DEMO-001',
        tipo: 'INCENDIO',
        direccion: 'Viña del Mar',
        latitud: -33.0245,
        longitud: -71.5513,
        estado: 'ACTIVA',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        hora_inicio: new Date().toISOString(),
      });
      addLog('🚨 Modo DEMO');
      setIsLoading(false);
    }
  }

  async function loadBomberos(emergenciaId: string) {
    try {
      const { data } = await supabase
        .from('bombero_emergencia')
        .select('*, bombero:bomberos(*)')
        .eq('emergencia_id', emergenciaId);

      setBomberos(data || []);
      addLog(`👥 ${data?.length || 0} bomberos`);

      const bomberoId = localStorage.getItem('bomberoId');
      const miAsign = data?.find(b => b.bombero_id === bomberoId);
      if (miAsign) {
        setMiAsignacionId(miAsign.id);
      }
    } catch (e) {
      console.error('Error loading bomberos:', e);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!emergencia) return;

    const channel = supabase
      .channel('posiciones')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posiciones_gps',
        filter: `emergencia_id=eq.${emergencia.id}`,
      }, (payload) => {
        const newPos = payload.new as PosicionGPS;
        
        setBomberos(prev => prev.map(b => {
          if (b.bombero_id === newPos.bombero_id) {
            return { ...b, ultima_posicion: { latitud: newPos.latitud, longitud: newPos.longitud, precision: newPos.precision, timestamp: newPos.timestamp } };
          }
          return b;
        }));
      })
      .subscribe((status) => {
        setConnectionStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected');
        if (status === 'SUBSCRIBED') addLog('🔗 Conectado');
      });

    realtimeChannel.current = channel;

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current);
      }
    };
  }, [emergencia, addLog]);

  useEffect(() => {
    if (!showRegistro && miBombero) {
      startTracking();
      addLog('🛰️ GPS iniciando...');
    }
    return () => stopTracking();
  }, [showRegistro, miBombero, startTracking, stopTracking, addLog]);

  async function registrarEnEmergencia() {
    const bomberoId = localStorage.getItem('bomberoId');
    if (!bomberoId || !emergencia) return;

    try {
      const { data, error } = await supabase
        .from('bombero_emergencia')
        .insert({
          bombero_id: bomberoId,
          emergencia_id: emergencia.id,
          estado: 'OK',
          rol: 'Bombero',
        })
        .select('id')
        .single();

      if (error) throw error;

      if (data) {
        setMiAsignacionId(data.id);
        setShowRegistro(false);
        addLog('✅ Registrado');
        startTracking();
        
        const { data: updated } = await supabase
          .from('bombero_emergencia')
          .select('*, bombero:bomberos(*)')
          .eq('emergencia_id', emergencia.id);
        setBomberos(updated || []);
      }
    } catch (e) {
      addLog('❌ Error al registrar');
      console.error(e);
    }
  }

  async function cambiarEstado(nuevoEstado: Estado) {
    if (!miAsignacionId) return;

    await supabase
      .from('bombero_emergencia')
      .update({ estado: nuevoEstado })
      .eq('id', miAsignacionId);

    setBomberos(prev => prev.map(b => b.id === miAsignacionId ? { ...b, estado: nuevoEstado } : b));
    addLog(`✅ Estado: ${nuevoEstado}`);
  }

  async function seleccionarBombero(bombero: Bombero) {
    localStorage.setItem('bomberoId', bombero.id);
    setMiBombero(bombero);
    setShowRegistro(false);
    startTracking();
    addLog(`✅ Identificado: ${bombero.nombre}`);
  }

  const bomberoId = typeof window !== 'undefined' ? localStorage.getItem('bomberoId') : null;
  const miBomberoEnEmergencia = bomberos.find(b => b.bombero_id === bomberoId);

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

  const emergenciaCoords = {
    lat: emergencia?.latitud ?? -33.0245,
    lng: emergencia?.longitud ?? -71.5513
  };

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
            <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-gray-400 text-xs">{connectionStatus === 'connected' ? 'En línea' : 'Offline'}</span>
            
            {isTracking && miPosicion && (
              <div className="bg-blue-900/50 px-2 py-1 rounded text-blue-300 text-xs">
                ±{Math.round(miPosicion.accuracy)}m
              </div>
            )}
          </div>
        </div>

        {miPosicion && (
          <div className="mt-2 text-xs text-gray-500">
            📍 {miPosicion.lat.toFixed(6)}, {miPosicion.lng.toFixed(6)}
          </div>
        )}

        <div className="mt-1 text-xs text-gray-600">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <div className="w-full h-full">
            <GpsMap
              emergenciaLat={emergenciaCoords.lat}
              emergenciaLng={emergenciaCoords.lng}
              miPosicion={miPosicion}
              bomberos={bomberos}
            />
          </div>
        </div>

        <aside className="w-80 bg-gray-900 border-l border-gray-800 overflow-y-auto hidden md:block">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-white font-semibold">Personal ({bomberos.length})</h2>
          </div>

          <div className="p-4 space-y-3">
            {miBombero && (
              <div className="p-3 bg-blue-900/30 border border-blue-700 rounded-xl">
                <p className="text-blue-400 text-xs font-medium">TÚ</p>
                <p className="text-white font-medium">{miBombero.nombre}</p>
                <p className="text-gray-400 text-xs">{miBombero.grado}</p>
                {miBomberoEnEmergencia ? (
                  <p className="text-green-400 text-xs mt-1">✓ Registrado</p>
                ) : (
                  <p className="text-yellow-400 text-xs mt-1">⏳ Sin registrar</p>
                )}
              </div>
            )}

            {bomberos.filter(b => b.bombero_id !== bomberoId).map((b) => {
              const colors = ESTADO_COLORS[b.estado];
              return (
                <div key={b.id} className="p-3 bg-gray-800/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white" style={{ backgroundColor: ESTADO_COLORS[b.estado].text.replace('text-', '#').replace('-400', '') }}>
                      {(b.bombero?.nombre || 'B').charAt(0)}
                    </div>
                    <div>
                      <p className="text-white font-medium">{b.bombero?.nombre}</p>
                      <p className={`text-xs ${colors.text}`}>{b.estado}</p>
                    </div>
                  </div>
                  {b.ultima_posicion && (
                    <p className="text-gray-500 text-xs mt-2">
                      📍 {b.ultima_posicion.latitud.toFixed(6)}, {b.ultima_posicion.longitud.toFixed(6)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-gray-800 space-y-2">
            {miBomberoEnEmergencia ? (
              <button
                onClick={() => {
                  const estado = prompt('Nuevo estado (OK, CANSADO, AGOTADO, LESIONADO):');
                  if (estado && ['OK', 'CANSADO', 'AGOTADO', 'LESIONADO'].includes(estado)) {
                    cambiarEstado(estado as Estado);
                  }
                }}
                className="w-full bg-red-600 text-white font-semibold py-3 rounded-xl"
              >
                Cambiar Mi Estado
              </button>
            ) : (
              <button
                onClick={registrarEnEmergencia}
                className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl"
              >
                Registrarse en Emergencia
              </button>
            )}
          </div>
        </aside>
      </main>

      {showRegistro && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-700">
            <h2 className="text-white text-xl font-bold mb-4 text-center">¿Quién eres?</h2>
            <p className="text-gray-400 text-sm text-center mb-4">
              Selecciona tu nombre para identificarte en la emergencia
            </p>
            
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {bomberos.map((b) => (
                <button
                  key={b.id}
                  onClick={() => seleccionarBombero(b.bombero!)}
                  className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left flex items-center gap-4"
                >
                  <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center">
                    <span className="text-red-400 font-bold text-lg">{(b.bombero?.nombre || 'B').charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{b.bombero?.nombre}</p>
                    <p className="text-gray-400 text-sm">{b.bombero?.grado}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {gpsError && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-red-900 text-white p-4 rounded-xl z-50">
          <p className="font-semibold">⚠️ {gpsError}</p>
        </div>
      )}
    </div>
  );
}
