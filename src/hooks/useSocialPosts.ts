import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { SocialPostRecord } from '@/types/marketingOps';

type DbRow = {
  id: string;
  website_profile_id: string;
  platform: string;
  platforms: string[] | null;
  topic: string | null;
  post_type: string;
  content: string;
  media_urls: string[] | null;
  scheduled_date: string | null;
  published_date: string | null;
  publish_time: string | null;
  status: string;
  engagement_data: SocialPostRecord['engagementData'] | null;
  author_id: string | null;
  hours_spent: number | string | null;
  post_url: string | null;
  tags: string[] | null;
};

function dateOnly(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return String(value).substring(0, 10);
}

function mapRow(row: DbRow): SocialPostRecord {
  return {
    id: row.id,
    websiteProfileId: row.website_profile_id,
    platform: row.platform as SocialPostRecord['platform'],
    platforms: row.platforms ?? undefined,
    topic: row.topic ?? undefined,
    postType: (row.post_type as SocialPostRecord['postType']) || 'image',
    content: row.content ?? '',
    mediaUrls: row.media_urls ?? undefined,
    scheduledDate: dateOnly(row.scheduled_date),
    publishedDate: dateOnly(row.published_date),
    publishTime: row.publish_time ?? undefined,
    status: (row.status as SocialPostRecord['status']) || 'draft',
    engagementData: row.engagement_data ?? undefined,
    authorId: row.author_id ?? undefined,
    hoursSpent: row.hours_spent != null ? Number(row.hours_spent) : undefined,
    postUrl: row.post_url ?? undefined,
    tags: row.tags ?? undefined,
  };
}

function toInsertRow(post: SocialPostRecord) {
  return {
    id: post.id,
    website_profile_id: post.websiteProfileId,
    platform: post.platform,
    platforms: post.platforms ?? null,
    topic: post.topic ?? null,
    post_type: post.postType,
    content: post.content,
    media_urls: post.mediaUrls ?? null,
    scheduled_date: post.scheduledDate ?? null,
    published_date: post.publishedDate ?? null,
    publish_time: post.publishTime ?? null,
    status: post.status,
    engagement_data: post.engagementData ?? null,
    author_id: post.authorId ?? null,
    hours_spent: post.hoursSpent ?? null,
    post_url: post.postUrl ?? null,
    tags: post.tags ?? null,
  };
}

export function useSocialPosts() {
  const { session } = useAuth();
  const [posts, setPosts] = useState<SocialPostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('social_posts')
      .select('*')
      .order('published_date', { ascending: false, nullsFirst: false });
    if (err) {
      setError(err.message);
      setPosts([]);
    } else {
      setError(null);
      setPosts((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addPost = useCallback(async (data: Omit<SocialPostRecord, 'id'> & { id?: string }) => {
    const id = data.id || `sp_${Date.now()}`;
    const post: SocialPostRecord = { ...data, id };
    const { error: err } = await supabase.from('social_posts').insert(toInsertRow(post));
    if (!err) setPosts(prev => [post, ...prev]);
    return { data: err ? null : post, error: err };
  }, []);

  const updatePost = useCallback(async (id: string, data: Partial<SocialPostRecord>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.websiteProfileId !== undefined) patch.website_profile_id = data.websiteProfileId;
    if (data.platform !== undefined) patch.platform = data.platform;
    if (data.platforms !== undefined) patch.platforms = data.platforms;
    if (data.topic !== undefined) patch.topic = data.topic;
    if (data.postType !== undefined) patch.post_type = data.postType;
    if (data.content !== undefined) patch.content = data.content;
    if (data.mediaUrls !== undefined) patch.media_urls = data.mediaUrls;
    if (data.scheduledDate !== undefined) patch.scheduled_date = data.scheduledDate || null;
    if (data.publishedDate !== undefined) patch.published_date = data.publishedDate || null;
    if (data.publishTime !== undefined) patch.publish_time = data.publishTime;
    if (data.status !== undefined) patch.status = data.status;
    if (data.engagementData !== undefined) patch.engagement_data = data.engagementData;
    if (data.authorId !== undefined) patch.author_id = data.authorId;
    if (data.hoursSpent !== undefined) patch.hours_spent = data.hoursSpent;
    if (data.postUrl !== undefined) patch.post_url = data.postUrl;
    if (data.tags !== undefined) patch.tags = data.tags;
    const { error: err } = await supabase.from('social_posts').update(patch).eq('id', id);
    if (!err) {
      setPosts(prev => prev.map(p => (p.id === id ? { ...p, ...data } : p)));
    }
    return err;
  }, []);

  const deletePost = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('social_posts').delete().eq('id', id);
    if (!err) setPosts(prev => prev.filter(p => p.id !== id));
    return err;
  }, []);

  return { posts, loading, error, refresh, addPost, updatePost, deletePost };
}
