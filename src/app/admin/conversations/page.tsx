'use client';

/**
 * /admin/conversations — DEV-165: admin / support view of all conversations
 * across the platform, with the ability to soft-delete individual messages
 * for dispute resolution and moderation.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { MessageSquare, Search, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast-utils';
import { useAdminRole } from '../layout';

interface Conversation {
  id: string;
  participants?: string[];
  participantDetails?: Record<string, { companyName?: string; email?: string }>;
  loadDetails?: { origin?: string; destination?: string; cargo?: string };
  tlaId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  createdAt?: string;
}

interface Message {
  id: string;
  text?: string;
  originalText?: string;
  senderId?: string;
  senderName?: string;
  createdAt?: any;
  deletedAt?: string;
  deletedBy?: string;
  deletedReason?: string;
}

function formatTimestamp(ts: any): string {
  if (!ts) return '—';
  try {
    const d = typeof ts === 'string' ? new Date(ts) : ts?.toDate ? ts.toDate() : new Date(ts);
    return format(d, 'PPp');
  } catch {
    return String(ts);
  }
}

function summarizeParticipants(c: Conversation): string {
  if (!c.participantDetails) return '—';
  const names = Object.values(c.participantDetails).map(
    (p) => p?.companyName || p?.email || '?'
  );
  return names.join(' ↔ ');
}

export default function AdminConversationsPage() {
  const { hasPermission } = useAdminRole();
  const canView = hasPermission('audit:view');
  const canModerate = hasPermission('users:edit');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [openConv, setOpenConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  async function loadConversations() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/conversations');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load conversations.');
      setConversations(data.conversations || []);
    } catch (e: any) {
      showError(e?.message || 'Failed to load conversations.');
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(conv: Conversation) {
    setOpenConv(conv);
    setMessages(null);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/admin/conversations/${encodeURIComponent(conv.id)}/messages`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load messages.');
      setMessages(data.messages || []);
    } catch (e: any) {
      showError(e?.message || 'Failed to load messages.');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleDeleteMessage() {
    if (!openConv || !deletingMessage) return;
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/conversations/${encodeURIComponent(openConv.id)}/messages/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: deletingMessage.id, reason: deleteReason.trim() }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete message.');
      showSuccess('Message removed.');
      setDeletingMessage(null);
      setDeleteReason('');
      // Refresh messages.
      openConversation(openConv);
    } catch (e: any) {
      showError(e?.message || 'Failed to delete message.');
    } finally {
      setIsDeleting(false);
    }
  }

  useEffect(() => {
    if (canView) loadConversations();
  }, [canView]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const partsText = c.participantDetails
        ? Object.values(c.participantDetails)
            .map((p) => `${p?.companyName || ''} ${p?.email || ''}`)
            .join(' ')
        : '';
      return (
        c.id.toLowerCase().includes(q) ||
        partsText.toLowerCase().includes(q) ||
        (c.loadDetails?.origin || '').toLowerCase().includes(q) ||
        (c.loadDetails?.destination || '').toLowerCase().includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q)
      );
    });
  }, [conversations, search]);

  if (!canView) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>No access</CardTitle>
          <CardDescription>Your admin role can&apos;t view conversations.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
            <MessageSquare className="h-7 w-7" />
            Conversations
          </h1>
          <p className="text-muted-foreground">
            All conversations across the platform — for dispute resolution and moderation.
          </p>
        </div>
        <Button variant="outline" onClick={loadConversations} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>{filtered.length} of {conversations.length}</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search participants, route, last message…"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No conversations match the current filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participants</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Last Message</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm">
                      <div className="font-medium">{summarizeParticipants(c)}</div>
                      {c.tlaId && <div className="text-xs text-muted-foreground">TLA: {c.tlaId}</div>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.loadDetails?.origin || '?'} → {c.loadDetails?.destination || '?'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                      {c.lastMessage || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(c.lastMessageAt)}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => openConversation(c)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Conversation detail dialog */}
      <Dialog open={!!openConv} onOpenChange={(open) => { if (!open) { setOpenConv(null); setMessages(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Conversation</DialogTitle>
            <DialogDescription>
              {openConv && summarizeParticipants(openConv)}
              {openConv?.loadDetails && (
                <> &middot; {openConv.loadDetails.origin} → {openConv.loadDetails.destination}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-4">
            {loadingMessages ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-3/4" />
                ))}
              </div>
            ) : !messages || messages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No messages.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const senderLabel =
                    m.senderName ||
                    (m.senderId && openConv?.participantDetails?.[m.senderId]?.companyName) ||
                    m.senderId ||
                    'Unknown';
                  return (
                    <div
                      key={m.id}
                      className={`rounded-lg border p-3 ${m.deletedAt ? 'bg-red-50/40 dark:bg-red-950/10 border-red-200 dark:border-red-900' : 'bg-muted/30'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">{senderLabel}</span>
                            <span>·</span>
                            <span>{formatTimestamp(m.createdAt)}</span>
                            {m.deletedAt && <Badge variant="destructive" className="ml-2">Deleted</Badge>}
                          </div>
                          <p className={`text-sm mt-1 whitespace-pre-wrap ${m.deletedAt ? 'italic text-muted-foreground' : ''}`}>
                            {m.text || ''}
                          </p>
                          {m.deletedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Deleted {formatTimestamp(m.deletedAt)}
                              {m.deletedReason && <> — {m.deletedReason}</>}
                              {m.originalText && (
                                <span className="block mt-1">Original: <span className="italic">{m.originalText}</span></span>
                              )}
                            </p>
                          )}
                        </div>
                        {canModerate && !m.deletedAt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive shrink-0"
                            onClick={() => { setDeletingMessage(m); setDeleteReason(''); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenConv(null); setMessages(null); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete message confirm */}
      <AlertDialog open={!!deletingMessage} onOpenChange={(open) => { if (!open) { setDeletingMessage(null); setDeleteReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this message?</AlertDialogTitle>
            <AlertDialogDescription>
              The original text is preserved on the record for audit. The displayed message is replaced
              with &ldquo;[Message removed by admin]&rdquo; for participants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletingMessage && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="whitespace-pre-wrap text-xs italic">{deletingMessage.text}</p>
            </div>
          )}
          <div className="py-2">
            <Label htmlFor="delete-reason">Reason (optional)</Label>
            <Textarea
              id="delete-reason"
              placeholder="Why is this message being removed?"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMessage}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Removing…</> : 'Remove Message'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
