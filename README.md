# Trip Planner AI

Trip Planner AI is a stateful, domain-specific travel-planning agent built with FastAPI, LangGraph, Llama 3.3 through Groq, SerpApi, and PostgreSQL. It combines current flight and hotel search results, user-controlled selections, deterministic budget calculations, supervised itinerary generation, and an automated review step.

The application is designed to avoid a common problem with basic LLM travel planners: producing convincing but unsupported prices, schedules, hotels, or return-trip details. Live travel data, deterministic calculations, and generative AI are handled as separate responsibilities.

> Trip Planner AI is a comparison and planning prototype. It does not book flights or hotels, process payments, or guarantee final provider prices.

## Features

- Search Google Flights results through SerpApi
- Search Google Hotels results through SerpApi
- Accept city names, country names, or three-letter IATA codes
- Compare flights by best, cheapest, and fastest
- Compare hotels by best value, cheapest, and highest rated
- Select outbound and compatible return flights
- Collapse result lists after a selection is made
- Ground the itinerary in selected flight and hotel information
- Calculate confirmed and estimated costs with deterministic Python
- Ask for clarification when a request lacks a destination or duration
- Review generated itineraries for grounding and consistency
- Allow a maximum of one controlled itinerary revision
- Persist LangGraph checkpoints in PostgreSQL
- Display a safe, user-visible Agent Activity trace
- Export the final itinerary as a PDF
- Responsive desktop and mobile interface
- Detect and communicate Render free-tier wake-up delays

## System Architecture

Flight and hotel searches are user-initiated through dedicated API endpoints. After the user selects the preferred options, those selections are sent into the LangGraph travel workflow.

```text
User interface
      |
      +--> Flight search API --> SerpApi Google Flights
      |
      +--> Hotel search API --> SerpApi Google Hotels
      |
      `--> Selected options + travel request
                         |
                         v
                  Supervisor Agent
                  /              \
          Clarification          Continue
                |                   |
               END                  v
                              Flight grounding
                                     |
                              Hotel grounding
                                     |
                          Deterministic budget
                                     |
                             Itinerary Agent
                                     |
                              Reviewer Agent
                              /             \
                         Approved         Revise once
                              \             /
                               Final Response
                                     |
                                    END
```

## LangGraph Workflow

### Supervisor Agent

Analyses the user request using structured LLM output. A destination and trip duration are treated as essential information.

- Complete request: continue through the planning graph
- Incomplete request: ask one concise clarification question and stop

### Flight Grounding

Cleans and serialises the user's selected outbound and return flight details. Later LLM stages are instructed to treat this block as authoritative factual data.

If no live flight is selected, the workflow uses an explicit `NO_LIVE_OFFER_SELECTED` state and prohibits invented fares, airlines, schedules, stops, or flight numbers.

### Hotel Grounding

Cleans and serialises the selected hotel's name, dates, price, rating, amenities, and other available provider information.

If no hotel is selected, the workflow uses `NO_LIVE_HOTEL_SELECTED` and prohibits invented accommodation details or prices.

### Budget Agent

Uses deterministic Python rather than the LLM for arithmetic. It calculates confirmed travel costs and separate planning estimates.

### Itinerary Agent

Generates a practical day-by-day itinerary using the request, grounded travel information, and fixed budget calculation.

### Reviewer Agent

Checks whether the generated itinerary:

- Introduced unsupported flight or hotel information
- Altered fixed budget figures
- Followed the requested destination and duration
- Included selected outbound and return details
- Marked unavailable travel details as unconfirmed

### Revision Agent

Applies reviewer feedback when required. The revision loop is limited to one attempt to prevent infinite execution, excessive latency, and uncontrolled model calls.

### Final Response Agent

Formats the reviewed plan into a trip summary, flight information, hotel information, day-by-day itinerary, budget breakdown, and recommendations.

## LangGraph State

The workflow passes a typed `TravelState` between nodes. It includes:

- User query and conversation messages
- Selected flight and hotel
- Grounded flight and hotel results
- Budget calculation
- Generated itinerary
- Supervisor decision and clarification status
- Reviewer status and feedback
- Revision count
- LLM-call count
- Agent Activity events

Nodes receive the current state and return partial state updates. Conditional edges inspect the state to choose between clarification and continuation or approval and revision.

## Checkpoint Persistence

LangGraph's `PostgresSaver` stores workflow checkpoints in PostgreSQL under a thread ID. The frontend retains the thread ID and sends it with later travel requests.

This provides thread-level workflow persistence. It is not a permanent user profile or Personal Knowledge Model (PKM).

## Budget Calculation

Confirmed costs:

```text
Selected flight total + selected hotel total = confirmed subtotal
```

If the provider does not return a hotel total:

```text
Nightly hotel rate x number of nights = hotel total
```

Current INR planning assumptions:

- Food: INR 1,500 per adult per day
- Local transport: INR 750 per adult per day
- Activities: INR 1,000 per adult per day
- Miscellaneous: INR 2,500 per adult
- Contingency: 5% of the confirmed subtotal

Visa and travel insurance are excluded because they depend on the destination and traveller.

## Technology Stack

### AI and orchestration

- LangGraph
- LangChain messages and model integration
- Meta Llama 3.3 70B Versatile
- Groq inference API

### Backend

- Python
- FastAPI
- Uvicorn
- Pydantic
- Jinja2

### Travel data

- SerpApi Google Flights results
- SerpApi Google Hotels results
- `airportsdata` for IATA airport information
- Preferred city and country airport mappings

### Persistence

- PostgreSQL
- `psycopg`
- LangGraph `PostgresSaver`

### Frontend

- HTML
- CSS
- JavaScript
- Marked.js for Markdown rendering
- html2pdf.js for PDF export

### Deployment

- Docker
- Render
- Git and GitHub

## Project Structure

```text
trip-planner/
|-- app.py                    # FastAPI routes and request models
|-- backend.py                # LangGraph state, nodes, routing, and persistence
|-- dockerfile                # Render container configuration
|-- render.yaml               # Render service configuration
|-- requirements.txt
|-- templates/
|   `-- index.html
|-- static/
|   |-- style.css
|   `-- script.js
`-- tools/
    |-- flight_offers.py      # Airport resolution and flight searches
    `-- hotel_offers.py       # Structured hotel searches
```

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/` | Serve the web application |
| `GET` | `/health` | Check application and database health |
| `POST` | `/api/flights/search` | Search outbound or one-way flight options |
| `POST` | `/api/flights/returns` | Search compatible return-flight options |
| `POST` | `/api/hotels/search` | Search hotel options |
| `POST` | `/api/travel` | Execute the LangGraph planning workflow |

FastAPI's interactive API documentation is available locally at `/docs`.

## Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://...
GROQ_API_KEY=...
SERPAPI_API_KEY=...
```

Never commit `.env` or expose API keys in screenshots, logs, URLs, or documentation.

## Local Setup

### 1. Create and activate an environment

Using Conda:

```powershell
conda create -n travel python=3.11
conda activate travel
```

### 2. Install dependencies

```powershell
pip install -r requirements.txt
```

### 3. Configure the environment

Add `DATABASE_URL`, `GROQ_API_KEY`, and `SERPAPI_API_KEY` to `.env`.

### 4. Start the application

```powershell
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

## Example Workflow

1. Search for a route such as Delhi to Bangkok.
2. Select an outbound flight.
3. Select a compatible return flight when applicable.
4. Search for and select a hotel.
5. Enter a request such as:

```text
Create a 5-day Bangkok trip for two adults focused on local food,
temples, markets, and relaxed evenings.
```

6. Review the Agent Activity trace and final plan.
7. Download the itinerary as a PDF if required.

To test supervisor clarification:

```text
Plan a trip for me.
```

The workflow should ask for the missing destination and duration rather than inventing them.

## Why SerpApi?

Several travel-data options were considered during development:

- Duffel onboarding was unavailable for the developer's country during registration.
- Amadeus Enterprise onboarding was not practical for a time-limited prototype.
- Earlier sources such as AviationStack and general web search did not provide the complete structured fare and hotel comparisons required by the interface.

SerpApi was selected because it provided accessible, structured Google Flights and Google Hotels search results through one integration.

SerpApi remains a search provider rather than a booking engine. Returned prices and availability may change on the final provider website.

## Deployment on Render

The Docker configuration starts Uvicorn using Render's assigned `PORT` and binds to `0.0.0.0`.

Configure these variables in the Render service environment:

```text
DATABASE_URL
GROQ_API_KEY
SERPAPI_API_KEY
```

The free Render service may sleep after inactivity. The frontend displays a wake-up notice and retries requests when the service returns temporary wake-related errors.

## Current Limitations

- The application compares and plans but does not complete bookings.
- Search prices and availability can change on provider websites.
- Country names map to one preferred airport and may not represent every route.
- Airport mappings are not exhaustive.
- Activity recommendations are generated rather than retrieved from a dedicated activity inventory API.
- Daily expense values are baseline planning assumptions.
- PostgreSQL checkpoints provide thread state, not long-term personal preference memory.
- The application does not currently implement a PKM or Hushh Agent One integration.
- Production wealth, insurance, payment, or booking use cases would require substantially stronger identity, consent, security, audit, and compliance controls.

## Potential Improvements

- Consented user preference profiles
- Dedicated activities and attractions API
- Map-based itinerary and route optimisation
- Booking-provider deep links
- Stronger automated grounding evaluations
- Authentication and user-owned saved trips
- Explicit checkpoint-management controls
- A specialist-agent interface that another personal agent could invoke

## License

This repository does not currently specify a license. Add a `LICENSE` file before distributing the project or accepting external contributions.
