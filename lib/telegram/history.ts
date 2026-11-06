// Pure helpers for the Telegram agent's conversation memory.

export const SUMMARY_PREFIX = '[SUMMARY]'

export interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
}

// Rows arrive newest-first (so LIMIT keeps the most recent turns). Claude
// needs them oldest-first, starting with a user turn, without summary rows.
export function toConversation(newestFirst: StoredMessage[]): StoredMessage[] {
  const chronological = newestFirst
    .filter((m) => !m.content.startsWith(SUMMARY_PREFIX))
    .slice()
    .reverse()

  const firstUser = chronological.findIndex((m) => m.role === 'user')
  return firstUser === -1 ? [] : chronological.slice(firstUser)
}

export function stripSummaryPrefix(content: string): string {
  return content.startsWith(SUMMARY_PREFIX) ? content.slice(SUMMARY_PREFIX.length).trim() : content
}
