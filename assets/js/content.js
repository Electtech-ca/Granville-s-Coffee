/* Default website content. The site works with these values alone (e.g. on GitHub Pages).
   When the Granville's server is running, anything edited in the Admin Portal replaces them. */
window.GRANVILLES_DEFAULTS = {
  settings: {
    address: "383 Reid Street, Quesnel, BC",
    phone: "",
    email: "",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Granville%27s+Coffee+383+Reid+Street+Quesnel+BC",
    menuListingUrl: "https://granvillescoffee.gotoeat.net/menu"
  },
  hours: [],
  menu: [
    { slug: "sandwiches", label: "🥪 Sandwiches", title: "THE SANDWICH DEPARTMENT", emoji: "🥪", items: [
      { name: "Classic Reuben", description: "The kind of sandwich that has strong opinions about lunch." },
      { name: "Montreal Smoked Meat", description: "A proper conversation starter. Often followed by silence while chewing." },
      { name: "Tuna Melt", description: "Proof that even a sandwich can have a dramatic transformation." },
      { name: "Clubhouse", description: "A club you can join without a membership interview." },
      { name: "Ham and Havarti", description: "A distinguished duo with excellent table manners." },
      { name: "Egg Salad", description: "Quietly dependable. Unlike the directions you'll get from Table Four." },
      { name: "Sicilian Cowboy", description: "The name alone deserves its own movie trailer." },
      { name: "Grilled Cheese", description: "Simple, glorious, and unlikely to ask about your five-year plan." }
    ]},
    { slug: "comfort", label: "🍲 Comfort food", title: "THE COMFORT FOOD SOCIETY", emoji: "🍲", items: [
      { name: "Chicken Pot Pie", description: "A warm hug wearing a pastry hat." },
      { name: "Chili Con Carne", description: "For when the weather and your opinions both have a little heat." },
      { name: "Lasagna", description: "Layers of comfort. Layers of stories. Absolutely no layers of pretension." },
      { name: "Crispy Chicken Burger and Fries", description: "The lunch break that politely refuses to be brief." },
      { name: "Poutine", description: "Fries, gravy, and a very persuasive argument for staying longer." },
      { name: "Garden Salad", description: "A refreshing intermission between other people's life stories." }
    ]},
    { slug: "breakfast", label: "🍳 Breakfast", title: "THE MORNING COMMITTEE", emoji: "🍳", items: [
      { name: "French Toast", description: "A perfectly respectable excuse to cancel your early errands." },
      { name: "Ham and Cheese Omelette", description: "Breakfast holding a very productive meeting with itself." },
      { name: "Mexican Omelette", description: "The morning has arrived with a plot twist." },
      { name: "Eggs Benedict", description: "A breakfast with excellent posture and considerable ambition." },
      { name: "Breakfast Sandwich", description: "For the person who said, 'I'll just grab something quick.'" }
    ]},
    { slug: "sweets", label: "🍰 Sweet things", title: "THE DESSERT CONSPIRACY", emoji: "🍰", items: [
      { name: "Our Home-Built Cheesecake", description: "A structural masterpiece. Please do not ask for the blueprints." },
      { name: "Cinnamon Roll", description: "A spiral of happiness with no interest in your schedule." },
      { name: "Carrot Cake", description: "Vegetables, technically. The committee approves." },
      { name: "Assorted Pastries", description: "The only assortment where nobody complains about too many choices." },
      { name: "Apple Pie", description: "A sweet ending with a suspiciously strong second-act performance." }
    ]},
    { slug: "drinks", label: "☕ Drinks", title: "THE COFFEE & COMPANY BUREAU", emoji: "☕", items: [
      { name: "Espresso", description: "Small cup. Big personality. No unnecessary meetings." },
      { name: "Cappuccino", description: "A little foam and a lot of opportunity for conversation." },
      { name: "Americano", description: "For those who prefer their coffee straightforward and their gossip elaborate." },
      { name: "Mocha", description: "Coffee and chocolate, finally agreeing on something." },
      { name: "German Chocolate Mocha", description: "The coffee equivalent of dressing up for a Tuesday." },
      { name: "Chai Latté", description: "A comforting detour from the usual route." },
      { name: "Old Fashioned Soda Fountain Milkshake", description: "Nostalgia with a straw and no expiration date on fun." },
      { name: "Italian Cream Soda", description: "An effervescent character in a very lively supporting role." }
    ]}
  ],
  lists: {
    directions: [
      "“Go past the place that used to sell tires. Not the new tire place. The OLD one.”",
      "“Take the scenic route. It's only 40 minutes longer, but Margaret swears by it.”",
      "“You want the highway? First, let me tell you what happened to that road in 1986.”",
      "“Left at the lights. Unless Bill fixed the sign. In that case, ask Bill.”",
      "“I'll draw you a map.” (The map is a napkin with three circles and a moose.)",
      "“Oh, you're going to Prince George? My nephew lives there. Sit down.”"
    ],
    rumours: [
      "Breaking: someone brought a reusable cup and now it's the talk of three tables.",
      "Unconfirmed: the cinnamon buns have formed a union and demand longer coffee breaks.",
      "Local mystery: somebody said 'just a quick coffee' and left two hours later.",
      "Urgent bulletin: the empty chair by the window has been reserved by absolutely nobody.",
      "Witnesses report that a visitor asked one question and received eleven life stories."
    ],
    locals: [
      "Congratulations. You are now on first-name terms with six people. Two of them are named Dave.",
      "You're 83% local. The remaining 17% requires knowing where the old bridge used to be.",
      "Official verdict: you came for coffee and now you're helping someone move a sofa.",
      "You've been adopted by Table Three. Attendance is expected, but never recorded.",
      "You're practically a regular. Somebody has already asked why you weren't here yesterday."
    ]
  },
  stories: [
    { line: "“A traveller asked where the highway was. Four locals answered. None agreed. All offered to drive them.”", caption: "You came for coffee. You've been invited to somebody's barbecue.", bubbles: ["“I know the way!”", "“I know a better way!”", "“In 1983…”"] },
    { line: "“Someone came in to ask the time. They left with two recipes, a fishing tip and a new best friend.”", caption: "Estimated visit: 10 minutes. Actual visit: ask the clock.", bubbles: ["“What time is it?”", "“Time for another cup.”", "“Speaking of time…”"] },
    { line: "“The newcomer said they didn't know anyone in town. The room took that personally.”", caption: "Stranger status: revoked by unanimous vote.", bubbles: ["“I'm new here.”", "“Not anymore!”", "“Meet my cousin!”"] },
    { line: "“A simple question about the weather produced seven forecasts, a tractor story and an argument about 1996.”", caption: "Forecast: 100% chance of conversation.", bubbles: ["“Looks like rain.”", "“No, it doesn't.”", "“Back in '96…”"] },
    { line: "“One person ordered lunch. Somehow the whole table is now planning a community event.”", caption: "Committee membership: involuntary but friendly.", bubbles: ["“Just a sandwich.”", "“We need volunteers!”", "“You're treasurer.”"] }
  ],
  characters: [
    ["New around here? Sit down. You're late for a friendship you didn't know you had.", "I know a shortcut. It takes longer, but the story is better.", "I stopped for coffee. Apparently I'm helping organize a community picnic now."],
    ["You can tell me your name, or I can ask everyone here. My way is faster.", "Turn left where the old shop used to be. No, the OTHER old shop.", "I've been here nine minutes and someone has invited me fishing."],
    ["You don't need to know everyone. Everyone already knows someone who knows you.", "If you get lost, come back. We'll argue about the route over lunch.", "I was a stranger at breakfast. At noon I was somebody's emergency contact."]
  ],
  quest: [
    { art: "🥪", q: "A sandwich has vanished. What do you investigate first?", choices: ["Interview the Reuben. It looks suspicious.", "Ask the coffee cup. It sees everything."], reactions: ["The Reuben demands a lawyer. You receive a napkin instead.", "The coffee cup says the suspect went toward the gossip table."] },
    { art: "🗞️", q: "Mabel has three versions of the same story. Which one do you trust?", choices: ["The one with the dramatic pause.", "The one told by the person who was actually there."], reactions: ["Excellent choice. Absolutely no evidence, but wonderful suspense.", "Sensible. The room is disappointed by your commitment to facts."] },
    { art: "🧭", q: "Doug offers directions to the highway. Your response?", choices: ["Ask for the route that still exists.", "Stay for pie and let the highway find you."], reactions: ["Doug draws a map. Half the landmarks closed in 1984.", "You have discovered the true shortcut: dessert."] }
  ],
  // "The Bottom of the Cup": the coffee grounds settle into one of these symbols.
  // symbol is drawn by the grounds (an emoji works best); legendary appears about once in `odds` swirls.
  oracle: {
    odds: 40,
    readings: [
      { symbol: "🫎", name: "The Moose", reading: "A large, unhurried opportunity is standing in the middle of your road. Do not honk. Wait for it to finish thinking." },
      { symbol: "🛶", name: "The Canoe", reading: "Two rivers meet in your future, the way the Fraser meets the Quesnel. Paddle toward whichever side has pie." },
      { symbol: "🌲", name: "The Pine", reading: "You will grow tall, steady and slightly sticky. People will lean on you, mostly in a good way." },
      { symbol: "🥧", name: "The Pie", reading: "A slice of good news arrives warm. Someone at the next table will claim they heard it first." },
      { symbol: "🔑", name: "The Key", reading: "A door you thought was locked is only stiff. Lift a little and push, like every good back door in town." },
      { symbol: "⛰️", name: "The Mountain", reading: "A big climb is coming. Take snacks. Take a friend. Ignore anyone who mentions a shortcut." },
      { symbol: "🦉", name: "The Owl", reading: "You already know the answer. You were waiting for someone to top up your cup and say it out loud." },
      { symbol: "❤️", name: "The Heart", reading: "Someone is about to remember your order without asking. Act natural. Tip generously." },
      { symbol: "🐟", name: "The Fish", reading: "The one that got away has been telling everyone about you. You come off rather well in the story." },
      { symbol: "☀️", name: "The Sun", reading: "Clear skies ahead, which in the Cariboo means bring a jacket anyway." },
      { symbol: "🚲", name: "The Bicycle", reading: "Balance is coming back to your life. Keep pedalling and wave at everyone. They will wave back." },
      { symbol: "❓", name: "The Question Mark", reading: "The grounds refuse to comment until they've heard your side of the story. Order another cup and start talking." }
    ],
    legendary: { symbol: "⭐", name: "The Cariboo Gold", reading: "Once in a lifetime. The grounds have struck gold, the way the Cariboo did in the 1860s. Your luck is extraordinary today. Tell Ted. Ted will tell everyone." }
  }
};
