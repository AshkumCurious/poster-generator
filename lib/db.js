import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }
  if (!global.__farewellSupabase) {
    global.__farewellSupabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return global.__farewellSupabase;
}

function raise(error) {
  if (error) throw new Error(error.message);
}

export async function listEvents() {
  const { data, error } = await getClient()
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });
  raise(error);
  return data || [];
}

export async function getEvent(id) {
  const { data, error } = await getClient()
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  raise(error);
  return data || null;
}

export async function createEvent({ id, personName, title, message, folderId, ownerEmail }) {
  const { error } = await getClient().from('events').insert({
    id,
    person_name: personName,
    title,
    message,
    template_id: 'freeform',
    folder_id: folderId,
    status: 'open',
    owner_email: ownerEmail,
  });
  raise(error);
}

export async function closeEvent(id) {
  const { error } = await getClient().from('events').update({ status: 'closed' }).eq('id', id);
  raise(error);
}

export async function deleteEvent(id) {
  const { error } = await getClient().from('events').delete().eq('id', id);
  raise(error);
}

export async function listContributors(eventId) {
  const { data, error } = await getClient()
    .from('contributors')
    .select('email, invited_at, uploaded_at')
    .eq('event_id', eventId)
    .order('email', { ascending: true });
  raise(error);
  return data || [];
}

export async function insertContributors(eventId, emails) {
  const rows = emails
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean)
    .map((email) => ({
      id: nanoid(10),
      event_id: eventId,
      email,
    }));
  if (!rows.length) return;
  const { error } = await getClient()
    .from('contributors')
    .upsert(rows, { onConflict: 'event_id,email', ignoreDuplicates: true });
  raise(error);
}

export async function markContributorsInvited(eventId, emails) {
  const list = emails.filter(Boolean);
  if (!list.length) return;
  const { error } = await getClient()
    .from('contributors')
    .update({ invited_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .in('email', list);
  raise(error);
}

export async function markContributorUploaded(eventId, email) {
  const { error } = await getClient()
    .from('contributors')
    .update({ uploaded_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('email', email);
  raise(error);
}

export async function getLayout(eventId) {
  const { data, error } = await getClient()
    .from('poster_state')
    .select('layout_json')
    .eq('event_id', eventId)
    .maybeSingle();
  raise(error);
  if (!data?.layout_json) return null;
  return typeof data.layout_json === 'string' ? JSON.parse(data.layout_json) : data.layout_json;
}

export async function upsertLayout(eventId, layout) {
  const { error } = await getClient().from('poster_state').upsert({
    event_id: eventId,
    layout_json: layout,
    updated_at: new Date().toISOString(),
  });
  raise(error);
}

export async function getGoogleAccount(email) {
  const { data, error } = await getClient()
    .from('google_accounts')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  raise(error);
  return data || null;
}

export async function upsertGoogleAccountRow({
  email,
  refreshToken,
  accessToken,
  expiryDate,
  driveRootFolderId,
}) {
  const { error } = await getClient().from('google_accounts').upsert({
    email,
    refresh_token: refreshToken,
    access_token: accessToken || null,
    expiry_date: expiryDate || null,
    drive_root_folder_id: driveRootFolderId || null,
    updated_at: new Date().toISOString(),
  });
  raise(error);
}

export async function updateGoogleAccountTokens(email, { refreshToken, accessToken, expiryDate }) {
  const patch = { updated_at: new Date().toISOString() };
  if (refreshToken) patch.refresh_token = refreshToken;
  if (accessToken) patch.access_token = accessToken;
  if (expiryDate) patch.expiry_date = expiryDate;
  const { error } = await getClient().from('google_accounts').update(patch).eq('email', email);
  raise(error);
}

export async function updateDriveRoot(email, folderId) {
  const { error } = await getClient()
    .from('google_accounts')
    .update({
      drive_root_folder_id: folderId,
      updated_at: new Date().toISOString(),
    })
    .eq('email', email);
  raise(error);
}
