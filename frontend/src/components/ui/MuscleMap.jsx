import { useEffect, useRef, useState } from 'react';
import { muscleName } from '../../lib/muscles';

// Maps exercise-catalog muscle IDs → actual mask filenames that exist on disk.
// Catalog often uses generic parent IDs; masks use specific sub-muscle names.
const MUSCLE_TO_MASKS = {
  // Chest
  pectoralis_major:     ['pectoralis_clavicular', 'pectoralis_sternal', 'pectoralis_costal'],
  pectoralis_clavicular:['pectoralis_clavicular'],
  pectoralis_sternal:   ['pectoralis_sternal'],
  pectoralis_costal:    ['pectoralis_costal'],
  serratus_anterior:    ['serratus_anterior'],
  // Back
  latissimus_dorsi:     ['latissimus_dorsi'],
  trapezius:            ['trapezius_upper', 'trapezius_middle', 'trapezius_lower'],
  trapezius_upper:      ['trapezius_upper'],
  trapezius_middle:     ['trapezius_middle'],
  trapezius_lower:      ['trapezius_lower'],
  rhomboids:            ['rhomboid_minor'],
  rhomboid_minor:       ['rhomboid_minor'],
  erector_spinae:       ['longissimus', 'spinalis'],
  teres_minor:          ['teres_minor'],
  infraspinatus:        ['infraspinatus'],
  supraspinatus:        ['supraspinatus'],
  rotator_cuff:         ['supraspinatus', 'infraspinatus', 'teres_minor'],
  // Shoulders
  deltoids:             ['deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior'],
  deltoid_anterior:     ['deltoid_anterior'],
  deltoid_lateral:      ['deltoid_lateral'],
  deltoid_posterior:    ['deltoid_posterior'],
  // Arms
  biceps_brachii:       ['biceps_long_head', 'biceps_short_head'],
  biceps_long_head:     ['biceps_long_head'],
  biceps_short_head:    ['biceps_short_head'],
  triceps_brachii:      ['triceps_long_head', 'triceps_short_head'],
  triceps_long_head:    ['triceps_long_head'],
  triceps_lateral_head: ['triceps_short_head'],
  triceps_medial_head:  ['triceps_short_head'],
  brachialis:           ['brachialis'],
  brachioradialis:      ['brachioradialis'],
  forearms:             ['wrist_flexors', 'wrist_extensors'],
  wrist_flexors:        ['wrist_flexors'],
  wrist_extensors:      ['wrist_extensors'],
  // Core
  rectus_abdominis:     ['upper_abs', 'lower_abs'],
  upper_abs:            ['upper_abs'],
  lower_abs:            ['lower_abs'],
  obliques:             ['external_obliques'],
  external_obliques:    ['external_obliques'],
  // Legs
  quadriceps:           ['rectus_femoris', 'vastus_lateralis', 'vastus_medialis'],
  rectus_femoris:       ['rectus_femoris'],
  vastus_lateralis:     ['vastus_lateralis'],
  vastus_medialis:      ['vastus_medialis'],
  hamstrings:           ['biceps_femoris', 'semitendinosus'],
  biceps_femoris:       ['biceps_femoris'],
  semitendinosus:       ['semitendinosus'],
  gluteus_maximus:      ['gluteus_maximus'],
  gluteus_medius:       ['gluteus_medius'],
  gluteus_minimus:      ['gluteus_minimus'],
  adductors:            ['adductors'],
  adductor_magnus:      ['adductors'],
  sartorius:            ['sartorius'],
  tensor_fasciae_latae: ['tensor_fasciae_latae'],
  gastrocnemius:        ['gastrocnemius_lateral', 'gastrocnemius_medial'],
  gastrocnemius_lateral:['gastrocnemius_lateral'],
  gastrocnemius_medial: ['gastrocnemius_medial'],
  soleus:               ['soleus'],
  tibialis_anterior:    ['tibialis_anterior'],
  // Other
  sternocleidomastoid:  ['sternocleidomastoid'],
};

function resolveMasks(muscleIds) {
  const files = new Set();
  for (const id of muscleIds) {
    const mapped = MUSCLE_TO_MASKS[id];
    if (mapped) mapped.forEach(f => files.add(f));
    else files.add(id); // try direct match as fallback
  }
  return [...files];
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Composite a muscle mask onto the canvas, revealing color.png through the mask.
// Works for both RGBA (transparent bg) and RGB (black bg) mask PNGs.
function applyMask(ctx, colorImg, maskImg, alpha) {
  const w = ctx.canvas.width, h = ctx.canvas.height;

  // Build a proper alpha mask from the mask image
  const tmpMask = document.createElement('canvas');
  tmpMask.width = w; tmpMask.height = h;
  const mctx = tmpMask.getContext('2d');
  mctx.drawImage(maskImg, 0, 0);
  const maskPx = mctx.getImageData(0, 0, w, h);

  // Determine if the mask uses its alpha channel or encodes the shape as luminance
  let usesAlpha = false;
  for (let i = 3; i < maskPx.data.length; i += 4) {
    if (maskPx.data[i] < 255) { usesAlpha = true; break; }
  }

  // Create an RGBA canvas that has the muscle region opaque and rest transparent
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = w; alphaCanvas.height = h;
  const actx = alphaCanvas.getContext('2d');

  if (usesAlpha) {
    // Mask already has a valid alpha channel — use it directly
    actx.drawImage(maskImg, 0, 0);
  } else {
    // Black-on-white RGB mask: use red channel as alpha
    const imgData = new ImageData(w, h);
    for (let i = 0; i < maskPx.data.length; i += 4) {
      imgData.data[i]     = 255;
      imgData.data[i + 1] = 255;
      imgData.data[i + 2] = 255;
      imgData.data[i + 3] = maskPx.data[i]; // red channel = luminance
    }
    actx.putImageData(imgData, 0, 0);
  }

  // Clip color.png to this alpha canvas
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const octx = off.getContext('2d');
  octx.drawImage(alphaCanvas, 0, 0);       // alpha mask as destination
  octx.globalCompositeOperation = 'source-in';
  octx.drawImage(colorImg, 0, 0);          // clip color image to mask shape

  ctx.globalAlpha = alpha;
  ctx.drawImage(off, 0, 0);
  ctx.globalAlpha = 1.0;
}

async function drawMap(canvas, gender, primary, secondary) {
  const ctx = canvas.getContext('2d');

  let base, color;
  try { base = await loadImg(`/images/${gender}/base.png`); }
  catch { return false; }
  try { color = await loadImg(`/images/${gender}/color.png`); }
  catch { color = null; }

  canvas.width  = base.naturalWidth;
  canvas.height = base.naturalHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0);

  if (!color) return true;

  // Resolve catalog IDs → actual mask filenames
  const secondaryFiles = resolveMasks(secondary);
  const primaryFiles   = resolveMasks(primary);

  // Draw secondary first (lower opacity), then primary on top
  for (const [files, alpha] of [
    [secondaryFiles, 0.30],
    [primaryFiles,   1.0],
  ]) {
    for (const file of files) {
      let mask;
      try { mask = await loadImg(`/images/${gender}/masks/${file}.png`); }
      catch { continue; }
      applyMask(ctx, color, mask, alpha);
    }
  }

  return true;
}

export default function MuscleMap({ primary = [], secondary = [], gender = 'male' }) {
  const canvasRef = useRef(null);
  const [baseOk, setBaseOk]     = useState(true);
  const [drawing, setDrawing]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDrawing(true);
    async function run() {
      if (!canvasRef.current) return;
      const ok = await drawMap(canvasRef.current, gender, primary, secondary);
      if (!cancelled) { setBaseOk(ok !== false); setDrawing(false); }
    }
    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary.join(','), secondary.join(','), gender]);

  return (
    <div className="space-y-4">

      {/* Framed body canvas */}
      <div className="relative flex justify-center">
        {baseOk
          ? <canvas ref={canvasRef} className="w-full h-auto border border-[#1e1e1e] rounded-xl" />
          : <div className="w-full h-72 flex items-center justify-center text-zinc-700 text-xs text-center leading-relaxed border border-[#1e1e1e] rounded-xl">
              Place images in<br />/images/{gender}/
            </div>
        }
        {drawing && baseOk && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-zinc-700 border-t-[#D1FF26] rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {primary.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5">Primary</p>
            <div className="flex flex-wrap gap-1.5">
              {primary.map(id => (
                <span key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D1FF26]/10 border border-[#D1FF26]/20 text-[10px] font-medium text-[#D1FF26]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1FF26] flex-shrink-0" />
                  {muscleName(id)}
                </span>
              ))}
            </div>
          </div>
        )}
        {secondary.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5">Secondary</p>
            <div className="flex flex-wrap gap-1.5">
              {secondary.map(id => (
                <span key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00e3fd]/10 border border-[#00e3fd]/20 text-[10px] font-medium text-[#00e3fd]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e3fd] flex-shrink-0" />
                  {muscleName(id)}
                </span>
              ))}
            </div>
          </div>
        )}
        {primary.length === 0 && secondary.length === 0 && (
          <p className="text-xs text-zinc-700">No muscle data for this session.</p>
        )}
      </div>

    </div>
  );
}
