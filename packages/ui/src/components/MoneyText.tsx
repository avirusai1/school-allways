import { formatIndianMoney } from '../format';

export { formatIndianMoney, formatIndianNumber } from '../format';

export function MoneyText({
  paise,
  showPaise = true,
  className = '',
}: {
  paise: number;
  showPaise?: boolean;
  className?: string;
}) {
  return (
    <span className={`font-medium tabular-nums text-body text-grey-900 ${className}`}>
      {formatIndianMoney(paise, showPaise)}
    </span>
  );
}
