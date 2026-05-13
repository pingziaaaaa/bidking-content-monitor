import type { PlatformFilterValue } from '@/lib/mock-data';
import { platformFilters } from '@/lib/mock-data';

type PlatformFilterProps = {
  activeFilter: PlatformFilterValue;
  onFilterChange: (filter: PlatformFilterValue) => void;
};

export function PlatformFilter({ activeFilter, onFilterChange }: PlatformFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {platformFilters.map((filter) => {
        const isActive = filter === activeFilter;

        return (
          <button
            key={filter}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
            }`}
            type="button"
            onClick={() => onFilterChange(filter)}
          >
            {filter}
          </button>
        );
      })}
    </div>
  );
}
