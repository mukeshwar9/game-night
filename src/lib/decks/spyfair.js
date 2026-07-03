// SPYFAIR locations. Every non-spy player secretly shares the same location;
// the lone spy sees only "SPY" and must blend in by asking/answering questions
// without revealing they don't know where everyone is.
//
// Each entry: { name, roles } — roles are flavor jobs handed to non-spies so
// each player has a distinct angle to question from (purely cosmetic; the
// shared secret is the location name).
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
  { name: 'BEACH', roles: ['Lifeguard', 'Surfer', 'Sunbather', 'Ice Cream Vendor', 'Kid Building Sandcastles', 'Photographer', 'Beach Cop'] },
  { name: 'CASINO', roles: ['Dealer', 'Bartender', 'High Roller', 'Bouncer', 'Cocktail Waitress', 'Hustler', 'Pit Boss'] },
  { name: 'CIRCUS TENT', roles: ['Acrobat', 'Clown', 'Ringmaster', 'Lion Tamer', 'Juggler', 'Fire Eater', 'Ticket Seller'] },
  { name: 'CORPORATE PARTY', roles: ['CEO', 'Intern', 'Accountant', 'Caterer', 'Manager', 'DJ', 'Security'] },
  { name: 'CRUSADER ARMY', roles: ['Knight', 'Archer', 'Squire', 'Bishop', 'Servant', 'Prisoner', 'Monk'] },
  { name: 'DAY SPA', roles: ['Masseuse', 'Customer', 'Manicurist', 'Makeup Artist', 'Dermatologist', 'Receptionist', 'Stylist'] },
  { name: 'EMBASSY', roles: ['Ambassador', 'Diplomat', 'Refugee', 'Tourist', 'Secretary', 'Security Guard', 'Government Official'] },
  { name: 'HOSPITAL', roles: ['Doctor', 'Nurse', 'Patient', 'Surgeon', 'Anesthesiologist', 'Intern', 'Therapist'] },
  { name: 'HOTEL', roles: ['Doorman', 'Manager', 'Housekeeper', 'Guest', 'Bartender', 'Bellhop', 'Concierge'] },
  { name: 'MILITARY BASE', roles: ['Colonel', 'Soldier', 'Sniper', 'Medic', 'Engineer', 'Tank Driver', 'Officer'] },
  { name: 'MOVIE STUDIO', roles: ['Director', 'Actor', 'Cameraman', 'Costume Artist', 'Stuntman', 'Producer', 'Sound Engineer'] },
  { name: 'OCEAN LINER', roles: ['Captain', 'Bartender', 'Musician', 'Rich Passenger', 'Cook', 'Sailor', 'Waiter'] },
  { name: 'PASSENGER TRAIN', roles: ['Mechanic', 'Border Patrol', 'Train Attendant', 'Passenger', 'Restaurant Chef', 'Engineer', 'Stoker'] },
  { name: 'PIRATE SHIP', roles: ['Captain', 'Cook', 'Cabin Boy', 'Sailor', 'Brave Captive', 'Cannoneer', 'Bos’n'] },
  { name: 'POLAR STATION', roles: ['Medic', 'Geologist', 'Expedition Leader', 'Biologist', 'Radioman', 'Hydrologist', 'Meteorologist'] },
  { name: 'POLICE STATION', roles: ['Detective', 'Patrol Officer', 'Criminal', 'Lawyer', 'Journalist', 'Archivist', 'Booking Sergeant'] },
  { name: 'RESTAURANT', roles: ['Chef', 'Waiter', 'Food Critic', 'Customer', 'Bartender', 'Bouncer', 'Hostess'] },
  { name: 'SCHOOL', roles: ['Gym Teacher', 'Student', 'Principal', 'Security Guard', 'Janitor', 'Lunch Lady', 'Maintenance Man'] },
  { name: 'SPACE STATION', roles: ['Engineer', 'Commander', 'Alien', 'Scientist', 'Doctor', 'Space Tourist', 'Pilot'] },
  { name: 'SUPERMARKET', roles: ['Cashier', 'Customer', 'Butcher', 'Janitor', 'Security Guard', 'Shelf Stocker', 'Manager'] },
  { name: 'THEATER', roles: ['Coat Check Lady', 'Prompter', 'Cashier', 'Director', 'Actor', 'Crew Member', 'Audience'] },
  { name: 'UNIVERSITY', roles: ['Graduate Student', 'Professor', 'Dean', 'Psychologist', 'Maintenance Man', 'Student', 'Janitor'] },
]

export const SPY_LOCATION_COUNT = SPYFAIR_LOCATIONS.length
