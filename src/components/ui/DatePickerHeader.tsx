import { Calendar, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateFilter {
    start: Date | null;
    end: Date | null;
}

interface DatePickerProps {
    dateFilter: DateFilter;
    setDateFilter: (filter: DateFilter) => void;
    className?: string;
}

export const DatePickerHeader = ({
    dateFilter,
    setDateFilter,
    className
}: DatePickerProps) => {

    const formatDateForInput = (date: Date | null) => {
        if (!date) return "";
        const offset = date.getTimezoneOffset();
        const localDate = new Date(date.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    };

    const handleDateChange = (type: 'start' | 'end', value: string) => {
        const newDate = value ? new Date(value) : null;
        if (newDate) {
            const offset = newDate.getTimezoneOffset();
            newDate.setTime(newDate.getTime() + (offset * 60 * 1000));
        }

        setDateFilter({
            ...dateFilter,
            [type]: newDate
        });
    };

    const clearDateFilter = () => {
        setDateFilter({ start: null, end: null });
    };

    const hasFilter = dateFilter.start || dateFilter.end;

    return (
        <div className={cn("flex items-center gap-2 bg-muted/30 p-1 rounded-lg border border-border/50", className)}>
            <div className="flex items-center gap-2 px-2 border-r border-border/50 pr-3">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Filter</span>
            </div>

            <div className="flex items-center gap-1.5">
                <input
                    type="date"
                    className="bg-transparent text-[10px] font-mono text-foreground outline-none border-b border-transparent focus:border-accent w-24 dark:[color-scheme:dark]"
                    value={formatDateForInput(dateFilter.start)}
                    onChange={(e) => handleDateChange('start', e.target.value)}
                />
                <span className="text-muted-foreground text-[10px]">-</span>
                <input
                    type="date"
                    className="bg-transparent text-[10px] font-mono text-foreground outline-none border-b border-transparent focus:border-accent w-24 dark:[color-scheme:dark]"
                    value={formatDateForInput(dateFilter.end)}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                />
            </div>

            {hasFilter && (
                <button
                    onClick={clearDateFilter}
                    className="ml-1 p-1 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded-full transition-colors"
                >
                    <XCircle className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};
