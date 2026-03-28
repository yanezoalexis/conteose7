'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface GpsPosition {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export function useGpsTracking(onPosition?: (pos: GpsPosition) => void) {
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const onPositionRef = useRef(onPosition);
  
  useEffect(() => {
    onPositionRef.current = onPosition;
  }, [onPosition]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      setIsSupported(true);
    } else {
      setIsSupported(false);
      setError('GPS no disponible en este dispositivo');
    }
  }, []);

  const handlePosition = useCallback((pos: GeolocationPosition) => {
    const now = Date.now();
    const gpsPos: GpsPosition = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp,
    };

    setPosition(gpsPos);
    setError(null);

    if (now - lastUpdateRef.current >= 2000) {
      lastUpdateRef.current = now;
      onPositionRef.current?.(gpsPos);
    }
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    let message = 'Error de GPS';
    switch (err.code) {
      case err.PERMISSION_DENIED:
        message = 'Permiso de ubicación denegado. Habilita el GPS en tu dispositivo.';
        break;
      case err.POSITION_UNAVAILABLE:
        message = 'Ubicación no disponible. Verifica tu conexión GPS.';
        break;
      case err.TIMEOUT:
        message = 'Tiempo de espera agotado. Reintentando...';
        break;
    }
    setError(message);
  }, []);

  const startTracking = useCallback(() => {
    if (!isSupported) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setError('Obteniendo ubicación...');
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, [isSupported, handlePosition, handleError]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    position,
    error,
    isTracking,
    isSupported,
    startTracking,
    stopTracking,
  };
}
