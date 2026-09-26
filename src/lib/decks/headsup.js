// HEADS UP prompts. Each turn the dealer seals a shuffled hand of prompt
// INDICES to every player except the guesser, and the room's seen history
// (`games/{id}/seen/headsup`) is keyed by index — so this list is
// APPEND-ONLY: never reorder or delete, and add new prompts as a NEW block at
// the end of HEADSUP_BLOCKS (a block may repeat a category).
//
// Family-friendly by design: every prompt is acted or described out loud on
// a video call, often with kids in the room. src/lib/decks/headsup.test.js
// runs every word through the shared moderation denylist.

export const HEADSUP_CATEGORIES = [
  { id: 'movies', label: 'MOVIES & TV' },
  { id: 'animals', label: 'ANIMALS' },
  { id: 'actions', label: 'ACTIONS' },
  { id: 'famous', label: 'FAMOUS THINGS' },
  { id: 'food', label: 'FOOD & DRINK' },
  { id: 'sports', label: 'SPORTS & HOBBIES' },
  { id: 'jobs', label: 'JOBS' },
  { id: 'things', label: 'EVERYDAY THINGS' },
]

const HEADSUP_BLOCKS = [
  ['movies', [
    'Frozen', 'Toy Story', 'Finding Nemo', 'The Lion King', 'Star Wars', 'Harry Potter',
    'Jurassic Park', 'Shrek', 'The Wizard of Oz', 'E.T.', 'Jaws', 'Titanic', 'Home Alone',
    'Back to the Future', 'Ghostbusters', 'The Incredibles', 'Up', 'Cars', 'Moana', 'Aladdin',
    'Cinderella', 'Beauty and the Beast', 'The Little Mermaid', 'Mary Poppins', 'Spider-Man',
    'Batman', 'The Avengers', 'Minions', 'Kung Fu Panda', 'Madagascar', 'Ice Age', 'Inside Out',
    'Coco', 'Encanto', 'Zootopia', 'Ratatouille', 'WALL-E', 'Monsters, Inc.', 'The Jungle Book',
    'Peter Pan', 'Paddington', 'Mr. Bean', 'Sesame Street', 'SpongeBob', 'Scooby-Doo',
    'The Simpsons', 'Pokémon', 'Mulan',
  ]],
  ['animals', [
    'Elephant', 'Giraffe', 'Kangaroo', 'Penguin', 'Monkey', 'Lion', 'Tiger', 'Snake', 'Crocodile',
    'Frog', 'Rabbit', 'Chicken', 'Duck', 'Horse', 'Cow', 'Pig', 'Sheep', 'Dog', 'Cat', 'Owl',
    'Eagle', 'Parrot', 'Flamingo', 'Shark', 'Dolphin', 'Whale', 'Octopus', 'Crab', 'Jellyfish',
    'Butterfly', 'Spider', 'Bee', 'Snail', 'Turtle', 'Gorilla', 'Bear', 'Panda', 'Koala', 'Sloth',
    'Zebra', 'Camel', 'Hippo', 'Peacock', 'Hedgehog', 'Ostrich', 'Wolf', 'Squirrel',
  ]],
  ['actions', [
    'Brushing your teeth', 'Swimming', 'Riding a bike', 'Juggling', 'Skipping rope', 'Sneezing',
    'Yawning', 'Tying shoelaces', 'Taking a selfie', 'Flying a kite', 'Baking a cake', 'Surfing',
    'Ice skating', 'Climbing a ladder', 'Walking a dog', 'Washing dishes', 'Painting a wall',
    'Playing the guitar', 'Playing the piano', 'Playing the drums', 'Rowing a boat',
    'Throwing a snowball', 'Building a snowman', 'Blowing bubbles', 'Making a sandwich',
    'Changing a light bulb', 'Ironing clothes', 'Hula hooping', 'Doing push-ups', 'Jumping jacks',
    'Mowing the lawn', 'Chopping wood', 'Hammering a nail', 'Texting', 'Waving goodbye',
    'Hiccuping', 'Sleepwalking', 'Brushing your hair', 'Milking a cow', 'Scuba diving',
    'Driving a car', 'Parachuting', 'Walking a tightrope', 'Riding a horse', 'Eating spaghetti',
    'Opening a present', 'Cracking an egg', 'Rocking a baby',
  ]],
  ['famous', [
    'Eiffel Tower', 'Statue of Liberty', 'Great Wall of China', 'The Pyramids', 'Big Ben',
    'Mona Lisa', 'Mount Everest', 'Niagara Falls', 'Stonehenge', 'Taj Mahal', 'The Colosseum',
    'Leaning Tower of Pisa', 'Grand Canyon', 'Golden Gate Bridge', 'Sydney Opera House',
    'Santa Claus', 'Tooth Fairy', 'Easter Bunny', 'Mickey Mouse', 'Sherlock Holmes', 'Robin Hood',
    'King Arthur', 'Cleopatra', 'Albert Einstein', 'William Shakespeare', 'Mozart',
    'Neil Armstrong', 'The Olympic Games', 'Rubik’s Cube', 'Loch Ness Monster', 'Bigfoot',
    'Unicorn', 'Dracula', 'Frankenstein', 'Mermaid', 'Leonardo da Vinci', 'Isaac Newton',
    'Marie Curie', 'The Wright Brothers', 'Mount Rushmore', 'Hollywood Sign', 'Machu Picchu',
    'Northern Lights', 'Buckingham Palace', 'The Sphinx', 'Humpty Dumpty', 'Cupid',
  ]],
  ['food', [
    'Pizza', 'Spaghetti', 'Hamburger', 'Hot dog', 'Ice cream', 'Popcorn', 'Pancakes', 'Sushi',
    'Tacos', 'Burrito', 'French fries', 'Chocolate', 'Birthday cake', 'Cupcake', 'Doughnut',
    'Banana', 'Watermelon', 'Pineapple', 'Lemon', 'Strawberry', 'Corn on the cob', 'Broccoli',
    'Carrot', 'Onion', 'Cheese', 'Scrambled eggs', 'Cereal', 'Toast', 'Soup', 'Noodles',
    'Dumplings', 'Milkshake', 'Lemonade', 'Hot chocolate', 'Orange juice', 'Bubble gum',
    'Cotton candy', 'Lollipop', 'Pretzel', 'Peanut butter', 'Coconut', 'Avocado', 'Marshmallow',
    'Cookie', 'Apple pie', 'Waffles', 'Popsicle',
  ]],
  ['sports', [
    'Soccer', 'Basketball', 'Tennis', 'Golf', 'Baseball', 'Cricket', 'Rugby', 'Volleyball',
    'Table tennis', 'Badminton', 'Boxing', 'Karate', 'Gymnastics', 'Yoga', 'Archery', 'Fencing',
    'Skateboarding', 'Snowboarding', 'Rock climbing', 'Horse racing', 'Marathon', 'High jump',
    'Pole vault', 'Weightlifting', 'Chess', 'Video games', 'Photography', 'Gardening', 'Camping',
    'Hiking', 'Bird watching', 'Magic tricks', 'Karaoke', 'Ballet', 'Cheerleading', 'Ice hockey',
    'Sailing', 'Kayaking', 'Darts', 'Frisbee', 'Hopscotch', 'Hide and seek', 'Jigsaw puzzle',
    'Origami', 'Sumo wrestling', 'Water skiing', 'Tug of war',
  ]],
  ['jobs', [
    'Doctor', 'Nurse', 'Teacher', 'Firefighter', 'Police officer', 'Chef', 'Pilot', 'Astronaut',
    'Farmer', 'Dentist', 'Hairdresser', 'Plumber', 'Electrician', 'Mechanic', 'Carpenter',
    'Artist', 'Photographer', 'Magician', 'Clown', 'Mail carrier', 'Lifeguard', 'Librarian',
    'Scientist', 'Detective', 'Judge', 'Waiter', 'Cashier', 'Baker', 'Taxi driver', 'Bus driver',
    'Zookeeper', 'Veterinarian', 'Referee', 'DJ', 'Singer', 'Actor', 'Architect', 'Gardener',
    'Tailor', 'Barber', 'Lumberjack', 'Ship captain', 'Tour guide', 'News reporter',
    'Weather forecaster', 'Window cleaner', 'Beekeeper',
  ]],
  ['things', [
    'Umbrella', 'Toothbrush', 'Alarm clock', 'Television', 'Remote control', 'Refrigerator',
    'Washing machine', 'Vacuum cleaner', 'Microwave', 'Toaster', 'Kettle', 'Bicycle', 'Scissors',
    'Stapler', 'Pencil', 'Backpack', 'Sunglasses', 'Headphones', 'Camera', 'Laptop', 'Smartphone',
    'Light bulb', 'Candle', 'Mirror', 'Pillow', 'Blanket', 'Bathtub', 'Hammer', 'Flashlight',
    'Keys', 'Wallet', 'Wristwatch', 'Socks', 'Balloon', 'Teddy bear', 'Newspaper', 'Doorbell',
    'Traffic light', 'Elevator', 'Escalator', 'Shopping cart', 'Trampoline', 'Swing',
    'Hair dryer', 'Paper airplane', 'Rubber duck', 'Snow globe',
  ]],
]

/** Flat prompt list: `{ text, cat }`, indexed by position (append-only). */
export const HEADSUP_PROMPTS = HEADSUP_BLOCKS.flatMap(([cat, texts]) => texts.map(text => ({ text, cat })))
