// Reaction emoji registry — single source for UI lists and sound coverage tests.

function unique(list) {
  return [...new Set(list)]
}

export const EMOTES_PRIMARY = ['🔥', '😂', '😭', '😎', '👏', '💀', '🤫']

const PRIMARY_FACES = ['😂', '😭', '😎', '🤫']

// Full Unicode smiley / face catalog (no skin tones). Order = picker grid order.
export const EMOTES_FACES = [
  // Happy / laugh
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇',
  '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲', '😋',
  // Silly
  '😛', '😜', '🤪', '😝', '🤑',
  // Social
  '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨',
  // Neutral
  '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬',
  // Breath / lie / shake
  '😮‍💨', '🤥', '🫨',
  // Calm / tired
  '😌', '😔', '😪', '🤤', '😴', '🥱',
  // Sick
  '😷', '🤒', '🤕', '🤢', '🤮', '🤧',
  // Hot / cold / woozy
  '🥵', '🥶', '🥴', '😵', '😵‍💫', '🤯',
  // Costume
  '🤠', '🥳', '🥸', '😎', '🤓', '🧐',
  // Worried / sad
  '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '🥹',
  '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱',
  // Struggle
  '😖', '😣', '😞', '😓', '😩', '😫', '😤',
  // Angry
  '😡', '😠', '🤬', '😈', '👿',
  // Fantasy / meme
  '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
  // Atmosphere
  '😶‍🌫️', '🫠',
]

export const EMOTES_GESTURES = [
  '🔥', '👏', '💀', '❤️', '🎉', '🤔', '😱', '👍', '🙏', '💪', '😤', '🎯', '⚡', '🍀',
]

export const EMOTES_PICKER_FACES = unique([...PRIMARY_FACES, ...EMOTES_FACES])
export const EMOTES_PICKER_GESTURES = unique(EMOTES_GESTURES)
export const EMOTES_PICKER_ALL = unique([...EMOTES_PICKER_FACES, ...EMOTES_PICKER_GESTURES])

// Searchable keywords per glyph, used by searchEmotes() below.
export const EMOTE_KEYWORDS = {
  '😀': 'grin happy smile grinning',
  '😃': 'happy smile grin open mouth',
  '😄': 'happy smile grin joy',
  '😁': 'grin beam happy smile',
  '😆': 'laugh happy squint grin',
  '😅': 'sweat nervous laugh relief awkward',
  '🤣': 'rofl rolling laugh hilarious lol',
  '😂': 'joy laugh cry lol tears',
  '🙂': 'smile slight content',
  '🙃': 'upside down silly sarcastic',
  '😉': 'wink flirt joke',
  '😊': 'blush smile happy shy',
  '😇': 'angel innocent halo good',
  '🥰': 'love adore hearts smitten',
  '😍': 'love heart eyes crush adore',
  '🤩': 'starstruck excited wow amazed',
  '😘': 'kiss love blow',
  '😗': 'kiss whistle pucker',
  '☺️': 'smile content relaxed',
  '😚': 'kiss closed eyes love',
  '😙': 'kiss smile whistle',
  '🥲': 'bittersweet smile tear happy sad',
  '😋': 'yum tasty delicious tongue',
  '😛': 'tongue silly playful',
  '😜': 'tongue wink silly crazy',
  '🤪': 'zany crazy wild goofy',
  '😝': 'tongue laugh squint silly',
  '🤑': 'money greedy rich dollar',
  '🤗': 'hug warm welcome embrace',
  '🤭': 'giggle oops shy hand',
  '🤫': 'shh quiet secret hush',
  '🤔': 'think hmm ponder wonder',
  '🫡': 'salute respect thanks',
  '🤐': 'zip mouth silent quiet',
  '🤨': 'suspicious skeptic raised eyebrow',
  '😐': 'neutral meh blank',
  '😑': 'expressionless meh blank flat',
  '😶': 'speechless silent blank quiet',
  '🫥': 'invisible dotted disappear fade',
  '😏': 'smirk sly smug',
  '😒': 'unamused annoyed meh side eye',
  '🙄': 'eyeroll annoyed whatever sarcasm',
  '😬': 'grimace awkward yikes cringe',
  '😮‍💨': 'exhale sigh relief breath',
  '🤥': 'liar lying nose pinocchio',
  '🫨': 'shake shocked stunned rattled',
  '😌': 'relieved calm content peaceful',
  '😔': 'sad pensive down disappointed',
  '😪': 'sleepy tired tear droopy',
  '🤤': 'drool want hungry crave',
  '😴': 'sleep zzz tired snore',
  '🥱': 'yawn tired bored sleepy',
  '😷': 'sick mask ill covid',
  '🤒': 'sick fever thermometer ill',
  '🤕': 'hurt injured bandage headache',
  '🤢': 'nausea sick gross ill',
  '🤮': 'vomit sick gross puke',
  '🤧': 'sneeze sick cold tissue',
  '🥵': 'hot sweat heat overheated',
  '🥶': 'cold freeze frozen chilly',
  '🥴': 'woozy dizzy drunk confused',
  '😵': 'dizzy dead knocked out confused',
  '😵‍💫': 'dizzy spiral confused disoriented',
  '🤯': 'mind blown shocked explode',
  '🤠': 'cowboy hat yeehaw western',
  '🥳': 'party celebrate birthday hat',
  '🥸': 'disguise glasses mustache incognito',
  '😎': 'cool sunglasses swag chill',
  '🤓': 'nerd glasses geek smart',
  '🧐': 'monocle curious inspect fancy',
  '😕': 'confused unsure worried',
  '😟': 'worried concerned anxious',
  '🙁': 'sad frown disappointed',
  '☹️': 'sad frown unhappy',
  '😮': 'surprised open mouth wow shocked',
  '😯': 'surprised hushed shocked',
  '😲': 'astonished shocked surprised gasp',
  '😳': 'flushed embarrassed shocked blush',
  '🥺': 'pleading beg puppy eyes',
  '🥹': 'holding back tears emotional touched',
  '😦': 'frowning shocked open mouth',
  '😧': 'anguished pain shocked',
  '😨': 'fearful scared afraid',
  '😰': 'anxious sweat worried nervous',
  '😥': 'sad disappointed relieved tear',
  '😢': 'cry sad tear sob',
  '😭': 'sob cry sad bawling tears',
  '😱': 'scream shocked scared fear',
  '😖': 'confounded frustrated struggle',
  '😣': 'persevere struggle strain',
  '😞': 'disappointed sad let down',
  '😓': 'sweat struggle sad exhausted',
  '😩': 'weary tired exhausted frustrated',
  '😫': 'tired exhausted fed up frustrated',
  '😤': 'triumph huff proud frustrated steam',
  '😡': 'angry mad rage furious',
  '😠': 'angry mad annoyed',
  '🤬': 'swear curse angry furious',
  '😈': 'devil smirk evil mischief',
  '👿': 'devil angry evil imp',
  '☠️': 'skull crossbones death danger',
  '💩': 'poop crap gross joke',
  '🤡': 'clown joke silly fool',
  '👹': 'ogre monster demon angry',
  '👺': 'goblin monster mask angry',
  '👻': 'ghost spooky boo halloween',
  '👽': 'alien ufo space extraterrestrial',
  '👾': 'monster alien game invader',
  '🤖': 'robot bot machine ai',
  '😶‍🌫️': 'foggy blank spacey lost',
  '🫠': 'melting embarrassed heat dissolve',
  '🔥': 'fire lit hot flame',
  '👏': 'clap applause bravo nice',
  '💀': 'skull dead death rip',
  '❤️': 'heart love red',
  '🎉': 'party celebrate confetti win',
  '👍': 'thumbs up good yes approve',
  '🙏': 'pray please thanks hope',
  '💪': 'flex strong muscle power',
  '🎯': 'target bullseye goal precise',
  '⚡': 'lightning bolt fast electric',
  '🍀': 'clover luck lucky irish',
}

// Filters glyphs by keyword prefix match against the search query.
export function searchEmotes(query, list = EMOTES_PICKER_ALL) {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter(g => {
    const kw = EMOTE_KEYWORDS[g]
    return kw ? kw.split(' ').some(w => w.startsWith(q)) : false
  })
}

// Quick-chat chips — one-tap intent phrases for 2P rooms (GG / NICE / etc).
// Fixed allowlist so the write is bounded and needs no moderation.
export const QUICK_CHAT = ['GG', 'NICE!', 'OOPS', 'YOUR MOVE', 'REMATCH?', 'BRB']

export function isQuickChat(text) {
  return QUICK_CHAT.includes(text)
}
