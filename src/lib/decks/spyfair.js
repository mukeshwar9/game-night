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
// NOTE ON THE LOCATION COMMITMENT (see SpyfairGame.jsx): this whole list ships in the
// client bundle, so there are only ~24 possible locations. The round's salted SHA-256
// location commitment therefore only resists brute force while its salt stays secret
// (the salt lives in the host's sessionStorage and is published only at the result
// phase). It defends against casual reading of a Firebase field — NOT against a
// determined player, who can already read the location out of the world-readable
// `round.private` map. A trusted server would be required to truly hide it.

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
]

export const SPY_LOCATION_COUNT = SPYFAIR_LOCATIONS.length
