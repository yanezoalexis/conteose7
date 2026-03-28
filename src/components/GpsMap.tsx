'use client';

import { useEffect, useRef, useState } from 'react';
import type { BomberoEnEmergencia, Estado } from '@/lib/types';

interface GpsMapProps {
  emergenciaLat: number;
  emergenciaLng: number;
  miPosicion: { lat: number; lng: number; accuracy: number } | null;
  bomberos: BomberoEnEmergencia[];
  className?: string;
}

const ESTADO_COLORS: Record<Estado, string> = {
  OK: '#22c55e',
  CANSADO: '#eab308',
  AGOTADO: '#f97316',
  LESIONADO: '#ef4444',
};

export function GpsMap({
  emergenciaLat,
  emergenciaLng,
  miPosicion,
  bomberos,
  className = '',
}: GpsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    let map: any = null;

    async function initMap() {
      if (!mapContainerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const L = (await import('leaflet')).default;

      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      if (!mapContainerRef.current || !mounted) return;

      map = L.map(mapContainerRef.current, {
        center: [emergenciaLat, emergenciaLng],
        zoom: 17,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const emergenciaIcon = L.divIcon({
        className: 'emergencia-marker',
        html: `<div style="width:50px;height:50px;background:#dc2626;border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:24px;">🚨</span></div>`,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
      });

      L.marker([emergenciaLat, emergenciaLng], { icon: emergenciaIcon })
        .addTo(map)
        .bindPopup('<div style="text-align:center;"><strong>EMERGENCIA</strong></div>');

      mapRef.current = map;
      if (mounted) setIsLoaded(true);
    }

    initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [emergenciaLat, emergenciaLng]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;

    const map = mapRef.current;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;

      if (miPosicion) {
        const myIcon = L.divIcon({
          className: 'my-position-marker',
          html: `<div style="position:relative;width:40px;height:40px;"><div style="position:absolute;width:60px;height:60px;top:-10px;left:-10px;background:rgba(59,130,246,0.3);border-radius:50%;animation:gps-pulse 1.5s ease-out infinite;"></div><div style="width:40px;height:40px;background:#3b82f6;border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:14px;font-weight:bold;">YO</span></div></div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        const myMarker = L.marker([miPosicion.lat, miPosicion.lng], { icon: myIcon })
          .addTo(map);

        myMarker.bindPopup(`<div><strong style="color:#3b82f6;">TU UBICACIÓN</strong><br>Lat: ${miPosicion.lat.toFixed(6)}<br>Lng: ${miPosicion.lng.toFixed(6)}<br>Precisión: ±${Math.round(miPosicion.accuracy)}m</div>`);

        markersRef.current.set('mi-posicion', myMarker);
      }

      bomberos.forEach((bombero) => {
        if (!bombero.ultima_posicion) return;

        const { latitud, longitud } = bombero.ultima_posicion;
        const color = ESTADO_COLORS[bombero.estado];
        const nombre = bombero.bombero?.nombre || 'Bombero';

        const bomberoIcon = L.divIcon({
          className: 'bombero-marker',
          html: `<div style="width:40px;height:40px;background:${color};border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;font-size:16px;">${nombre.charAt(0).toUpperCase()}</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        const marker = L.marker([latitud, longitud], { icon: bomberoIcon })
          .addTo(map);

        marker.bindPopup(`<div><strong>${nombre}</strong><br>${bombero.estado}</div>`);

        markersRef.current.set(bombero.id, marker);
      });
    });
  }, [bomberos, miPosicion, isLoaded]);

  return (
    <div className={`relative w-full h-full ${className}`} style={{ minHeight: '400px' }}>
      <div ref={mapContainerRef} id="gps-map" className="w-full h-full" />
      
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-10">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}
