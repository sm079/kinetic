import { kgToDisplayStr } from './units';

/**
 * Converts a program day's activities (from the API) into the format expected
 * by TrackWorkoutPage's local state.
 *
 * @param {Array}  activities  - raw activities array from the API
 * @param {string} [units]     - 'metric' | 'imperial' (default: 'metric')
 *                               Weight strings in state will be in this unit.
 */
export function hydrateActivitiesForTracker(activities, units = 'metric') {
  let counter = 0;
  const uid = () => `${Date.now()}-${++counter}`;

  return (activities ?? []).map(a => {
    const id = uid();
    if (a.type === 'lift') {
      return {
        id,
        type: 'lift',
        name: a.name ?? '',
        note: a.note ?? '',
        sets: (a.sets ?? []).map(s => ({
          id: uid(),
          isWarmup: s.is_warmup ?? false,
          targetWeight: kgToDisplayStr(s.target_performance?.weight_kg, units),
          targetReps: s.target_performance?.reps != null ? String(s.target_performance.reps) : '',
          weight: '',
          reps: '',
          intensity: (() => {
            const i = s.target_performance?.intensity;
            if (!i) return 'RIR 2';
            return i.type === 'rpe' ? `RPE ${i.value}` : `RIR ${i.value}`;
          })(),
          done: false,
        })),
      };
    }
    return {
      id,
      type: 'cardio',
      name: a.name ?? '',
      note: a.note ?? '',
      distance: '',
      duration: a.duration_seconds ? String(Math.round(a.duration_seconds / 60)) : '',
      intensity: (() => {
        const i = a.intensity;
        if (!i) return 'RPE 6';
        return i.type === 'rpe' ? `RPE ${i.value}` : 'RPE 6';
      })(),
    };
  });
}
