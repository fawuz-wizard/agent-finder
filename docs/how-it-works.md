# Agent Finder, explained from the beginning

Written 2026-10-23 for anyone seeing Agent Finder for the first time: Orange's staff, the challenge judges,
a new team member or a developer. No technical knowledge is needed. Every word that may be new is
explained the first time it appears, and every number is explained with the reason it was chosen.

## 1. What Agent Finder is

In Sierra Leone most people get cash in and out of Orange Money through **agents**: small shops and
kiosks that swap phone money for notes and notes for phone money. Fewer than two adults in a hundred have
a payment card, so the agent is the bank branch.

The problem is simple. A customer who needs cash does not know which agent nearby is open and has enough
money to serve them. They walk, find the shop closed or short of cash, and walk again.

Agent Finder is a phone app that answers one question: **"Which agent near me can serve me right now?"**
The customer says what they need and how much. The app shows the nearest agents, how likely each one is
to serve them, the distance, and the way there.

## 2. The people and the words

| Word | What it means |
|---|---|
| **Orange Money** | Orange's mobile money service: money kept on the phone, sent and spent from it |
| **Max it** | Orange's main app in Sierra Leone, where customers use Orange Money and other services |
| **Customer** | Anyone with Orange Money who needs cash |
| **Cash out** | The customer gives phone money to the agent and receives notes |
| **Cash in** | The customer gives notes to the agent and receives phone money |
| **Agent** | A shop registered with Orange to do cash out and cash in |
| **Float** | The phone money an agent holds to serve cash-in customers. Agents also need **cash** (notes) for cash-out customers. Running out of either means a customer is turned away |
| **Aggregator** | A company that manages a group of agents for Orange and tops up their float. In the app it is also called a dealer |
| **Orange's agent file** | The Excel file in which Orange keeps its list of aggregators and agents |
| **SLE** | The Sierra Leonean leone, the currency |

## 3. The three apps

Agent Finder is three apps that share one system:

1. **Agent Finder, for customers.** No account and no sign-up. Open it, choose cash out or cash in, type
   an amount if you like, and see the agents near you. It is designed to sit inside Max it, behind a
   "Find an agent" banner.
2. **The Agent App, for agents.** The agent says whether the shop is open and records the transactions
   they do. They also see how customers see their shop.
3. **The Aggregator App, for aggregators and Orange.** One screen for all the agents an aggregator
   manages: who is open, who needs help, float requests, and reports for Orange.

The Agent App and the Aggregator App are one app. The person signs in with their number, and the system
knows whether they are an agent or an aggregator and opens the right screens.

## 4. A week in the life

1. **Monday.** The aggregator, Kissy Distribution, registers a new agent, Fatmata's Shop at Lumley
   Junction. Kissy places the shop on a map and gets a **one-time code**: a short code that works once,
   used for the first sign-in.
2. Kissy gives Fatmata the code by phone. Fatmata opens the Agent App, enters her number and the code,
   and chooses her own **PIN** (a secret 4 to 6 digit number, like a bank card PIN). From now on she
   signs in with her PIN.
3. Fatmata taps **Open** and serves two customers who want cash out, recording each one in the app.
4. A customer nearby searches for **cash out, SLE 300**. Fatmata's Shop appears with **40%**: she has
   only one day of activity so far.
5. **Thursday.** Fatmata has recorded transactions on four days, and three customers have reported that
   she served them. The same search now shows **80%**, and she is at the top as **Recommended**.
6. Fatmata's own screen says "Cash out: Likely to be served. Cash in: Not done this week", with the advice
   "Record cash ins when you do them, and customers will see you for both."
7. She runs low on float and asks Kissy for a top-up in the app. Kissy approves it and marks it done.
8. At the end of the month Kissy downloads the report for Orange and opens it in Excel.

## 5. What a customer sees, and why

The customer chooses **cash out** or **cash in**, can type an **amount**, and the phone finds where they
are. The app then shows four groups:

| Group | What is in it |
|---|---|
| **Recommended** | The two best agents within 500 metres, each with a line saying why ("Best match for SLE 300 right now") |
| **Results** | Up to eight more agents within 500 metres who are likely to serve |
| **Nearest** | The open agents within 500 metres, closest first (up to 10), including the less likely ones, so the customer can still choose |
| **Further away** | Only when nobody within 500 metres is likely to serve: the two best agents beyond that |

For each agent the customer sees the shop's name and street, the **distance**, a percentage such as
**"80% likely to serve you"**, a plain reason when it helps ("Not seen at this size this week"), how long
ago the information was updated, and two buttons: **Get details** and **Directions** (which opens Google
Maps with the route).

The shop's page adds its opening hours, a call button if the agent allows calls, a photo of the shopfront
if the agent took one, and **Report a visit**: after going, the customer can say whether they were served
and, if not, why. That report helps the next customer.

**What a customer never sees:** how much money an agent has, the agent's float, or any other figure about
money. Only words and the percentage.

## 6. The "likely to serve you" percentage

This is the heart of Agent Finder. It is also called the **activity score**, because it comes from what
the agent actually does, not from what they say.

### 6.1 Why activity and not "how much money is in the shop"

The app cannot see an agent's cash drawer or Orange's records of their balance; Orange has not connected
that, and customers must never see money figures anyway. What the app can see is **activity**: an agent
who records transactions every day is open and working, and an agent who served cash outs of SLE 5,000
this week can very likely serve one of SLE 300 today. So the percentage is built from evidence of work.

### 6.2 The three checks

For every agent and every search, the system adds up points from three checks, in this order:

**Check 1. Is the agent active? Up to 40 points.**
The system counts on how many of the last 7 days the agent recorded at least one transaction of any kind.
Each day is worth 40 ÷ 7, about 5.7 points. Seven days out of seven gives the full 40.
One transaction on a day counts the same as thirty. A small shop that works every day scores as well as
a big one, so the rule does not favour big businesses.

**Check 2. Has the agent done this exact transaction? Up to 35 points.**
Only the type the customer asked for counts (cash out or cash in), and only in the last 7 days. Amounts
are grouped into sizes: up to 500, up to 2,000, up to 5,000, up to 10,000, up to 50,000, and above.
- Done at the customer's size or bigger: **35 points**.
- Done, but only at smaller sizes: **15 points**, and the total can go no higher than **50%**. The
  customer reads "Not seen at this size this week". The system has no evidence either way, so it says so.
- Not done at all this week: **no points**, and the total can go no higher than **35%**. The customer
  reads, for example, "Does cash in; no cash out this week".

**Check 3. What have customers said? From minus 20 to plus 20 points.**
Only visit reports for the same type, in the last 7 days.
- Fewer than 3 reports: **no effect**. One or two opinions are too few to judge an agent by.
- 3 or more: 20 × (served − not served) ÷ (all reports). All served: +20. All not served: −20. Half and
  half: 0. A "served" and a "could not serve" weigh exactly the same.

**Then:** the points are added, rounded to the nearest 5, and kept between **5% and 95%**.

### 6.3 Three worked examples (customer asks for cash out, SLE 300)

| The agent's last 7 days | Points | Shown |
|---|---|---|
| First day, two cash outs of SLE 5,000, no reports | 5.7 + 35 + 0 = 40.7 | **40%** |
| Four days active, cash outs up to SLE 5,000, three customers said "served" | 22.9 + 35 + 20 = 77.9 | **80%** |
| Seven days active, only cash ins, never a cash out | 40 + 0, capped at 35 | **35%**, "Does cash in; no cash out this week" |

### 6.4 The agent's own warning

If an agent taps **Low today** for cash out or cash in, that side can show no more than **35%** for the
rest of the day. **None today** keeps it at **5%**. An agent can lower what customers see, never raise it,
so being honest costs them nothing and protects their reputation.

### 6.5 Who sees the percentage

- **Customers** see it. It is the answer to their question.
- **Agents and aggregators never see it, and never see the points.** They see the same listing in words
  ("Likely to be served", "Less likely yet", "Not done this week", "No activity this week") and one line
  per check with what would raise it ("You worked 4 of the last 7 days. Record every day you work.").
  The figure changes with every customer's request (a different amount gives a different answer), so a
  number on the agent's screen would be out of date the moment it was read. And a published formula
  would invite people to record fake transactions just to score.

## 7. Every number, and why it was chosen

| Number | Where it is used | Why |
|---|---|---|
| **500 metres** | The main search area around the customer | About a six-minute walk. Close enough that the trip is worth it, wide enough to include several shops in a town |
| **20 kilometres** | The furthest the "Further away" group looks | Beyond that an agent is no longer a practical answer |
| **2** | Agents in Recommended | One clear first choice and one back-up, without making the customer read a list |
| **10** | The most agents in a group | Enough to choose from on a phone screen |
| **About 110 metres** | How much the customer's position is rounded before it leaves the phone | Precise enough to measure the walk, not precise enough to identify a home. Nothing is stored against the customer |
| **7 days** | The window for the activity score | Long enough that one quiet day does not punish an agent; short enough that the score reflects this week, not last month |
| **40 / 35 / 20 points** | The three checks | Being open and working matters most; having done this exact transaction comes next; customer reports confirm or correct the picture |
| **Fives (5, 10, 15 … 95)** | How the percentage is shown | The score is an estimate. "80%" is honest; "78.6%" would pretend to be exact |
| **95% at most** | The top of the scale | Nobody can promise a customer certainty; 100% would be a promise the app cannot keep |
| **5% at least** | The bottom of the scale | No activity is not proof an agent cannot serve; it means the app has not seen them work this week |
| **50%** | From here an agent reads "likely" and can be Recommended | Below half, the app should not send a customer there first |
| **3 reports** | The minimum before customer reports count | One upset or one friendly customer should not decide an agent's standing |
| **07:00 to 20:00** | The opening hours an agent starts with | Usual shop hours. Each agent sets their own week, a day off, or "stay open longer". Outside their hours a shop shows as Closed |
| **4 to 6 digits** | The length of a PIN | Easy to remember, like a bank card PIN |
| **5 tries, then 15 minutes** | Wrong PINs before the account pauses | A short PIN is safe only if guessing is slow |
| **30 days** | How long a phone stays signed in | An agent should not have to sign in every morning |
| **60 seconds** | How long an aggregator can see a money figure after asking | Money is shown only when needed, and every look is written down with its reason |
| **3 ratings** | The minimum before a shop's star rating is shown | One rating should not define a shop |
| **1 rating a day** | How often one phone can rate the same shop | Stops one person from flooding a shop's rating |

## 8. How a shop gets onto the customer's map

A shop appears to customers only when all four of these are true:

1. **It has a place on the map.** Orange's file lists addresses as text, without map coordinates, so
   each shop is placed once. The agent can do it standing in the shop ("Use my location" takes the
   phone's position), or the aggregator can do it while registering the agent, by using their own
   position, dragging the map under the pin, or typing the coordinates.
2. **The place is confirmed by the aggregator.** An agent's own pin waits for the aggregator, who knows
   where the shop is, to confirm it. A pin placed by the aggregator counts as confirmed. This stops a
   shop from being moved without anyone noticing.
3. **Orange marks the agent as active.**
4. **The aggregator has checked the agent against Orange's record** (a tick when registering).

Even then, the shop shows only during its opening hours and when the agent has not set it to Away.
Places outside Sierra Leone are refused. Every pin and every confirmation is recorded with the name of
the person who did it.

## 9. What the agent and the aggregator can do

**The agent**
- Tap **Open**, **Away** (hidden from customers) or **Closed**.
- **Record a transaction:** cash out or cash in, and the amount. For a cash in, the customer's number,
  of which the app keeps only the last three digits and a scrambled code that cannot be read back. Each
  record shows the agent an estimated commission.
- Tap **Low today** when cash or float is running short.
- Set **opening hours** for the week, change today only, or stay open a little longer.
- See **How customers see you**, in words, with what raises it.
- Ask the aggregator for **float**, and follow the request.
- Read what customers said in their visit reports, without who said it.
- Place the shop on the map, add a photo, choose whether customers may call, change the PIN.

**The aggregator**
- See all their agents: how many are open, away, closed, or need attention.
- Register a new agent, place the shop, and give the one-time code. Issue a new code if an agent forgets
  their PIN.
- Confirm shops' places on the map.
- Handle **float requests**. A request is first waiting, then approved or declined (a reason is
  required to decline), then marked done. An agent can cancel while it waits. Nothing disappears
  without someone deciding.
- See **warnings**: agents customers say could not serve them, and agents who will probably run short by
  tomorrow. These are estimates to help them act. The app never changes an agent's status by itself.
- See money figures only on request, for 60 seconds, recorded with the reason.
- Download the **Global Report** and record tables for Orange, which open in Excel.

## 10. Trust, privacy and safety

- **Customers have no account.** Their position is rounded on the phone and never stored against them.
  Visit reports are anonymous.
- **No money figures for customers.** Words and a percentage only.
- **No percentage for agents and aggregators.** Words only.
- **Agents' PINs are never stored as written.** They are kept as a scrambled code that is slow to try
  guesses against.
- **The wrong person sees nothing.** If someone asks for something their role may not see, the system
  answers "not found", so it does not even confirm that the thing exists.
- **People decide, not the app.** Every action by an aggregator is a person's choice, recorded with their
  name. The app estimates and warns; it never switches an agent off on its own.
- **Orange's agent data stays private.** It is never put in the public code store.

## 11. The technology, in plain words

### 11.1 The picture

```
  CUSTOMERS             AGENTS                AGGREGATORS
  Agent Finder          Agent App             Aggregator App
  (phone, Max it)       (Android phone)       (phone or laptop)
       |                     |                      |
       +---------------------+----------------------+
                             |   the internet (secure HTTPS)
                             v
            +---------------------------------------+
            |              THE SERVER               |
            |  receives every request, applies the  |
            |  rules (the percentage, who may see   |
            |  what), and sends back the answer     |
            +-------------------+-------------------+
                                |
                                v
            +---------------------------------------+
            |             THE DATABASE              |
            |  agents, shops' places, transactions, |
            |  visit reports, float requests, logs  |
            +---------------------------------------+
                                ^
                                |  read once, then again when Orange updates it
                     Orange's Excel file of agents
```

The phone apps only show what the server sends them. Every decision is made on the server. That way a
customer can never be shown something the rules did not allow, and the rules can change without anyone
updating their phone.

### 11.2 Each tool, what it is, and why it was chosen

| Part | Tool | What it is | Why |
|---|---|---|---|
| The screens | **React** | A widely used toolkit, made by Meta, for building app screens | One of the most used tools for app screens, so many developers can maintain it |
| | **TypeScript** | The main language of web apps, with extra checks that catch mistakes before the app runs | Fewer errors reaching users |
| | **Tailwind** and the **Orange design system** | A way of styling screens, set to Orange's official colours, type and spacing | The app looks like an Orange product and follows the challenge's graphic standards |
| | **Vite** | The tool that turns the code into the finished app | Fast to build and test |
| The Android app | **Capacitor** | Wraps the same app so it installs on Android like any other app | One app to build instead of two |
| The server | **Python** with **FastAPI** | A popular programming language, and a toolkit for servers that answer apps' requests | Clear, fast, and documents itself, so a new developer can see every request the server accepts |
| The database | **SQLite** on a laptop; **PostgreSQL** with **PostGIS** on the live system | SQLite is a database in a single file, good for the demo. PostgreSQL is a free, widely used database for live services; PostGIS adds map calculations to it | Simple for the demo, strong and free for the live system |
| Hosting | **AWS** (Amazon Web Services) | Rented servers on the internet, where the live system will run | Reliable and widely used; the team's AWS account holder sets it up |
| Maps | **OpenStreetMap** maps, **Google Maps** for directions | Free world maps for placing shops; Google Maps opens the walking route | No cost for the pilot. For the pilot's traffic a paid map service will replace the free map servers |
| Keeping the code | **GitHub** | An online store for code, with every change kept and dated | Nothing is lost; any change can be checked or undone |
| Automatic checks | **Tests** (pytest for the server, Vitest for the screens) and **GitHub Actions** | Small programs that check the rules every time the code changes; GitHub Actions also builds the Android app | Today 176 checks on the server and 163 on the screens. A change that breaks a rule is caught before anyone uses it |

### 11.3 The demo and the live system

- **The demo** runs entirely inside the browser, with made-up shops and accounts and no server. It
  follows the same rules as the live system, so it is safe to show anyone. Its data resets when the page
  is refreshed.
- **The live system** uses the real server and database. Agents' records and transactions are kept, and
  what an agent records is what customers see.

## 12. What can come next with Orange

| If Orange provides | Then |
|---|---|
| A connection to Orange Money's transaction records | Agents no longer need to record transactions by hand; the activity score uses Orange's records with the same rule |
| The transaction text messages agents already receive | Each message becomes a recorded transaction automatically |
| A place for Agent Finder inside Max it | Customers find agents without installing anything |
| An updated agent file | The system reads it again; it keeps the shops' places, photos and status already set in the app |

The server has one connection point prepared for Orange's records, so when Orange is ready, that part
changes and nothing else does.

## 13. In short

- Customers see who can serve them, how likely, how far, and the way there. No money figures.
- The percentage comes from activity in the last 7 days: days worked, the exact transaction done,
  and what customers said. Same rule for everyone, between 5% and 95%.
- Agents keep it true with one tap and by recording their work; they see how customers see them, in
  words.
- Aggregators see their whole network, confirm shops' places, handle float, and give Orange the
  reports it asked for.
- People decide; the app informs. Privacy is built in from the customer's location to the agent's PIN.
