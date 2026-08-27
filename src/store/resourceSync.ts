// V2-I — NEW FILE src/store/resourceSync.ts
// Supabase CRUD for roadmap_task_resources. Kept out of sync.ts so that
// file stays untouched (same pattern as fetch/insert/delete there).
import { supabase } from '../lib/supabase.ts'
import type { ResourceInsert, ResourceRow } from '../types.ts'

const COLS = 'id, task_id, label, url, kind, position, created_at'

export async function fetchResources(): Promise<ResourceRow[]> {
  const { data, error } = await supabase
    .from('roadmap_task_resources')
    .select(COLS)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as ResourceRow[]
}

export async function insertResource(input: ResourceInsert): Promise<ResourceRow> {
  const { data, error } = await supabase
    .from('roadmap_task_resources')
    .insert(input)
    .select(COLS)
    .single()
  if (error) throw error
  return data as ResourceRow
}

export async function deleteResource(id: string): Promise<void> {
  const { error } = await supabase.from('roadmap_task_resources').delete().eq('id', id)
  if (error) throw error
}
