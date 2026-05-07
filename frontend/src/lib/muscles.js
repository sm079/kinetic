// Human-readable display names for muscle IDs
export const MUSCLE_NAMES = {
  // Chest
  pectoralis_major:    'Pecs',
  pectoralis_clavicular: 'Upper Pecs',
  pectoralis_sternal:  'Mid Pecs',
  pectoralis_costal:   'Lower Pecs',
  pectoralis_minor:    'Pec Minor',
  serratus_anterior:   'Serratus',
  // Back
  latissimus_dorsi:    'Lats',
  trapezius:           'Traps',
  trapezius_upper:     'Upper Traps',
  trapezius_middle:    'Mid Traps',
  trapezius_lower:     'Lower Traps',
  rhomboids:           'Rhomboids',
  erector_spinae:      'Erectors',
  teres_major:         'Teres Major',
  teres_minor:         'Teres Minor',
  infraspinatus:       'Infraspinatus',
  rotator_cuff:        'Rotator Cuff',
  // Shoulders
  deltoids:            'Delts',
  deltoid_anterior:    'Front Delt',
  deltoid_lateral:     'Side Delt',
  deltoid_posterior:   'Rear Delt',
  supraspinatus:       'Supraspinatus',
  // Arms
  biceps_brachii:      'Biceps',
  biceps_long_head:    'Biceps (Long)',
  biceps_short_head:   'Biceps (Short)',
  triceps_brachii:     'Triceps',
  triceps_long_head:   'Triceps (Long)',
  triceps_lateral_head:'Triceps (Lat)',
  triceps_medial_head: 'Triceps (Med)',
  brachialis:          'Brachialis',
  brachioradialis:     'Brachioradialis',
  wrist_flexors:       'Wrist Flexors',
  wrist_extensors:     'Wrist Extensors',
  forearms:            'Forearms',
  // Legs
  quadriceps:          'Quads',
  hamstrings:          'Hamstrings',
  gluteus_maximus:     'Glutes',
  gluteus_medius:      'Glute Med',
  gluteus_minimus:     'Glute Min',
  adductors:           'Adductors',
  adductor_magnus:     'Add. Magnus',
  gastrocnemius:       'Calves',
  soleus:              'Soleus',
  tensor_fasciae_latae:'TFL',
  rectus_femoris:      'Rectus Fem.',
  vastus_lateralis:    'Vastus Lat.',
  vastus_medialis:     'Vastus Med.',
  // Core
  rectus_abdominis:    'Abs',
  upper_abs:           'Upper Abs',
  lower_abs:           'Lower Abs',
  obliques:            'Obliques',
  external_obliques:   'Ext. Obliques',
  transversus_abdominis:'TVA',
  iliopsoas:           'Iliopsoas',
  quadratus_lumborum:  'QL',
  // Other
  sternocleidomastoid: 'SCM',
  splenius:            'Splenius',
};

export function muscleName(id) {
  return MUSCLE_NAMES[id] ?? id.replace(/_/g, ' ');
}

// Strength level thresholds as colors + labels
export const LEVEL_CONFIG = {
  beginner:     { label: 'Beginner',     color: '#adaaaa', bg: 'bg-zinc-700/40',      text: 'text-zinc-400'  },
  novice:       { label: 'Novice',       color: '#60a5fa', bg: 'bg-blue-500/15',       text: 'text-blue-400'  },
  intermediate: { label: 'Intermediate', color: '#34d399', bg: 'bg-emerald-500/15',    text: 'text-emerald-400'},
  advanced:     { label: 'Advanced',     color: '#f472b6', bg: 'bg-pink-500/15',       text: 'text-pink-400'  },
  elite:        { label: 'Elite',        color: '#D1FF26', bg: 'bg-[#D1FF26]/15',      text: 'text-[#D1FF26]' },
};

/**
 * Compute strength level from a standards table (from the Exercise model).
 * @param {Array}  table   - [{ bw, beg, nov, int, adv, elite }, ...]
 * @param {number} weight  - lifted weight in kg
 * @param {number} bodyweight - athlete bodyweight in kg
 * @returns {string|null} 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite' | null
 */
export function computeLevel(table, weight, bodyweight) {
  if (!table?.length || !weight || !bodyweight) return null;
  const row = table.reduce((best, r) =>
    Math.abs(r.bw - bodyweight) < Math.abs(best.bw - bodyweight) ? r : best
  );
  if (weight < row.beg)   return 'beginner';
  if (weight < row.nov)   return 'novice';
  if (weight < row.int)   return 'intermediate';
  if (weight < row.adv)   return 'advanced';
  if (weight < row.elite) return 'advanced';
  return 'elite';
}
