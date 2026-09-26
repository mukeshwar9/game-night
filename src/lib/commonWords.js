// Familiarity helper for word games — pure, no DOM/React/Firebase.
//
// Word Hunt and Anagrams accept every dictionary word (eta, tae, ern…), but
// when the game picks words to *show* on its own ("TOP MISSED", "WORDS YOU
// MISSED", rack roots) it should lead with words players actually know.
// Familiar = the curated 5-letter Wordle answer list (src/lib/dictionary.js)
// plus the hand-picked everyday 3–4 and 6–7 letter words below. Deliberately
// modest: it only ranks, it never rejects a word.
//
// Every list here is family-safe (enforced by commonWords.test.js); callers
// still filter displays with isFamilySafe because they rank dictionary words.

import { isAnswerWord } from './dictionary'
import { isFamilySafe } from './wordDenylist'

const COMMON_3 = `
ace act add age ago aid aim air all and ant any ape apt arc are ark arm art ash ask ate awe axe
bad bag ban bar bat bay bed bee beg bet bib bid big bin bit boa bog boo bow box boy bud bug bun
bus but buy bye cab can cap car cat cod cog cop cot cow coy cry cub cue cup cut dab dad dam day
den dew did die dig dim din dip doe dog dot dry dub due dug dye ear eat ebb egg ego elf elk elm
end era eve ewe eye fan far fat fax fed fee few fig fin fir fit fix flu fly foe fog for fox fry
fun fur gag gap gas gel gem get gig gin god got gum gun gut guy gym had ham has hat hay hen her
hid him hip his hit hog hop hot how hub hue hug hum hut ice icy ill imp ink inn ion its ivy jab
jam jar jaw jay jet jig job jog jot joy jug keg key kid kin kit lab lad lag lap law lay led leg
let lid lie lip lit log lot low mad man map mat may men met mid mix mob mom mop mud mug nag nap
net new nib nil nip nod nor not now nun nut oak oar oat odd off oil old one opt orb ore our out
owe owl own pad pal pan par pat paw pay pea peg pen pep per pet pie pig pin pit ply pod pop pot
pro pub pun pup put rag ram ran rap rat raw ray red rib rid rig rim rip rob rod rot row rub rug
rum run rut rye sad sag sap sat saw say sea see set sew she shy sin sip sir sit six ski sky sly
sob son sow soy spa spy sub sum sun tab tad tag tan tap tar tax tea ten the tie tin tip toe ton
too top tot tow toy try tub tug two urn use van vat vet via vow wad wag war was wax way web wed
wet who why wig win wit woe wok won woo wow yak yam yap yes yet yew you zap zen zip zoo
`

const COMMON_4 = `
able ache acid acne acre acts aged ages aide aids aims airs airy ajar akin ally aloe also alto
amid ammo ants apes apex arch area arms army arts atom aunt aura auto avid away awed axes axis axle
babe baby back bade bags bait bake bald ball balm band bang bank bans barb bard bare bark barn
bars base bash bask bath bats bead beak beam bean bear beat beds beef been beep beer bees beet
begs bell belt bend bent best bets bias bike bill bind bird bite bits blew blog blot blow blue
blur boar boat body boil bold bolt bomb bond bone book boom boot bore born boss both bout bowl
bows boxy boys brag bran brat brew brim buck buds bugs bulb bulk bull bump bunk buns burn burp
bury bush bust busy buys buzz byte
cabs cafe cage cake calf call calm came camp cane cans cape caps card care cart case cash cast
cats cave cell cent chat chef chew chin chip chop cite city clad clam clan clap claw clay clip
clog clot club clue coal coat code coil coin cold colt comb come cone cook cool cope cops copy
cord core cork corn cost cosy cozy cots cove cows crab crew crib crop crow cube cubs cuff cult
cups curb cure curl cute cuts
dads dame damp dams dare dark darn dart dash data date dawn days daze deaf deal dean dear debt
deck deed deem deep deer dent deny desk dial dice diet digs dime dine dips dire dirt disc dish
disk dive dock does dogs doll dome done doom door dose dots dove down doze drag draw drew drip
drop drum dual duck duel dues duet dull dumb dump dune dunk dusk dust duty
each earl earn ears ease east easy eats echo edge edgy edit eels eggs else emit ends envy epic
even ever evil exam exit eyed eyes
face fact fade fail fair fake fall fame fans fare farm fast fate fawn fear feat feed feel fees
feet fell felt fern feud figs file fill film find fine fins fire firm fish fist fits five flag
flap flat flaw flea fled flew flip flop flow flux foal foam foes fogs foil fold folk fond font
food fool foot fore fork form fort foul four fowl foxy fray free frog from fuel full fume fund
fuse fuss
gain gait gala gale game gang gaps gasp gate gave gaze gear geek gems gene gift gill girl gist
give glad glee glen glow glue glum gnat gnaw goal goat gods goes gold golf gone gong good goof
gown grab gram gray grew grey grid grim grin grip grit grow grub gulf gull gulp gums guns guru
gush gust guts guys gyms
hack hail hair half hall halo halt hams hand hang hard hare harm harp hash hate haul have hawk
haze hazy head heal heap hear heat heed heel held helm help hems herb herd here hero hers hide
high hike hill hilt hint hips hire hiss hits hive hoax hold hole holy home hood hoof hook hoop
hoot hope hops horn hose host hour howl hubs huge hugs hull hums hung hunt hurl hurt hush huts
hymn
iced icon idea idle idly idol inch info inks inns into ions iris iron isle itch item
jabs jack jade jail jams jars jaws jazz jeep jeer jerk jest jets jobs jogs join joke jolt jots
joys judo jump junk jury just
keen keep kegs kelp kept keys kick kids kilt kind king kiss kite kits kiwi knee knew knit knot
know
labs lace lack lacy lads lady laid lain lair lake lamb lamp land lane laps lard lark lash last
late lava lawn laws lays lazy lead leaf leak lean leap lend lens lent less lick lids lied lies
life lift like lily limb lime limp line link lint lion lips list live load loaf loan lobe lock
loft logo logs lone long look loom loop loot lord lore lose loss lost lots loud love luck lull
lump lung lure lurk lush
mace made maid mail main make male mall malt mane many maps mare mark mart mash mask mass mast
mate math mats maze meal mean meat meek meet meld melt memo mend menu meow mere mesh mess mice
mild mile milk mill mime mind mine mint miss mist mite mitt moan moat mock mode mold mole monk
mood moon moor mops more moss most moth move much mule muse mush musk must mute myth
nail name nape naps navy near neat neck need nerd nest nets news newt next nice nick nine node
nods none nook noon norm nose note noun nuts
oaks oars oath oats obey odds odor oils oily okay omen omit once ones only onto ooze open opts
oral orbs ouch ours oust outs oval oven over owed owes owls owns
pace pack pact pads page paid pail pain pair pale palm pals pane pans pant papa pare park part
pass past path pave pawn paws pays peak peal pear peas peat peck peek peel peep peer pegs pens
perk pest pets pick pier pies pigs pike pile pill pine ping pink pins pint pipe pits pity plan
play plea plod plot plow ploy plug plum plus pods poem poet poke pole poll pond pony pool poor
pops pore pork port pose posh post pots pour pout pray prep prey prim prod prom prop pros pubs
puck puff pull pulp pump punk puns pups pure purr push puts
quad quay quit quiz
race rack raft rage rags raid rail rain rake ramp rams rang rank rant rare rash rate rats rave
rays read real reap rear reed reef reel rely rent rest ribs rice rich ride rife rift rigs rind
ring rink riot ripe rise risk rite road roam roar robe robs rock rode rods role roll roof room
root rope rose rosy rots rove rows rubs ruby rude rugs ruin rule rump rung runs runt ruse rush
rust
sack safe saga sage said sail sake sale salt same sand sane sang sank saps sash save saws says
scan scar seal seam seas seat sect seed seek seem seen seep self sell send sent sets sewn shed
shin ship shoe shoo shop shot show shut sick side sigh sign silk sill silo sing sink sips sire
site sits size skid skim skin skip skis slab slam slap slat sled slew slid slim slip slit slob
slot slow slug slum snag snap snip snob snow snub snug soak soap soar sobs sock soda sofa soft
soil sold sole solo some song soon soot sore sort soul soup sour sown span spar spat sped spin
spit spot spry spud spun spur stab stag star stay stem step stew stir stop stub stud stun subs
such suds suit sulk sums sung sunk suns sure surf swam swan swap sway swim
tabs tack taco tact tags tail take tale talk tall tame tank tans tape taps tart task taxi teak
teal team tear teas tech teen tell tend tens tent term test text than that thaw them then they
thin this thud thug thus tick tide tidy tied tier ties tile till tilt time tint tiny tips tire
toad toes tofu toga told toll tomb tone tons took tool toot tops tore torn toss tote tour town
toys tram trap tray tree trek trim trio trip trot true tuba tube tubs tuck tuft tugs tuna tune
turf turn tusk twig twin type
ugly undo unit unto upon urge used user uses
vain vale vane vary vase vast vats veal veer veil vein vent verb very vest veto vets vial vibe
vice view vile vine visa void vole volt vote vows
wade wage wags wail wait wake walk wall wand want ward ware warm warn warp wars wart wary wash
wasp wave wavy ways weak wear webs week weep weld well went wept were west what when whim whip
whiz whom wick wide wife wigs wild will wilt wily wimp wind wine wing wink wins wipe wire wise
wish with wits woke wolf womb wont wood wool word wore work worm worn wove wrap wren
yaks yams yank yard yarn yawn yeah year yell yelp yoga yogi yolk your
zany zeal zero zest zinc zone zoom zoos
`

const COMMON_6 = `
absent absorb accept access accord across acting action active actors actual adding adjust
admire admits adults advice advise affair affect afford afraid agency agenda agents agreed agrees
aiming alarms albums alerts aliens allied allies allows almost always amount amused anchor angels
angles animal ankles annual answer anyone anyway appeal appear apples arcade arches arctic argued
argues arises armies around arrest arrive arrows artist ashore asking asleep aspect assess assets
assign assist assume assure attach attack attend august author autumn avenue awaken awards
babies backed badger badges baking ballet ballot banana bandit banker banner barely barley barrel
basket bathed battle beacon beauty became become before begged begins behalf behave behind beings
belief belong beside better beware beyond bigger bikers billed binder bishop biting bitten blamed
blanks blazer blends bleach blinds blocks blonde blouse boards boasts bodies boiled boiler bolder
bonnet border boring borrow bosses bother bottle bottom bought bounce bounds bounty brains brakes
branch brands breach breads breaks breath breeze bricks bridge briefs bright brings broken broker
bronze brooms browse bubble bucket buckle budget buffet builds bullet bumped bundle burden bureau
burger buried burned bursts bushes butler button buyers buying
cabins cables cactus called calmer camera camped campus canals cancel candle canned cannon canvas
canyon carbon career carpet carrot carton casino castle casual cattle caught causes celery cellar
cement census center centre cereal chains chairs chance change chapel charge charms chased cheers
cheese cherry chests chicks chiefs chilly chosen chunks church cinema circle circus cities claims
clause clever clicks client cliffs climax climbs clinic clocks closed closer closet clouds clowns
clumsy clutch coasts coffee collar colony colors colour column combat comedy comets coming commit
common comply cookie cooled copied copper corner cotton county couple course courts cousin covers
coyote cradle crafts crater crayon create credit crisis critic crowds crowns cruise crunch crusts
cuddle cursor curves custom cycles
damage dancer danger daring dashed dazzle dealer debate decade decent decide deeply defeat defend
define degree delete delays demand denial dental depart depend deputy desert design desire detail
detect device devote diaper dinner direct divide diving doctor dollar domain donate donkey dotted
double doubts dozens dragon drains drawer dreams drinks driven driver drives drying during
easier easily eating edible editor effect effort eighth eighty either elbows eldest eleven emails
embark emerge empire employ enable ending endure energy engage engine enjoys enough ensure enters
entire equals errand errors escape estate events evenly evolve exceed except excess excite excuse
exists exotic expand expect expert expire export expose extend extent
fabric facial facing factor fading failed fairly fallen family famous farmer faster father faucet
favour fellow fences fields fierce figure filled filter finale finals finger finish firmly fitted
flakes flames flight floats floors flower fluffy fluids flying folded follow forbid forced forest
forget forgot formal format former fossil foster fought fourth frames freely freeze fridge friend
fright frozen fruits fumble funded fungus funnel future
gadget galaxy gallon gamble gaming garage garden garlic gather gazing gentle gently giants gifted
ginger giving glance glider global gloves glossy golden gossip graded grades grains grants grapes
grassy gravel greasy greedy ground groups growth guards guests guided guides guilty guitar
habits halted hammer handed handle hanger happen harbor harder hardly hassle having hazard headed
header healed health hearts heated heater heaven hedges height helmet helped helper herbal heroes
hidden hiking hinges hiring hockey holder hollow honest hooked hoping horror horses hotels hourly
housed houses hugely humans humble humour hunger hungry hunter hurdle hurray
ideals ignore images impact import impose income indeed indoor infant inform injury inland insect
insert inside insist intact intend intent invent invest invite island itself
jacket jaguar jersey jigsaw jockey joined joking judged judges juices jumped jumper jungle junior
kennel kettle kicked kidney kindly kisses kitten knight knives knocks
labels ladder landed lately latest latter laughs launch lawyer layers laying leader league leaned
learns leaves ledger legacy legend lemons lender length lesson letter levels lifted lights likely
liking limits linked liquid listen litter little lively living lizard loaded loaves locals locate
locked locker lonely longer looked loosen lounge lovely lovers loving lowest lumber
magnet mainly makers making mammal manage manner manual marble margin marine marked market mashed
masked master matter mature meadow medals medium melody melted member memory mental merely method
middle mighty miller minded minute mirror missed misses mister mitten mixing mobile modest modern
moment monkey months morals mostly mother motion motive motors mouths moving museum muscle mutter
mutual myself
namely napkin narrow nation native nature nearby nearly neatly needle nephew nerves nested nicely
nickel nights nobody noodle normal notice notion novels number nurses nutmeg
object obtain occupy offers office oldest onions online opened openly oppose option orange orbits
orchid orders origin others outfit outlet output owners oyster
packed packet paddle padded palace panels parade parcel pardon parent parish parked parrot partly
passed passes pastel pastry patrol patron paused paving paying peanut pebble pedals peeled pencil
people pepper period permit person petals phases phones photos picked picnic pieces pigeon pillar
pillow pilots pirate planet plants plates played player please pledge plenty pocket poetry points
police policy polish polite poorly popped portal posted poster potato pounds poured powder powers
praise prayer prefer pretty priced prices priest prince prints prison prizes profit prompt proper
proved proven public puddle pulled pumped pupils puppet purple pursue pushed puzzle
rabbit racing racket radish radius raffle raised raisin random ranger ranked rarely rather rating
reader really reason recall recent recipe record reduce reform refuse regard region regret reject
relate relief remain remedy remind remote remove render rental repair repeat replay report rescue
resort result retail retain retire return reveal review reward rhythm ribbon riders riding rights
ripple rivals rivers robots rocket rolled roller rookie rooted rotten rubber rubble rulers ruling
runway rustic
sacred saddle safely safety sailed sailor salads salmon salute sample sandal sauces saucer saving
saying scales scared scenes scenic scheme school scoops scored scores scouts scrape scream screen
script scroll sealed search season seated second secret sector secure seeing seemed seldom select
seller senior sensor series served server settle severe shades shadow shaken shaped shapes shares
shaved shield shifts shirts shocks shoots shorts should shovel showed shower shrimp shrink sighed
sights signal signed silent silver simple simply singer single sister sitter skater sketch skiing
skills slices slider slight slopes slowly smells smiled smiles smooth snacks snakes sneaky sneeze
soccer social socket softer softly solved sorted sought sounds source speaks speech speeds sphere
spider spices spirit splash spoken sponge spoons sports spouse sprays spread spring sprint square
squash squeak stable stacks stairs stamps stands staple starch stared starry states statue stayed
steady steals steams stereo sticks sticky stitch stocks stolen stones stored stores storms strain
straps straws stream street stress strict strike string strips strive stroke strong struck studio
stuffy stumps sturdy styles submit subtle suburb sudden suffer summer summit sunset superb supply
surely surfer survey sweets switch symbol syntax system
tablet tackle tailor taking talent talked tangle tanker target tasted tastes taught teacup teapot
temple tenant tender tennis tested thanks theirs themes theory thesis thinks thirst thirty thorns
though thread threat thrill throat throne thrown thumbs ticket tickle tigers tights timber timely
timing tinted tissue titles toasts toilet tokens tomato tongue toward towels towers tracks trader
trades tragic trains travel treats treaty trends trials tribes tricks trophy trucks trunks trusts
truths trying tucked tumble tunnel turkey turned turtle tuxedo twelve twenty
unable uneven unfair unfold unique unites unless unlike unlock unpack untidy unused unveil update
uphill upside upward urgent usable useful
vacant valley valued values vanish varied velvet vendor verbal verify versus vessel viewed viewer
violet violin virtue vision visits visual voices volume voters voting voyage
waited waiter waking walked walker wallet walnut walrus wander wanted warden warmer warmly warned
washer wasted waters waving wealth wearer weekly weight wheels whilst widely wildly window winner
winter wiping wisdom wisely wished within wizard wobble wolves wonder wooden worked worker worthy
wrists writer writes
yachts yearly yellow yields yogurt
zebras zigzag zipped zipper zombie
`

const COMMON_7 = `
ability absence account achieve acquire actress address advance advised airline airport already
amazing ancient animals another answers anxiety anxious anybody anymore apology appears applied
arrange arrival arrived article artists attempt attract auction average awkward
backing baggage balance banking banners bargain barrels baskets battery beaches bearing beating
because becomes bedroom beliefs believe belongs beneath benefit berries between bicycle billion
biology biscuit blanket blessed blowing boiling bonfire booking borders bottles bouquet bracket
bravery breathe brewing bridges briefly brother brought browser brushes buckets builder burgers
burning buttons
cabbage cabinet calcium calling camping candies candles capable capital captain caption capture
careers careful carpets carried carrier carrots cartoon castles casting catalog catches ceiling
central century ceramic certain chamber changed changes channel chapter charged charges charity
chasing cheaper checked cheered cheetah chemist chicken chimney choices chopped circles circuit
citizen claimed classic cleaned cleaner clearer clearly climate climbed closely closest closing
clothes cluster coaches coastal collect college colored combine comfort command comment company
compare compass compete complex concern concert conduct confirm connect consent consist contact
contain content contest context control convert cookies cooking cooling copying correct costume
cottage counter country couples courage courses cousins covered cracked crafted crashed crawled
created creates creator credits cricket crimson crowded crucial cruiser crystal culture cupcake
curious current curtain cushion custard customs cutting cycling
damaged dancers dancing dealing dearest debates decided decimal declare decline deepest default
defense defined degrees delight deliver demands density dentist depends deposit desires dessert
destiny details develop devices diamond diaries dinners directs discuss display distant diverse
divided doctors dolphin donated doubled dragged drained drawers drawing dreamed dresses drilled
driving dropped drought drummer durable dusting
eagerly earlier earning earring easiest eastern economy edition educate effects efforts elastic
elderly elected element elevate embrace emerald emotion empathy emperor enables endless engaged
engines enhance enjoyed entered entries episode equally erosion errands escaped essence evening
evident exactly examine example excited exclaim excuses exhibit expands expects expense experts
explain explore exposed express extinct extreme
factory faculty failing failure falling fantasy farmers farming fashion fastest fathers feather
feature federal feeling fellows fencing festive fiction fifteen fighter figures filling filters
finally finance finding fingers firemen fishing fitness fitting fixture flatter flavors flights
floated flowers flowing focused folders folding follows foreign forever forests forgive formula
fortune forward fossils founder fragile freedom freight friends frosted funding funnier furious
further furnace
gadgets gallery gardens garment garnish gateway general generic genuine gesture getting giraffe
glasses glimpse glitter glowing gorilla grabbed grammar grandma granted graphic grasped gravity
grazing greater greatly greeted grilled grinned grocery grounds growing guarded guessed guiding
gymnast
habitat haircut halfway hallway handful handled handles hanging happens happier happily harbour
hardest harmony harvest hastily hatched heading healing healthy hearing heating heavier heights
helpful helping heroine herself highway himself history hitting hobbies holders holiday honesty
hopeful hopping horizon housing however hundred hunters hunting hurried husband
iceberg illness imagine imitate impress improve include indexes indoors infants inflate initial
injured inquiry insects insider inspect install instant instead integer intense invalid invites
involve islands isolate itching
jackets janitor jewelry journal journey juggler jumping juniors justice
keeping kennels kidneys kindred kingdom kitchen kittens knights knitted knocked knowing
labeled landing largest lasting lattice laughed laundry leaders leading learned learner leather
leaving lecture legends leisure lengths letters lettuce library license lighter limited linking
lioness listing literal loading lobster locally located lockers lodging logical longest looking
loosely lottery loyalty luggage lullaby
machine magical mailbox majesty mammals manager mansion marbles marched margins markers married
massive masters matched matches meaning measure medical meeting members mention mermaid message
methods mileage million mindful minimal minimum mirrors mission mistake mixture monitor monster
monthly morning mothers mounted muffins musical mustard mystery
napkins narrate natural nearest neither nervous network neutral newborn nightly nodding notable
noticed nourish novelty numbers nursery nurture
oatmeal observe obvious octopus offered officer offline onboard ongoing opening operate opinion
opposed optical options orchard ordered organic origins ostrich outdoor outline outlook outpost
outside outward overall overlap
package packing painful painted painter pajamas palaces pancake panther parades parents parking
partial partner parties passage passing passion passive pastime patient pattern payment peacock
peanuts pelican penalty pending pension percent perfect perform perhaps permits persist persons
phantom phrases physics pianist picking picture pillars pillows pinball pioneer pirates placing
planets planned planner plaster plastic plateau players playful playing pleased plotted plumber
pockets podcast pointed pointer popcorn popular portion posters postman pottery poultry pouring
powered praised prairie praying precise predict prefers premier prepaid prepare present pressed
pretend prevent preview pricing priests primary printer privacy private problem proceed process
produce product profile program project promise promote protect protein protest proudly provide
publish pudding pulling pumpkin punched puppies purpose pursuit puzzled puzzles pyramid
quality quarter queries quickly quieter quietly quilted quizzes quoting
raccoon racquet radiant railway rainbow raising rangers ranking rapidly readers readily reading
reality realize reasons rebuild receipt receive reclaim records recover recruit reduced reflect
refresh refusal refused regular related relaxed release relieve remains remarks reminds removal
removed renewal rentals repairs repeats replace replied reports request require rescued reserve
resolve respect respond restart restore results retired retreat returns reunion reveals reverse
reviews revival rewards rewrite rhythms richest riddles ringing ripples rituals roaming roasted
rockets roofing rookies rooster rotated roughly rounded routine rubbish runners running rushing
sadness sailing sailors samples sandals sandbox satisfy sausage savings scanner scarves scatter
scenery scholar science scooter scoring scraped scratch screams screens seafood seasons seating
seconds secrets section sectors secured seeking segment selfish sellers seminar senator sending
seniors sensing serious servant serving session setback setting settled seventh seventy several
shadows shallow shampoo shaping sharing sharper shelter sheriff shifted shining shipped shocked
shooter shopper shorten shorter shortly shouted showers showing shuffle shutter shyness sibling
sighing signals signing silence silicon similar sincere singers singing sisters sitting sixteen
skilled skillet sleeper sleeves slender slicing sliders slipped slogans slowest smaller smarter
smashed smiling snapped sneaker snowing soaring society soldier someone sorting sounded sparkle
speaker special species spelled spinach spotted sprayed sprints squeeze stadium staffed stained
stamina standby stapler starter startle stating station statues staying steamed stealth steeple
stellar stepped sticker stiffen stomach stopped storage stories stormed strains strange stretch
strikes strings striped strokes student studied studies stuffed stumble stylish subject succeed
success suggest summary sunbeam sunrise support suppose supreme surface surgeon surplus survive
suspect sustain swallow sweater sweeter swiftly swimmer swollen systems
tablets tadpole tailors talents talking tallest tangled tapping targets tasting teacher tearing
teasing telling temples tenants tension testing textile texture theater theatre therapy thereby
thermal thicker thinker thirsty thought thrifty through thunder tickets tighten tightly tissues
toaster toddler tonight toolbox torches tornado totally touched tourism tourist towards tractor
trading traffic tragedy trailer trained trainer transit trapped travels treated trellis tribute
trimmed triumph trivial trolley trouble trumpet trusted tuition tumbler turkeys turning turtles
twelfth twinkle twisted typical
unaware uncover undergo undoing unequal unfolds uniform unicorn unknown unlocks unusual upgrade
upright upscale upwards urgency useless utensil utility
vacancy vaccine vampire vanilla variety various varnish vehicle venture verdict version vessels
veteran victory village villain vintage virtual visible visited visitor vitamin volcano voltage
volumes voucher voyager
waiters waiting walking wallets walnuts wanting warmest warming warning warrior washing wasting
watched watcher watered wealthy wearing weather website wedding weekday weekend weighed weights
welcome welfare western whether whisper whistle whoever widened willing winning without witness
wizards wonders wording workers working workout worried wrapper wrestle writers writing written
wrongly
younger
`

/** Curated everyday words (3–4 and 6–7 letters), lowercase, family-safe. */
export const COMMON_WORDS = [COMMON_3, COMMON_4, COMMON_6, COMMON_7]
  .join(' ')
  .split(/\s+/)
  .filter(Boolean)

const COMMON_SET = new Set(COMMON_WORDS)

function clean(word) {
  return String(word ?? '').trim().toLowerCase()
}

/** True for everyday words: the curated list or a Wordle answer (5 letters). */
export function isCommonWord(word) {
  const w = clean(word)
  if (!w) return false
  return COMMON_SET.has(w) || (w.length === 5 && isAnswerWord(w))
}

/**
 * Orders words most-familiar first: common words before the rest, then by
 * `score(word)` (points, default length) high to low, then longer, then A–Z.
 * Returns a new array; never filters.
 */
export function rankByFamiliarity(words, { score = w => w.length } = {}) {
  return [...(words || [])]
    .map(w => clean(w))
    .filter(Boolean)
    .map(w => ({ w, common: isCommonWord(w) ? 1 : 0, points: score(w) }))
    .sort((a, b) => b.common - a.common || b.points - a.points || b.w.length - a.w.length || a.w.localeCompare(b.w))
    .map(entry => entry.w)
}

/**
 * The words a game may show on its own ("top missed"): family-safe only,
 * deduped, ranked by familiarity, at most `limit`.
 */
export function topFamiliar(words, { limit = 10, score } = {}) {
  const unique = [...new Set((words || []).map(clean).filter(Boolean))].filter(isFamilySafe)
  return rankByFamiliarity(unique, { score }).slice(0, limit)
}
