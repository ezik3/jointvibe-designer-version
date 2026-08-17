import { useState, useEffect } from 'react';
import "./admin-dialogs.css";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, X, Plus, Sparkles, Clock, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';

interface VibeTag {
  id: string;
  tag_name: string;
  category: string;
  status: string;
  usage_count: number;
  created_by_venue_id: string | null;
  created_at: string;
}

const CATEGORIES = ['Nightlife', 'Dining', 'Drinks', 'Entertainment', 'Food Type', 'Experience', 'Custom'];

export default function AdminVibeTags() {
  const { t } = useTranslation('admin');
  const [tags, setTags] = useState<VibeTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTagName, setNewTagName] = useState('');
  const [newTagCategory, setNewTagCategory] = useState('');

  const fetchTags = async () => {
    const { data } = await (supabase as any).from('vibe_tags').select('*').order('usage_count', { ascending: false });
    if (data) setTags(data);
    setLoading(false);
  };

  useEffect(() => { fetchTags(); }, []);

  const activeTags = tags.filter(t => t.status === 'active');
  const pendingTags = tags.filter(t => t.status === 'pending_review');

  const handleApprove = async (id: string) => {
    const { error } = await (supabase as any).from('vibe_tags').update({ status: 'active' }).eq('id', id);
    if (error) toast.error('Failed to approve');
    else { toast.success('Tag approved!'); fetchTags(); }
  };

  const handleReject = async (id: string) => {
    const { error } = await (supabase as any).from('vibe_tags').update({ status: 'rejected' }).eq('id', id);
    if (error) toast.error('Failed to reject');
    else { toast.success('Tag rejected'); fetchTags(); }
  };

  const handleCreate = async () => {
    if (!newTagName.trim() || !newTagCategory) return;
    const { error } = await (supabase as any).from('vibe_tags').insert({
      tag_name: newTagName.trim(),
      category: newTagCategory,
      status: 'active',
    });
    if (error) toast.error(error.message);
    else { toast.success('Tag created!'); setNewTagName(''); setNewTagCategory(''); fetchTags(); }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-primary" /> Vibe Tags
        </h1>
        <p className="text-muted-foreground mt-1">Manage vibe tags for users and venues</p>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="mb-6">
          <TabsTrigger value="active">Active ({activeTags.length})</TabsTrigger>
          <TabsTrigger value="pending">
            Pending Review ({pendingTags.length})
            {pendingTags.length > 0 && <span className="ml-1 w-2 h-2 bg-orange-500 rounded-full inline-block" />}
          </TabsTrigger>
          <TabsTrigger value="create">Create Tag</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {loading ? <p>{t("common:app.loading")}</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeTags.map(tag => (
                <Card key={tag.id} className="bg-card/50">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{tag.tag_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{tag.category}</Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> {tag.usage_count} uses
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending">
          {pendingTags.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No tags pending review</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {pendingTags.map(tag => (
                <Card key={tag.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{tag.tag_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{tag.category}</Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(tag.created_at).toLocaleDateString()}
                        </span>
                        {tag.created_by_venue_id && <span className="text-xs text-muted-foreground">Venue submitted</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-green-500 border-green-500/50" onClick={() => handleApprove(tag.id)}>
                        <Check className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-500 border-red-500/50" onClick={() => handleReject(tag.id)}>
                        <X className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader><CardTitle>Create New Tag</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Tag name" value={newTagName} onChange={e => setNewTagName(e.target.value)} />
              <Select value={newTagCategory} onValueChange={setNewTagCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent className="admin-select-popover">
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={handleCreate} disabled={!newTagName.trim() || !newTagCategory}>
                <Plus className="w-4 h-4 mr-2" /> Create Tag
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
