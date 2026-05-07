import { useAuth } from '../context/AuthContext';

const KG_TO_LBS = 2.20462;

/**
 * Convert a stored kg value to the user's preferred display unit.
 * Returns a number (or null if input is null/NaN).
 */
export function kgToDisplay(kg, units) {
  if (kg == null) return null;
  const n = Number(kg);
  if (isNaN(n)) return null;
  return units === 'imperial' ? +(n * KG_TO_LBS).toFixed(1) : +n.toFixed(2);
}

/**
 * Convert a display-unit value (string or number) back to kg for DB storage.
 * Returns null for empty/invalid input.
 */
export function displayToKg(val, units) {
  if (val === '' || val == null) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return units === 'imperial' ? +(n / KG_TO_LBS).toFixed(3) : n;
}

/** Short unit label: 'kg' or 'lbs' */
export function weightUnit(units) {
  return units === 'imperial' ? 'lbs' : 'kg';
}

/**
 * Format a kg value for display with unit suffix, e.g. "82.5 kg" or "181.9 lbs".
 * Returns '—' for null/undefined.
 */
export function fmtWeight(kg, units) {
  if (kg == null) return '—';
  const n = kgToDisplay(kg, units);
  if (n == null) return '—';
  return `${n} ${weightUnit(units)}`;
}

/**
 * Convert a kg string from the API into a display-unit string for use as
 * an input field initial value. Returns '' for null.
 */
export function kgToDisplayStr(kg, units) {
  if (kg == null || kg === '') return '';
  const n = kgToDisplay(Number(kg), units);
  return n == null ? '' : String(n);
}

/**
 * React hook — reads preferred_units from AuthContext and returns helpers.
 */
export function useUnits() {
  const { user } = useAuth();
  const units = user?.preferred_units ?? 'metric';
  return {
    units,
    unit: weightUnit(units),
    fmtWeight: (kg) => fmtWeight(kg, units),
    kgToDisplay: (kg) => kgToDisplay(kg, units),
    displayToKg: (val) => displayToKg(val, units),
    kgToDisplayStr: (kg) => kgToDisplayStr(kg, units),
  };
}
