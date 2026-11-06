/* Default website content. The site works with these values alone (e.g. on GitHub Pages).
   When the Granville's server is running, anything edited in the Admin Portal replaces them.

   Menu items come from Granville's published menu listing (granvillescoffee.gotoeat.net/menu) and
   items customers mention in public reviews. Food photos are free-licence stand-ins from Unsplash
   until the café's own photos are uploaded in the admin portal (Edit website → Menu). */
(function () {
  const U = (id) => "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=900&q=70";

  window.GRANVILLES_DEFAULTS = {
    settings: {
      address: "383 Reid Street, Quesnel, BC V2J 2M5",
      phone: "250-992-3667",
      email: "",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Granville%27s+Coffee+383+Reid+Street+Quesnel+BC",
      menuListingUrl: "https://granvillescoffee.gotoeat.net/menu"
    },
    // From Tourism Quesnel's listing. The admin portal can change these.
    hours: [
      { day: "Monday", open: "7:00 a.m.", close: "7:00 p.m.", closed: false, open24: "07:00", close24: "19:00" },
      { day: "Tuesday", open: "7:00 a.m.", close: "7:00 p.m.", closed: false, open24: "07:00", close24: "19:00" },
      { day: "Wednesday", open: "7:00 a.m.", close: "7:00 p.m.", closed: false, open24: "07:00", close24: "19:00" },
      { day: "Thursday", open: "7:00 a.m.", close: "7:00 p.m.", closed: false, open24: "07:00", close24: "19:00" },
      { day: "Friday", open: "7:00 a.m.", close: "7:00 p.m.", closed: false, open24: "07:00", close24: "19:00" },
      { day: "Saturday", open: "7:00 a.m.", close: "7:00 p.m.", closed: false, open24: "07:00", close24: "19:00" },
      { day: "Sunday", open: "8:00 a.m.", close: "5:00 p.m.", closed: false, open24: "08:00", close24: "17:00" }
    ],

    menu: [
      { slug: "breakfast", label: "Breakfast", title: "Served from opening. Conversation served all day.", emoji: "🍳", photo: U("1678983839772-3642df88d2c1"), items: [
        { name: "Bacon N Eggs", description: "The breakfast your grandfather ordered, ordered by his grandson at the same table.", photo: U("1686150778458-ce4d48f9697d") },
        { name: "Ham & Cheese Omelette", description: "Folded with care. Unlike most of the maps drawn at the next table.", photo: U("1710533788728-800be38530a8") },
        { name: "Breakfast Sandwich", description: "For people who say they're in a hurry. We've heard that before.", photo: U("1528736235302-52922df5c122") },
        { name: "Breakfast Bagel", description: "A round answer to a long morning.", photo: U("1528736235302-52922df5c122") },
        { name: "French Toast", description: "Thick-cut and unashamed. A fine reason to cancel the early errands.", photo: U("1484723091739-30a097e8f929") },
        { name: "Belgian Waffle", description: "Deep squares, built to hold syrup and second opinions.", photo: U("1562376552-0d160a2f238d") },
        { name: "Strawberry Waffle", description: "The Belgian waffle in its Sunday clothes.", photo: U("1568051243851-f9b136146e97") },
        { name: "Hot Oatmeal", description: "Warm, steady and good for you. We try to be all three; the oatmeal manages it.", photo: U("1628642585518-2d63c2beab6b") },
        { name: "Hippie Oats", description: "Oatmeal that grew its hair out. Regulars recommend it.", photo: U("1628642585518-2d63c2beab6b") },
        { name: "Thick Homemade Toast", description: "We bake the bread, then cut it like we're expecting company.", photo: U("1595044643502-616eeebbdff3") },
        { name: "2+2+2 Special", description: "Twos of the good stuff. Ask at the counter and somebody will explain it, at length.", photo: U("1678983839772-3642df88d2c1") },
        { name: "3+4 Special", description: "The arithmetic is simple. Finishing it is the hard part.", photo: U("1686150778458-ce4d48f9697d") },
        { name: "Hungry Hobo", description: "For appetites that walked here from out of town. Ask what's in it; it's a long, happy answer.", photo: U("1608475861994-cf7af0f0c1be") }
      ]},
      { slug: "sandwiches", label: "Sandwiches & Panini", title: "Made to order. Eaten slowly, if you're doing it right.", emoji: "🥪", photo: U("1553909489-cd47e0907980"), items: [
        { name: "Classic Reuben", description: "Grilled on the panini press and very sure of itself. Customers mention it by name.", photo: U("1553909489-cd47e0907980") },
        { name: "Montreal Smoked Meat", description: "A proper conversation starter, followed by a respectful silence while chewing.", photo: U("1709689155464-90d6ca1e9f62") },
        { name: "Sicilian Cowboy", description: "The name alone deserves a movie. The sandwich is better than the movie would be.", photo: U("1709689156424-16fe0e05b47b") },
        { name: "Tuna Melt", description: "Proof that anyone can turn their life around with a bit of heat and some cheese.", photo: U("1496113269490-84ffe1a410cb") },
        { name: "Grilled Cheese", description: "Simple, golden, and unlikely to ask about your five-year plan.", photo: U("1528735602780-2552fd46c7af") },
        { name: "Vegetarian Panini", description: "Pressed, hot and entirely innocent of meat.", photo: U("1509722747041-616f39b57569") },
        { name: "Clubhouse", description: "The one club in town with no membership committee.", photo: U("1676300184084-de35d56a9a70") },
        { name: "BLT", description: "Three letters everyone in Quesnel can spell.", photo: U("1712746784291-e29d5d2694d4") },
        { name: "Ham and Havarti", description: "A distinguished pair with excellent manners.", photo: U("1539252554453-80ab65ce3586") },
        { name: "Roast Beef", description: "Sliced generously. We were raised that way.", photo: U("1567234669003-dce7a7a88821") },
        { name: "Egg Salad", description: "Quietly dependable, like the regulars at the window table.", photo: U("1475090169767-40ed8d18f67d") },
        { name: "Tuna Salad", description: "The cool, calm cousin of the Tuna Melt.", photo: U("1496113269490-84ffe1a410cb") },
        { name: "Vegetarian", description: "Fresh, cold and crunchy. Pairs well with a long chat.", photo: U("1509722747041-616f39b57569") },
        { name: "Crispy Chicken Burger", description: "Comes with fries and a very good argument for a longer lunch.", photo: U("1614746526977-fac370353ae8") }
      ]},
      { slug: "home-recipes", label: "Soups, Salads & Home Recipes", title: "Our own recipes. Some older than the staff.", emoji: "🍲", photo: U("1729450411383-1f089460ba42"), items: [
        { name: "Chili Con Carne", description: "A house recipe with a bit of heat, for when the Cariboo weather has none.", photo: U("1729450411383-1f089460ba42") },
        { name: "Chicken Pot Pie", description: "A warm hug wearing a pastry hat.", photo: U("1581986675622-41eccf27129d") },
        { name: "Doukhobor Borscht", description: "A rich, creamy borscht from a proud B.C. tradition. Your bowl may come with a history lesson.", photo: U("1648726445011-9fbf3a5ddb90") },
        { name: "Full Caesar", description: "Crisp, garlicky, and big enough to count as lunch.", photo: U("1550304943-4f24f54ddde9") },
        { name: "Half Caesar", description: "For people who are saving room for a cinnamon bun. We see you.", photo: U("1746211108786-ca20c8f80ecd") },
        { name: "Tuna Salad on Greens", description: "The tuna salad, taking the healthy route for once.", photo: U("1546793665-c74683f339c1") }
      ]},
      { slug: "baking", label: "Baking & Desserts", title: "Baked in-house. Witnesses available.", emoji: "🍰", photo: U("1694632288834-17d86b340745"), items: [
        { name: "Giant Homemade Cinnamon Buns", description: "The most-mentioned thing in our reviews. We'd be modest about them, but that ship has sailed.", photo: U("1694632288834-17d86b340745") },
        { name: "Our Home-Built Cheesecake", description: "Built, not baked. A structural masterpiece. Please don't ask for the blueprints.", photo: U("1676300185983-d5f242babe34") },
        { name: "Dutch Apple Pie", description: "Crumb on top, apples underneath, no nonsense in between.", photo: U("1535920527002-b35e96722eb9") },
        { name: "Date Squares", description: "An old-fashioned square for people who know exactly what they like.", photo: U("1576670442263-be3584ad3dde") },
        { name: "Butter Tarts", description: "Visitors write home about these. A Canadian classic, done the way your aunt claims she does it.", photo: U("1562007908-17c67e878c88") }
      ]},
      { slug: "coffee", label: "Coffee & Hot Drinks", title: "North Roast coffee, roasted locally. Quesnel's first espresso bar, since 1992.", emoji: "☕", photo: U("1514432324607-a09d9b4aefdd"), items: [
        { name: "North Roast Coffee", description: "Locally roasted drip coffee, 12 oz. Refills are how most of our friendships started.", photo: U("1514432324607-a09d9b4aefdd") },
        { name: "Brutal", description: "A large coffee with two shots of espresso in it. Named honestly.", photo: U("1497636577773-f1231844b336") },
        { name: "Espresso", description: "Small cup, big personality. We were pouring these before it was fashionable in town.", photo: U("1559496417-e7f25cb247f3") },
        { name: "Americano", description: "For people who like their coffee straightforward and their gossip elaborate.", photo: U("1506372023823-741c83b836fe") },
        { name: "Cappuccino", description: "A little foam and a lot of opportunity for conversation.", photo: U("1541167760496-1628856ab772") },
        { name: "Mocha", description: "Coffee and chocolate, finally agreeing on something.", photo: U("1542990253-0d0f5be5f0ed") },
        { name: "German Chocolate Mocha", description: "The mocha, dressed up for a Tuesday.", photo: U("1517578239113-b03992dcdd25") },
        { name: "Caramel Macchiato", description: "Sweet, layered and slightly show-offy.", photo: U("1485808191679-5f86510681a2") },
        { name: "Chai Latté", description: "A warm, spiced detour from the usual route.", photo: U("1593443320739-77f74939d0da") },
        { name: "Hot Chocolate", description: "For the grandkids. And the grandparents, if nobody's looking.", photo: U("1637572815755-c4b80092dce1") },
        { name: "Steamed Flavoured Milk", description: "Comfort in a cup, no caffeine required.", photo: U("1607196707151-2db8b71294ba") },
        { name: "Steamed Oat or Almond Milk", description: "Ask for it in any drink. We won't make a face.", photo: U("1533776992670-a72f4c28235e") }
      ]},
      { slug: "cold-drinks", label: "Shakes, Smoothies & Cold Drinks", title: "From the old-fashioned soda fountain.", emoji: "🥤", photo: U("1579954115545-a95591f28bfc"), items: [
        { name: "Old Fashioned Soda Fountain Milkshake", description: "Thick enough to need patience. Nostalgia with a straw.", photo: U("1579954115545-a95591f28bfc") },
        { name: "Espresso Shake", description: "A milkshake that had a coffee and now has plans.", photo: U("1572490122747-3968b75cc699") },
        { name: "Granville's Frappuccino", description: "Our own blended iced coffee. Cold drink, warm room.", photo: U("1577805947697-89e18249d767") },
        { name: "Iced Latté", description: "The latte, keeping its cool.", photo: U("1575159249868-df58bf5e09ec") },
        { name: "Smoothie", description: "Fruit, blended. Even we can't find a joke in that, and we tried.", photo: U("1615478503562-ec2d8aa0e24e") },
        { name: "Power Smoothie", description: "The smoothie that goes to the gym. Occasionally.", photo: U("1622597467836-f3285f2131b8") },
        { name: "Italian Cream Soda", description: "Fizzy, creamy, and the most colourful thing in the building.", photo: U("1662130187270-a4d52c700eb6") },
        { name: "Float", description: "Ice cream on soda. Technically a drink. Spiritually a dessert.", photo: U("1553787499-6f9133860278") },
        { name: "Creamsicle", description: "Orange and cream, like a summer afternoon in 1965.", photo: U("1553787499-6f9133860278") },
        { name: "Espresso à la Mode", description: "Hot espresso poured over ice cream. A dignified way to have dessert at 10 a.m.", photo: U("1572490122747-3968b75cc699") },
        { name: "Homemade Iced Tea", description: "Brewed here, not poured from a jug with a cartoon on it.", photo: U("1575159249868-df58bf5e09ec") }
      ]}
    ],

    // Wall of Honour. status: "confirmed" (checked in a news report), "pending" (claimed, decision not yet published),
    // or "milestone" (a fact about the café rather than an award).
    awards: [
      { year: "2025", title: "Lifetime Achievement Business Award", from: "Quesnel & District Chamber of Commerce · Business Excellence Awards", text: "A new award, given to Ted at the October 18 ceremony at the Quesnel Seniors' Centre for more than three decades of lasting impact on local business and local life. In his speech he honoured the late former mayor Mary Sjostrom.", status: "confirmed", source: "My Cariboo Now, Oct. 19, 2025", sourceUrl: "https://www.mycariboonow.com/113603/news/business/chamber-of-commerce/over-a-hundred-honoured-in-quesnels-business-excellence-awards" },
      { year: "2021", title: "Paul Harris Fellowship", from: "Rotary Club of Quesnel", text: "Rotary's highest honour for community service. Ted isn't a Rotarian, which makes it rarer: he was only the second non-member the Quesnel club had honoured this way. Cited for support of autism awareness, fire victims, Quesnel Search and Rescue and the downtown association.", status: "confirmed", source: "Quesnel Cariboo Observer, July 10, 2021", sourceUrl: "https://bpbpd.wpengine.com/news/quesnel-rotary-honouring-ted-martindale-with-paul-harris-fellowship" },
      { year: "2020", title: "Business Person of the Year", from: "Quesnel Business Excellence Awards", text: "Named Quesnel's Business Person of the Year at the 2020 awards, held online that year. Ted would like it noted that he still had to dress up for the camera.", status: "confirmed", source: "My Cariboo Now, Oct. 2, 2020", sourceUrl: "https://www.mycariboonow.com/66200/quesnels-top-businesses-recognized/" },
      { year: "2026", title: "World's largest carrot cake (record claim)", from: "Submitted to Guinness World Records", text: "For his 80th birthday in March 2026, Ted and a team of twelve assembled a carrot cake of nearly 6,000 lb at the Seniors' Centre, with the mayor checking the measurements. Guinness hasn't ruled yet. Much of the cake went to the Quesnel food bank.", status: "pending", source: "CKPG Today, Mar. 26, 2026", sourceUrl: "https://ckpgtoday.ca/?p=490417" },
      { year: "1992", title: "Quesnel's first espresso shop", from: "Milestone", text: "Granville's opened in 1992 as the first espresso shop in Quesnel. Everyone else has been catching up ever since. Politely.", status: "milestone", source: "Waymarking.com listing", sourceUrl: "https://www.waymarking.com/waymarks/WM10YF5_Granvilles_Coffee_Quesnel_BC" },
      { year: "Today", title: "4.5 out of 5 from about 286 reviewers", from: "Milestone · Tripadvisor", text: "The people's verdict. The cinnamon buns, butter tarts and Reubens get most of the credit, and honestly, they've earned it.", status: "milestone", source: "Tripadvisor, Nov. 2026", sourceUrl: "https://www.tripadvisor.ca/Restaurant_Review-g182161-d762324-Reviews-Granville_s_Coffee-Quesnel_Cariboo_British_Columbia.html" }
    ],

    // Our Story timeline.
    timeline: [
      { year: "Before 1992", title: "Nine years on the road", text: "Ted spent nine years travelling for work and drank a great deal of highway coffee. He came away with one conclusion: a town needs a proper place to sit down." },
      { year: "1992", title: "A loan, some used equipment and no experience", text: "In his words, he \"borrowed a whole bunch of money, bought a bunch of old restaurant equipment and somehow started off.\" No restaurant background. No cooking lessons. Quesnel's first espresso shop opened on Reid Street." },
      { year: "1990s – 2010s", title: "The room fills up", text: "The coffee sacks went up on the ceiling, the regulars claimed their tables, and the morning crowd became a Quesnel tradition. The café grew to cover 375 and 383 Reid Street." },
      { year: "2020", title: "Business Person of the Year", text: "Quesnel's business community named Ted its Business Person of the Year." },
      { year: "2021", title: "Rotary's Paul Harris Fellowship", text: "Honoured by the Quesnel Rotary Club for years of giving: autism awareness, fire victims, Search and Rescue and the downtown." },
      { year: "2025", title: "Lifetime Achievement", text: "The Chamber of Commerce created a Lifetime Achievement Business Award and gave the first one to Ted. Granville's now employs 26 people." },
      { year: "2026", title: "Eighty years old, six thousand pounds of cake", text: "Ted turned 80 by baking the town a carrot cake of nearly 6,000 lb. He still goes to work every day. We've asked him to slow down. He asked us who'd make the coffee." }
    ],

    // The Directions Desk: real places visitors ask about, with honest directions and the local version.
    places: [
      { name: "Barkerville Historic Town", time: "About 1 hr 15 min by car", how: "Head east on Highway 26 for about 85 km. The road ends at the gold-rush town, so you can't miss it.", local: "\"Fill up on gas and cinnamon buns before you go. Barkerville has gold. We have the buns.\"", query: "Barkerville Historic Town and Park" },
      { name: "Pinnacles Provincial Park", time: "About 10 minutes by car", how: "Cross the river to West Quesnel and follow Baker Drive west to the park. A short walk from the parking lot to the hoodoo viewpoint.", local: "\"Go at sunset. Then come back and tell us about it. Somebody will have a better sunset story.\"", query: "Pinnacles Provincial Park Quesnel" },
      { name: "Riverfront Trail and the Fraser River Footbridge", time: "A few minutes on foot", how: "Walk west from Reid Street toward the Fraser River. The trail follows the river, and the long wooden footbridge crosses it.", local: "\"Five minutes there. Forty-five minutes back, because you'll meet somebody on the bridge.\"", query: "Fraser River Footbridge Quesnel" },
      { name: "Quesnel & District Museum", time: "About 5 minutes by car", how: "Head south through downtown to LeBourdais Park on Carson Avenue. The museum shares the building with the Visitor Centre.", local: "\"Say hello to Mandy the doll. Then don't tell us if she says hello back.\"", query: "Quesnel and District Museum and Archives" },
      { name: "Bowron Lake Provincial Park", time: "About 2 hours by car", how: "Take Highway 26 east toward Barkerville, then turn onto Bowron Lake Road just before town. Book your canoe circuit ahead with BC Parks.", local: "\"It's a week-long canoe trip. Get a coffee to go. Get two.\"", query: "Bowron Lake Provincial Park" },
      { name: "Prince George or Williams Lake", time: "About 1 hr 30 min each way", how: "Highway 97 runs through town. Go north about 120 km for Prince George, or south about 120 km for Williams Lake.", local: "\"Everyone at the counter has a favourite pit stop on that highway. Ask one person, not the whole room.\"", query: "Highway 97 Quesnel BC" }
    ],

    // Short stories shown on the home page under "Overheard at the counter".
    stories: [
      { line: "“A traveller asked where the highway was. Four locals answered. None agreed. All offered to drive.”", caption: "Directions are free. Accuracy is extra." },
      { line: "“Someone came in to ask the time. They left with two recipes, a fishing tip and a new friend.”", caption: "Nobody here has ever had a quick coffee. We've stopped apologizing." },
      { line: "“The newcomer said they didn't know anyone in town. The room took that personally.”", caption: "Stranger status usually lasts one coffee." },
      { line: "“A simple question about the weather produced seven forecasts and an argument about 1996.”", caption: "Forecast: a 100% chance of conversation." },
      { line: "“One person ordered lunch. Somehow the whole table is now organizing a fundraiser.”", caption: "That's how a lot of good things in this town got started." }
    ],

    // Photographers whose free-licence (Unsplash) photos stand in until Granville's own are added.
    photoCredits: [
      "Nathan Dumlao", "Mae Mu", "Pixzolo Photography", "Shuvro Mojumder", "charlesdeluvio", "Orkun Orcan", "Nima Naseri", "Eiliv Aceron",
      "Suea Sivilaisith", "Asnim Ansari", "Raphael Nogueira", "Jay Wennington", "Maria Klichik", "David Foodphototasty",
      "Rasmus Gundorff Sæderup", "Chris Tweten", "Cliffer Rebelo", "Monika Grabkowska", "Anisa Cakesandbakes", "Hugo Aitken",
      "Daniel Morris", "Diliara Garifullina", "Jarek Ceborski", "Dani", "Fahmi Fakhrudin", "Maddi Bazzocco", "Giancarlo Duarte",
      "Jeremy Yap", "tabitha turner", "Elena Leya", "Katya Azimova", "Pablo Merchán Montes", "Sebastian Coman Photography",
      "Victor Rutka", "Clarissa Carbungco", "Doug Bagg", "Sara Julie", "Jugoslocos", "Fanny Gustafsson", "Jonathan Borba",
      "Tyrone Sanders", "Rhamely", "Luke Tokaryk", "Joseph Gonzalez", "Joyful", "Jessica Kantak Bailey", "Crystal Jo", "James Kern",
      "Brooke Cagle", "Vitaly Gariev", "Zeno Hind", "Toa Heftiba", "Uta Scholl"
    ]
  };
})();
