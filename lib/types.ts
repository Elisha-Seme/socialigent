export type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'published' | 'failed'

export interface PostingSlot {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  time: string // "HH:MM" UTC
}

export interface Client {
  id: string
  name: string
  brand_voice: string
  content_pillars: string[]
  linkedin_page_id: string | null
  linkedin_person_id: string | null
  linkedin_access_token: string | null
  linkedin_token_expires_at: string | null
  telegram_chat_id: string | null
  telegram_connect_token: string | null
  posting_schedule: PostingSlot[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Post {
  id: string
  client_id: string
  caption: string
  image_prompt: string | null
  image_url: string | null
  platform: 'linkedin'
  status: PostStatus
  scheduled_at: string | null
  published_at: string | null
  linkedin_post_id: string | null
  rejection_reason: string | null
  error_message: string | null
  caption_variations: string[] | null
  retry_count: number
  created_at: string
  updated_at: string
}

export interface PostHistory {
  id: string
  post_id: string
  previous_status: PostStatus
  new_status: PostStatus
  changed_by: string
  note: string | null
  created_at: string
}
