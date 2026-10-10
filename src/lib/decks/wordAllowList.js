// Everyday words missing from public/wordhunt-dict.txt (word games audit,
// 2026-10-02). That list predates most Indian English and modern tech words,
// so Hangwoman refused BIRYANI as a setter word and Word Hunt rejected EMAIL.
// loadDictionary() merges ALLOW_WORDS into the dictionary every game shares
// (Word Hunt, Hangwoman setter checks and both CPUs). Every entry is
// lowercase, a-z only, 3+ letters and passes isFamilySafe; the test beside
// this file checks each one is accepted.
//
// This is a gap fix for the existing dictionary, not a themed deck: only
// words in ordinary Indian or British English use (most have Oxford entries),
// plus their common plurals.
export const ALLOW_WORDS = [
  // Indian English: food and drink
  'aloo', 'bhaji', 'bhajis', 'bhindi', 'biryani', 'biryanis', 'brinjal', 'brinjals', 'chaat',
  'chai', 'chais', 'chana', 'chole', 'daal', 'dahi', 'dosa', 'dosas', 'gobi', 'halwa', 'idli',
  'idlis', 'jalebi', 'jalebis', 'kheer', 'korma', 'kulfi', 'ladoo', 'ladoos', 'laddoo', 'laddoos',
  'lassi', 'lassis', 'masala', 'masalas', 'mithai', 'pakora', 'pakoras', 'palak', 'paneer', 'papad',
  'papads', 'paratha', 'parathas', 'poha', 'pulao', 'raita', 'rajma', 'rasam', 'tadka', 'thali',
  'thalis', 'tikka', 'upma', 'vada', 'vadas',
  // Indian English: clothing, home and everyday life
  'almirah', 'almirahs', 'chappal', 'chappals', 'chawl', 'chawls', 'dabba', 'dabbas', 'desi',
  'dhaba', 'dhabas', 'diya', 'diyas', 'dupatta', 'dupattas', 'jhola', 'jhumka', 'jhumkas', 'jugaad',
  'kabaddi', 'lehenga', 'lehengas', 'maidan', 'maidans', 'mehndi', 'mela', 'melas', 'prepone',
  'preponed', 'pyjama', 'rangoli', 'rangolis', 'salwar', 'sherwani', 'sherwanis',
  // British spelling
  'favourite', 'favourites', 'favourited',
  // Modern everyday words
  'app', 'apps', 'blog', 'blogger', 'bloggers', 'blogs', 'ebook', 'ebooks', 'email', 'emailed', 'emails',
  'emoji', 'emojis', 'hashtag', 'hashtags', 'inbox', 'inboxes', 'login', 'logins', 'logout',
  'meme', 'memes', 'online', 'podcast', 'podcasts', 'ramen', 'selfie', 'selfies', 'smartphone',
  'smartphones', 'spam', 'texted', 'texting', 'unfollow', 'unfriend', 'username', 'usernames',
  'vlog', 'vlogs', 'website', 'websites', 'wifi',
]

// Festivals and rivers players reach for as Hangwoman words. They are proper
// nouns, so Hangwoman accepts them as setter words but Word Hunt never serves
// or scores them (they stay out of the shared dictionary).
export const HANGWOMAN_ONLY_WORDS = [
  'diwali', 'dussehra', 'ganga', 'holi', 'lohri', 'navratri', 'onam', 'pongal', 'yamuna',
]
