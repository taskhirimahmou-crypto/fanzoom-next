import type { IconName } from '@/components/Icon';
import { Icon } from '@/components/Icon';

export function SectionTitle({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-container text-on-primary-container">
        <Icon name={icon} className="text-xl" />
      </span>
      <h2 className="text-xl font-black text-on-surface md:text-2xl">{title}</h2>
      <span className="h-px flex-1 bg-outline-variant/60" />
    </div>
  );
}