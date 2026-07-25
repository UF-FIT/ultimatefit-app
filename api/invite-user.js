import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const appUrl = process.env.APP_URL || 'https://app.ultimatefit.pt'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!url || !serviceRole) return res.status(500).json({ error: 'Supabase env vars missing' })

  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Missing user token' })

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: authUser, error: userError } = await admin.auth.getUser(token)
  if (userError || !authUser?.user) return res.status(401).json({ error: 'Invalid token' })

  const { data: requester, error: requesterError } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', authUser.user.id)
    .single()

  if (requesterError || !['admin','professor'].includes(requester?.role)) {
    return res.status(403).json({ error: 'Not allowed' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const { email, role = 'aluno', full_name, phone, studentData = {} } = body || {}
  if (!email || !full_name) return res.status(400).json({ error: 'email and full_name are required' })
  if (role === 'professor' && requester.role !== 'admin') return res.status(403).json({ error: 'Only admin can invite trainers' })

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/ativar-conta`,
    data: { full_name, role }
  })
  if (inviteError) return res.status(400).json({ error: inviteError.message })

  const userId = invited.user?.id
  if (userId) {
    await admin.from('profiles').upsert({ id: userId, email, full_name, phone, role, status: 'ativo', created_by: requester.id })
    if (role === 'aluno') await admin.from('students').upsert({ profile_id: userId, full_name, email, phone, ...studentData, status: 'ativo' })
  }

  return res.status(200).json({ ok: true, user: invited.user })
}
