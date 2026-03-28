export interface Bombero {
  id: string;
  rut: string;
  nombre: string;
  grado: string;
  telefono?: string;
  es_activo: boolean;
  created_at: string;
}

export interface Emergencia {
  id: string;
  codigo: string;
  direccion: string;
  latitud: number | null;
  longitud: number | null;
  tipo: string;
  subclase?: string;
  estado: 'ACTIVA' | 'CONTROLADA' | 'FINALIZADA';
  created_at: string;
  updated_at: string;
  hora_inicio: string;
}

export interface PosicionGPS {
  id: string;
  emergencia_id: string;
  bombero_id: string;
  latitud: number;
  longitud: number;
  precision?: number;
  timestamp: string;
}

export interface BomberoEnEmergencia {
  id: string;
  emergencia_id: string;
  bombero_id: string;
  posicion_texto?: string;
  estado: 'OK' | 'CANSADO' | 'AGOTADO' | 'LESIONADO';
  rol?: string;
  hora_llegada: string;
  ultima_actualizacion: string;
  bombero?: Bombero;
  ultima_posicion?: {
    latitud: number;
    longitud: number;
    precision?: number;
    timestamp: string;
  };
}

export const ESTADOS = {
  OK: { color: '#22c55e', label: 'OK' },
  CANSADO: { color: '#eab308', label: 'CANSADO' },
  AGOTADO: { color: '#f97316', label: 'AGOTADO' },
  LESIONADO: { color: '#ef4444', label: 'LESIONADO' },
} as const;

export type Estado = keyof typeof ESTADOS;
