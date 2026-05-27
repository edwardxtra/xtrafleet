'use client';

/**
 * /admin/search?q=… — DEV-166 global admin search. Calls /api/admin/search
 * and renders results grouped by entity type. Each result links to the
 * relevant admin list page with `?q=<id>` so the list pre-filters to that
 * entity.
 */
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  Building2,
  Truck,
  Package,
  Link2,
  FileText,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useAdminRole } from '../layout';
import { showError } from '@/lib/toast-utils';

interface SearchResult {
  id: string;
  label: string;
  sub?: string;
  detail?: string;
}

interface SearchResponse {
  owner_operators: SearchResult[];
  drivers: SearchResult[];
  loads: SearchResult[];
  matches: SearchResult[];
  tlas: SearchResult[];
}

const EMPTY: SearchResponse = {
  owner_operators: [],
  drivers: [],
  loads: [],
  matches: [],
  tlas: [],
};

function SearchContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { hasPermission } = useAdminRole();
  const canView = hasPermission('audit:view');

  const initialQ = params.get('q') || '';
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<SearchResponse>(EMPTY);
  const [loading, setLoading] = useState(false);

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) {
      setResults(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Search failed.');
      setResults(data as SearchResponse);
    } catch (e: any) {
      showError(e?.message || 'Search failed.');
      setResults(EMPTY);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canView && initialQ) runSearch(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, initialQ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/admin/search?q=${encodeURIComponent(trimmed)}`);
    runSearch(trimmed);
  };

  if (!canView) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>No access</CardTitle>
          <CardDescription>Your admin role can&apos;t search the platform.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const total =
    results.owner_operators.length +
    results.drivers.length +
    results.loads.length +
    results.matches.length +
    results.tlas.length;

  const renderGroup = (
    title: string,
    icon: React.ReactNode,
    items: SearchResult[],
    listHref: string
  ) => {
    if (items.length === 0) return null;
    return (
      <Card key={title}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            {title}
            <Badge variant="outline" className="ml-2">{items.length}{items.length === 10 ? '+' : ''}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((it) => (
            <Link
              key={it.id}
              href={`${listHref}?q=${encodeURIComponent(it.id)}`}
              className="block rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{it.label}</p>
                  {it.sub && <p className="text-xs text-muted-foreground truncate">{it.sub}</p>}
                  {it.detail && <p className="text-xs text-muted-foreground truncate">{it.detail}</p>}
                  <p className="font-mono text-xs text-muted-foreground mt-1">{it.id}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
          <Search className="h-7 w-7" />
          Global Search
        </h1>
        <p className="text-muted-foreground">
          Search across users, drivers, loads, matches, and TLAs.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by id, email, DOT, company, route, driver…"
            className="pl-8"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={loading || !q.trim()}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
          Search
        </Button>
      </form>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : initialQ ? (
        total === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No results for &ldquo;{initialQ}&rdquo;.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {renderGroup('Users (Owner-Operators)', <Building2 className="h-4 w-4" />, results.owner_operators, '/admin/users')}
            {renderGroup('Drivers', <Truck className="h-4 w-4" />, results.drivers, '/admin/drivers')}
            {renderGroup('Loads', <Package className="h-4 w-4" />, results.loads, '/admin/loads')}
            {renderGroup('Matches', <Link2 className="h-4 w-4" />, results.matches, '/admin/matches')}
            {renderGroup('TLAs', <FileText className="h-4 w-4" />, results.tlas, '/admin/tlas')}
          </div>
        )
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Enter a search term above to find anything across the admin console.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AdminSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
