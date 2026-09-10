export type Member = {
  id: string
  user_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  role: string
  invite_status: string
  invited_at: string | null
}
