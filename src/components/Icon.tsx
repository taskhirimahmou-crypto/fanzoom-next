import type { CSSProperties } from 'react';

export type IconName =
  | 'search'
  | 'menu'
  | 'close'
  | 'dark_mode'
  | 'light_mode'
  | 'expand_more'
  | 'arrow_back'
  | 'share'
  | 'visibility'
  | 'schedule'
  | 'bookmark'
  | 'bookmark_border'
  | 'person'
  | 'newspaper'
  | 'bolt'
  | 'trending_up'
  | 'send'
  | 'mail'
  | 'public'
  | 'rss'
  | 'smartphone'
  | 'memory'
  | 'smart_toy'
  | 'shield'
  | 'sports_esports'
  | 'watch'
  | 'headphones'
  | 'home'
  | 'electric_car'
  | 'code'
  | 'insights'
  | 'search_off'
  | 'check'
    | 'check'
  | 'error'
  | 'progress_activity'
  | 'logout'
    | 'logout'
  | 'calendar_month'
  | 'edit_note'
    | 'name'
    | 'login'
        | 'tune'
                | 'lock'

  | 'manage_accounts';

interface IconProps {
  name: IconName;
  className?: string;
  fill?: boolean;
  mirror?: boolean;
  style?: CSSProperties;
  'aria-label'?: string;
}

export function Icon({
  name,
  className,
  fill = false,
  mirror = false,
  style,
  'aria-label': ariaLabel,
}: IconProps) {
  const variation = fill
    ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24"
    : undefined;

  return (
    <span
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
      className={`material-symbols-rounded ${mirror ? 'icon-mirror' : ''} ${className ?? ''}`}
      style={{ fontVariationSettings: variation, ...style }}
    >
      {name}
    </span>
  );
}