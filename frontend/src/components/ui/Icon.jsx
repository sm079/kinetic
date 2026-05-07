/**
 * Thin wrapper around Material Symbols Outlined icon font.
 * Usage: <Icon name="fitness_center" fill className="text-primary" />
 */
export default function Icon({ name, fill = false, className = '', style = {} }) {
  const fillStyle = fill ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : {};
  return (
    <span
      className={`material-symbols-outlined${className ? ` ${className}` : ''}`}
      style={{ ...fillStyle, ...style }}
    >
      {name}
    </span>
  );
}
