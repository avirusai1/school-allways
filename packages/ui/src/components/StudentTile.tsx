import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
import { ListRow } from './ListRow';

export interface StudentTileProps {
  name: string;
  subtitle?: string;
  photoUrl?: string | null;
  trailing?: ReactNode;
  onClick?: () => void;
  showChevron?: boolean;
}

/** Dense student row — avatar + name + optional class/roll subtitle. */
export function StudentTile({
  name,
  subtitle,
  photoUrl,
  trailing,
  onClick,
  showChevron = true,
}: StudentTileProps) {
  return (
    <ListRow
      title={name}
      subtitle={subtitle}
      leading={<Avatar name={name} src={photoUrl} size={40} />}
      trailing={trailing}
      onClick={onClick}
      showChevron={showChevron}
    />
  );
}
