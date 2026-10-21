# VOIDCUT — Agency Starter

A static HTML/CSS/JS prototype for a gaming/internet video-editing agency.

## Run
Open `index.html` directly in a browser, or use any simple local server.

Example:
`python -m http.server 8080`

Then visit `http://localhost:8080/`.

## Team dashboard
Click **Team login**.

Password:
`12b647ç8`

The dashboard uses `localStorage` for demo data. This is NOT secure authentication and must not be used to protect real client information.

## Discord & Stripe Integration Vision

This project is designed to be the front-end and administrative panel for a Discord-based editing agency.
The full flow works like this:

1. **Website (Front-end):** Clients visit the landing page, view services, and click a single public Discord invite link.
2. **Discord Ticket System:** The client joins the Discord server and opens a ticket in a specific channel. A private chat is created where they discuss the quote and provide project details.
3. **Dashboard (Owners):** The Discord bot syncs the ticket information to this panel as a Lead.
4. **Closing & Creating Project:** You review the Lead in the dashboard. Once the deal is closed in the Discord ticket, you can convert the Lead into a Project. The bot then creates the private client category.
5. **Editors & Assignments:** You pick an editor for the project in the dashboard. The bot creates a private editor channel on Discord. Clients and editors NEVER interact directly.
6. **Payments:** You can generate a Stripe payment from the dashboard. The bot will notify the client on Discord with a checkout link. Once paid, the bot updates the channel.

## Important before production
- Connect the dashboard to a real backend (Node.js/Python) and database (PostgreSQL/MongoDB).
- Create a Discord Bot (Discord.js or discord.py) to manage the channels, roles, and invites.
- Integrate the Stripe API for generating checkout sessions and listening to webhooks for successful payments.
- Add real authentication to the dashboard (e.g., NextAuth, JWT, or Firebase).

The visual identity is intentionally dark, sharp and internet/gaming-oriented rather than corporate SaaS.
