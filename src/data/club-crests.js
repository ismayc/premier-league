// The crest for every club in the historical tables, keyed by the club name
// scripts/fetch-history.mjs writes (openfootball's, canonicalised). NOT
// generated: history changes once a year, so this is kept by hand rather than
// adding ESPN's team lists to every refresh.
//
// Each value is the club's ESPN slug, and public/logos/<slug>.png and
// <slug>-dark.png are committed. Built September 19, 2026 by matching each name
// exactly against ESPN's eng.1 to eng.5 club lists; the crests came from the
// per-club route `/teams/<id>`, with the light crest reused where ESPN has no
// dark one (Bradford, Swindon). Current clubs are listed too, so a relegation
// never costs a club its crest.
//
// Wimbledon is the one crest not from ESPN, hence the non-ESPN slug. The
// original Wimbledon FC was dissolved in 2004 and ESPN has no record of it
// (AFC Wimbledon, its only match, is a separate club founded in 2002). The
// crest is the blue-and-yellow shield the club wore from 1981 until 2003, so
// through all eight of its Premier League seasons, rendered to a 160px PNG from
// Wikipedia's File:Wimbledon_FC_crest.svg (tagged there as a non-free logo).
// It has no dark variant; the light one is reused.
//
// test/crests.test.js fails if a club in the history has no entry here and no
// current-season crest, naming the club to add.

export const CLUB_CREST_SLUGS = {
  "AFC Bournemouth": "eng.bournemouth",
  "Arsenal": "eng.arsenal",
  "Aston Villa": "eng.aston_villa",
  "Barnsley": "eng.barnsley",
  "Birmingham City": "eng.birmingham",
  "Blackburn Rovers": "eng.blackburn",
  "Blackpool": "eng.blackpool",
  "Bolton Wanderers": "eng.bolton",
  "Bradford City": "eng.bradford",
  "Brentford": "eng.brentford",
  "Brighton & Hove Albion": "eng.brighton",
  "Burnley": "eng.burnley",
  "Cardiff City": "eng.cardiff",
  "Charlton Athletic": "eng.charlton",
  "Chelsea": "eng.chelsea",
  "Coventry City": "eng.coventry",
  "Crystal Palace": "eng.crystal_palace",
  "Derby County": "eng.derby",
  "Everton": "eng.everton",
  "Fulham": "eng.fulham",
  "Huddersfield Town": "eng.huddersfield",
  "Hull City": "eng.hull",
  "Ipswich Town": "eng.ipswich",
  "Leeds United": "eng.leeds",
  "Leicester City": "eng.leicester",
  "Liverpool": "eng.liverpool",
  "Luton Town": "eng.luton",
  "Manchester City": "eng.man_city",
  "Manchester United": "eng.man_utd",
  "Middlesbrough": "eng.middlesbrough",
  "Newcastle United": "eng.newcastle",
  "Norwich City": "eng.norwich",
  "Nottingham Forest": "eng.nottm_forest",
  "Oldham Athletic": "eng.oldham",
  "Portsmouth": "eng.portsmouth",
  "Queens Park Rangers": "eng.qpr",
  "Reading": "eng.reading",
  "Sheffield United": "eng.sheff_utd",
  "Sheffield Wednesday": "eng.sheff_wed",
  "Southampton": "eng.southampton",
  "Stoke City": "eng.stoke",
  "Sunderland": "eng.sunderland",
  "Swansea City": "eng.swansea",
  "Swindon Town": "eng.swindon",
  "Tottenham Hotspur": "eng.tottenham",
  "Watford": "eng.watford",
  "West Bromwich Albion": "eng.west_brom",
  "West Ham United": "eng.west_ham",
  "Wigan Athletic": "eng.wigan",
  "Wimbledon": "wimbledon_fc_1981",
  "Wolverhampton Wanderers": "eng.wolverhampton",
}
