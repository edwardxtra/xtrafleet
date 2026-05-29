'use client';

/**
 * Searchable owner-operator picker for the admin "Add Driver" / "Post Load"
 * dialogs (DEV-170). Lists pre-activated + active accounts; filters as the
 * admin types against legalName / companyName / contactEmail / dotNumber.
 *
 * Loads all matching accounts on mount via a single Firestore read against
 * the `owner_operators` collection — admin rules permit this read.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface PickerOwnerOperator {
  id: string;
  companyName?: string;
  legalName?: string;
  contactEmail?: string;
  dotNumber?: string;
  accountStatus?: string;
}

interface OwnerOperatorPickerProps {
  value: string;
  onChange: (id: string, owner: PickerOwnerOperator | null) => void;
  /** Disable opening the picker (e.g. when the dialog is mid-save). */
  disabled?: boolean;
  /** Optional initial filter (deep-link from /admin/onboard for example). */
  initialFilter?: string;
}

function displayName(o: PickerOwnerOperator): string {
  return o.companyName || o.legalName || o.contactEmail || o.id;
}

function searchHaystack(o: PickerOwnerOperator): string {
  return [o.companyName, o.legalName, o.contactEmail, o.dotNumber]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function OwnerOperatorPicker({
  value,
  onChange,
  disabled,
  initialFilter,
}: OwnerOperatorPickerProps) {
  const firestore = useFirestore();
  const [open, setOpen] = useState(false);
  const [owners, setOwners] = useState<PickerOwnerOperator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!firestore) return;
      try {
        const snap = await getDocs(collection(firestore, 'owner_operators'));
        if (cancelled) return;
        const list: PickerOwnerOperator[] = [];
        snap.forEach((doc) => {
          const data = doc.data() as Record<string, unknown>;
          const status = (data.accountStatus as string) || 'active';
          if (status === 'suspended') return;
          // Skip admins — we never onboard data on behalf of admin accounts.
          if (data.isAdmin === true) return;
          list.push({
            id: doc.id,
            companyName: data.companyName as string | undefined,
            legalName: data.legalName as string | undefined,
            contactEmail: data.contactEmail as string | undefined,
            dotNumber: data.dotNumber as string | undefined,
            accountStatus: status,
          });
        });
        list.sort((a, b) => displayName(a).localeCompare(displayName(b)));
        setOwners(list);
      } catch (err) {
        console.error('[OwnerOperatorPicker] failed to load owner-operators', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [firestore]);

  const selected = useMemo(() => owners.find((o) => o.id === value), [owners, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          {loading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
            </span>
          ) : selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="truncate">{displayName(selected)}</span>
              {selected.accountStatus === 'pre-activated' && (
                <Badge variant="outline" className="text-xs">
                  Pre-activated
                </Badge>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Select an owner-operator…</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,90vw)] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            // itemValue is the haystack we attach below; case-insensitive substring
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput
            placeholder="Search by company, email, or DOT…"
            defaultValue={initialFilter}
          />
          <CommandList>
            <CommandEmpty>No matching accounts.</CommandEmpty>
            <CommandGroup>
              {owners.map((o) => (
                <CommandItem
                  key={o.id}
                  value={searchHaystack(o)}
                  onSelect={() => {
                    onChange(o.id, o);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      'h-4 w-4',
                      value === o.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-1 min-w-0 flex-col">
                    <span className="truncate text-sm">{displayName(o)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {o.contactEmail || '—'}
                      {o.dotNumber ? ` · DOT ${o.dotNumber}` : ''}
                    </span>
                  </div>
                  {o.accountStatus === 'pre-activated' && (
                    <Badge variant="outline" className="text-xs">
                      Pre-activated
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
