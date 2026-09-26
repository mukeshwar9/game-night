// SPYFAIR locations. Every non-spy player secretly shares the same location;
// the lone spy sees only "SPY" and must blend in by asking/answering questions
// without revealing they don't know where everyone is.
//
// Each entry: { name, roles } — roles are flavor jobs handed to non-spies so
// each player has a distinct angle to question from (purely cosmetic; the
// shared secret is the location name). Role names are gender-neutral job
// titles ("Server", not "Cocktail Waitress"); spyfair.test.js checks it.
//
// Every player (spy included) can open the full location list during a round —
// the spy's one location guess is picked from it.
//
// Rounds store a location INDEX (sealed during the round, revealed after), so
// new locations are appended and existing ones are never reordered or removed.
// Names must not appear in src/lib/decks/spyfairChat.js templates (tested there).
//
// SECRECY (see SpyfairGame.jsx): this whole list ships in the client bundle,
// so a location can't be hidden by hashing its name. The live room SEALS each
// player's card to that player's key instead (src/lib/sealed.js) — the
// location index and the spy only become public at the tally.

export const SPYFAIR_LOCATIONS = [
  { name: 'AIRPLANE', roles: ['Pilot', 'Flight Attendant', 'First Class Passenger', 'Air Marshal', 'Mechanic', 'Co-Pilot', 'Stowaway'] },
  { name: 'BANK', roles: ['Teller', 'Manager', 'Security Guard', 'Robber', 'Customer', 'Armored Truck Driver', 'Consultant'] },
  { name: 'BEACH', roles: ['Lifeguard', 'Surfer', 'Sunbather', 'Ice Cream Vendor', 'Kid Building Sandcastles', 'Photographer', 'Beach Patrol Officer'] },
  { name: 'CASINO', roles: ['Dealer', 'Bartender', 'High Roller', 'Bouncer', 'Server', 'Card Counter', 'Pit Boss'] },
  { name: 'CIRCUS TENT', roles: ['Acrobat', 'Clown', 'Ringmaster', 'Lion Tamer', 'Juggler', 'Fire Eater', 'Ticket Seller'] },
  { name: 'CORPORATE PARTY', roles: ['CEO', 'Intern', 'Accountant', 'Caterer', 'Manager', 'DJ', 'Security'] },
  { name: 'MEDIEVAL CASTLE', roles: ['Knight', 'Archer', 'Squire', 'Blacksmith', 'Cook', 'Jester', 'Monk'] },
  { name: 'DAY SPA', roles: ['Massage Therapist', 'Customer', 'Manicurist', 'Makeup Artist', 'Dermatologist', 'Receptionist', 'Stylist'] },
  { name: 'EMBASSY', roles: ['Ambassador', 'Diplomat', 'Visa Applicant', 'Tourist', 'Secretary', 'Security Guard', 'Government Official'] },
  { name: 'HOSPITAL', roles: ['Doctor', 'Nurse', 'Patient', 'Surgeon', 'Anesthesiologist', 'Intern', 'Therapist'] },
  { name: 'HOTEL', roles: ['Door Attendant', 'Manager', 'Housekeeper', 'Guest', 'Bartender', 'Bellhop', 'Concierge'] },
  { name: 'MILITARY BASE', roles: ['Colonel', 'Soldier', 'Radio Operator', 'Medic', 'Engineer', 'Tank Driver', 'Officer'] },
  { name: 'MOVIE STUDIO', roles: ['Director', 'Actor', 'Camera Operator', 'Costume Artist', 'Stunt Performer', 'Producer', 'Sound Engineer'] },
  { name: 'OCEAN LINER', roles: ['Captain', 'Bartender', 'Musician', 'Rich Passenger', 'Cook', 'Sailor', 'Waiter'] },
  { name: 'PASSENGER TRAIN', roles: ['Mechanic', 'Border Patrol', 'Train Attendant', 'Passenger', 'Restaurant Chef', 'Engineer', 'Stoker'] },
  { name: 'PIRATE SHIP', roles: ['Captain', 'Cook', 'Deckhand', 'Sailor', 'Brave Captive', 'Cannoneer', 'Bos’n'] },
  { name: 'POLAR STATION', roles: ['Medic', 'Geologist', 'Expedition Leader', 'Biologist', 'Radio Operator', 'Hydrologist', 'Meteorologist'] },
  { name: 'POLICE STATION', roles: ['Detective', 'Patrol Officer', 'Criminal', 'Lawyer', 'Journalist', 'Archivist', 'Booking Sergeant'] },
  { name: 'RESTAURANT', roles: ['Chef', 'Waiter', 'Food Critic', 'Customer', 'Bartender', 'Bouncer', 'Host'] },
  { name: 'SCHOOL', roles: ['Gym Teacher', 'Student', 'Principal', 'Security Guard', 'Janitor', 'Cafeteria Worker', 'Maintenance Worker'] },
  { name: 'SPACE STATION', roles: ['Engineer', 'Commander', 'Alien', 'Scientist', 'Doctor', 'Space Tourist', 'Pilot'] },
  { name: 'SUPERMARKET', roles: ['Cashier', 'Customer', 'Butcher', 'Janitor', 'Security Guard', 'Shelf Stocker', 'Manager'] },
  { name: 'THEATER', roles: ['Coat Check Attendant', 'Prompter', 'Cashier', 'Director', 'Actor', 'Crew Member', 'Audience'] },
  { name: 'UNIVERSITY', roles: ['Graduate Student', 'Professor', 'Dean', 'Psychologist', 'Maintenance Worker', 'Student', 'Janitor'] },
  // v2 (2026-09): appended, never reordered — rounds reference locations by index.
  { name: 'AMUSEMENT PARK', roles: ['Ride Operator', 'Mascot', 'Cotton Candy Vendor', 'Thrill Seeker', 'Lost Kid', 'Ticket Checker', 'Park Photographer'] },
  { name: 'ART MUSEUM', roles: ['Curator', 'Tour Guide', 'Art Student', 'Night Guard', 'Restorer', 'Art Thief', 'Gift Shop Clerk'] },
  { name: 'BOWLING ALLEY', roles: ['Shoe Rental Clerk', 'League Captain', 'Pinsetter Mechanic', 'Birthday Kid', 'Snack Bar Cook', 'Rookie Bowler', 'Scorekeeper'] },
  { name: 'CAMPSITE', roles: ['Park Ranger', 'Scout Leader', 'Tent Pitcher', 'Angler', 'Marshmallow Roaster', 'Hiker', 'Storyteller'] },
  { name: 'CONCERT HALL', roles: ['Conductor', 'Violinist', 'Usher', 'Sound Tech', 'Opera Singer', 'Ticket Scalper', 'Superfan'] },
  { name: 'DENTIST OFFICE', roles: ['Hygienist', 'Nervous Patient', 'Receptionist', 'Orthodontist', 'X-Ray Tech', 'Kid With Braces', 'Oral Surgeon'] },
  { name: 'FIRE STATION', roles: ['Fire Chief', 'Firefighter', 'Dispatcher', 'Paramedic', 'Rookie', 'Hose Inspector', 'Engine Driver'] },
  { name: 'FOOTBALL STADIUM', roles: ['Quarterback', 'Referee', 'Head Coach', 'Mascot', 'Hot Dog Vendor', 'Cheerleader', 'Commentator'] },
  { name: 'GAS STATION', roles: ['Cashier', 'Mechanic', 'Trucker', 'Road Tripper', 'Car Washer', 'Delivery Driver', 'Lost Tourist'] },
  { name: 'GYM', roles: ['Personal Trainer', 'Bodybuilder', 'Yoga Instructor', 'Front Desk Clerk', 'Newbie', 'Spin Instructor', 'Cleaner'] },
  { name: 'HAUNTED HOUSE', roles: ['Ghost Actor', 'Scared Teen', 'Tour Guide', 'Makeup Artist', 'Ticket Taker', 'Paranormal Investigator', 'Caretaker'] },
  { name: 'ICE RINK', roles: ['Figure Skater', 'Hockey Player', 'Zamboni Driver', 'Skate Renter', 'Coach', 'Beginner', 'Hot Cocoa Seller'] },
  { name: 'SAFARI', roles: ['Safari Guide', 'Wildlife Photographer', 'Tourist', 'Game Warden', 'Jeep Driver', 'Zoologist', 'Poacher'] },
  { name: 'LAUNDROMAT', roles: ['Owner', 'College Student', 'Parent With Kids', 'Night Owl', 'Repair Tech', 'Dry Cleaner', 'Lost Sock Hunter'] },
  { name: 'CINEMA', roles: ['Projectionist', 'Popcorn Seller', 'Film Critic', 'Usher', 'Couple On A Date', 'Ticket Seller', 'Noisy Kid'] },
  { name: 'NIGHTCLUB', roles: ['DJ', 'Bouncer', 'Bartender', 'Dancer', 'VIP Guest', 'Promoter', 'Coat Checker'] },
  { name: 'SUBMARINE', roles: ['Captain', 'Sonar Operator', 'Navigator', 'Cook', 'Torpedo Officer', 'Engineer', 'Diver'] },
  { name: 'TV STUDIO', roles: ['News Anchor', 'Weather Presenter', 'Camera Operator', 'Producer', 'Makeup Artist', 'Guest Star', 'Stage Manager'] },
  { name: 'WEDDING', roles: ['Bride', 'Groom', 'Best Friend', 'Ring Bearer', 'Officiant', 'Caterer', 'Party Crasher'] },
  { name: 'ZOO', roles: ['Animal Keeper', 'Veterinarian', 'Tourist', 'Kid On A Field Trip', 'Penguin Feeder', 'Gift Shop Clerk', 'Snake Handler'] },
  { name: 'FARM', roles: ['Farmer', 'Tractor Driver', 'Dairy Hand', 'Veterinarian', 'Scarecrow Maker', 'Egg Collector', 'Beekeeper'] },
  { name: 'LIBRARY', roles: ['Librarian', 'Student', 'Author', 'Book Club Member', 'Security Guard', 'Toddler At Story Time', 'Researcher'] },
  { name: 'BAKERY', roles: ['Baker', 'Pastry Chef', 'Cashier', 'Delivery Driver', 'Cake Customer', 'Food Blogger', 'Apprentice'] },
  { name: 'HAIR SALON', roles: ['Hairdresser', 'Colorist', 'Customer', 'Shampoo Assistant', 'Barber', 'Gossiping Regular', 'Nail Tech'] },
  { name: 'RACE TRACK', roles: ['Race Car Driver', 'Pit Crew Chief', 'Mechanic', 'Flag Waver', 'Commentator', 'Superfan', 'Tire Changer'] },
  { name: 'SKI RESORT', roles: ['Ski Instructor', 'Snowboarder', 'Lift Operator', 'Ski Patrol', 'Chalet Chef', 'Beginner Skier', 'Snowmaker'] },
  { name: 'WATER PARK', roles: ['Lifeguard', 'Slide Tester', 'Kid In Floaties', 'Parent', 'Snack Seller', 'Swim Coach', 'Wave Pool Operator'] },
  { name: 'COURTROOM', roles: ['Judge', 'Defense Lawyer', 'Prosecutor', 'Defendant', 'Witness', 'Juror', 'Court Reporter'] },
  { name: 'AIRPORT', roles: ['Air Traffic Controller', 'Baggage Handler', 'Security Screener', 'Gate Agent', 'Customs Officer', 'Duty Free Clerk', 'Delayed Passenger'] },
  { name: 'GARAGE', roles: ['Mechanic', 'Customer', 'Tow Truck Driver', 'Parts Clerk', 'Owner', 'Apprentice', 'Tire Specialist'] },
  { name: 'CALL CENTER', roles: ['Phone Agent', 'Team Lead', 'Trainee', 'IT Support', 'Quality Checker', 'Night Shift Worker', 'Manager'] },
  { name: 'ROYAL PALACE', roles: ['Monarch', 'Royal Heir', 'Butler', 'Court Painter', 'Royal Cook', 'Palace Guard', 'Court Wizard'] },
  { name: 'POST OFFICE', roles: ['Postal Clerk', 'Mail Carrier', 'Sorter', 'Customer', 'Delivery Driver', 'Stamp Collector', 'Postmaster'] },
  { name: 'RECORDING STUDIO', roles: ['Singer', 'Producer', 'Sound Engineer', 'Drummer', 'Backup Singer', 'Intern', 'Session Guitarist'] },
  { name: 'PIZZERIA', roles: ['Pizza Chef', 'Delivery Driver', 'Cashier', 'Dishwasher', 'Hungry Student', 'Birthday Party Host', 'Food Critic'] },
  { name: 'ESCAPE ROOM', roles: ['Game Master', 'Puzzle Fan', 'Team Captain', 'Nervous Player', 'Birthday Group', 'Actor In Costume', 'Cleaner'] },
]

export const SPY_LOCATION_COUNT = SPYFAIR_LOCATIONS.length
