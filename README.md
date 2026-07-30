# TripMate AI

TripMate AI is a multi-agent travel-planning application built with FastAPI, LangGraph, Groq, PostgreSQL, Tavily, and AviationStack. It accepts a natural-language travel request, gathers flight and hotel information, creates an itinerary, and returns a formatted travel plan.

## Features

- Natural-language trip requests
- Origin and destination airport resolution
- Live flight-status lookup
- Hotel discovery using Tavily search
- AI-generated day-by-day itineraries
- Budget-aware travel recommendations
- PostgreSQL-backed LangGraph checkpoints
- FastAPI-ready backend

## How It Works

The LangGraph workflow currently runs these agents in sequence:

```text
User request
    |
    v
Flight agent
    |
    v
Hotel agent
    |
    v
Itinerary agent
    |
    v
Final response agent
```

1. The flight agent extracts a route and requests live flight data from AviationStack.
2. The hotel agent searches for destination hotel information through Tavily.
3. The itinerary agent combines the available results into a practical schedule.
4. The final agent formats the response into a complete travel plan.

## Technology Stack

- Python 3.11
- FastAPI and Uvicorn
- LangGraph and LangChain
- Groq LLM
- PostgreSQL with `PostgresSaver`
- Tavily Search API
- AviationStack API
- HTML, CSS, and JavaScript

## Project Structure

```text
trip-planner/
|-- app.py
|-- backend.py
|-- test.py
|-- requirements.txt
|-- templates/
|   `-- index.html
|-- static/
|   |-- style.css
|   `-- script.js
`-- tools/
    |-- __init__.py
    |-- flight_tool.py
    `-- tavily_tool.py
```

## Prerequisites

Install the following before running the project:

- Python 3.11
- Conda or another Python environment manager
- PostgreSQL database
- Groq API key
- Tavily API key
- AviationStack API key

## Installation

Clone the repository:

```bash
git clone https://github.com/riieeya/trip-planner.git
cd trip-planner
```

Create and activate a Conda environment:

```bash
conda create -n travel python=3.11 -y
conda activate travel
```

Install the dependencies:

```bash
python -m pip install -r requirements.txt
```

## Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key
TAVILY_API_KEY=your_tavily_api_key
AVIATIONSTACK_API_KEY=your_aviationstack_api_key
DATABASE_URL=your_postgresql_connection_url
DEFAULT_ORIGIN_IATA=DEL
```

Do not commit `.env` or expose API keys publicly. The repository's `.gitignore` excludes `.env` by default.

If your PostgreSQL URL does not contain an SSL setting, the backend automatically adds `sslmode=require`.

## Running the CLI Test

Run:

```bash
python test.py
```

Enter a request when prompted:

```text
Plan a 7-day trip from Delhi to Tokyo including flights, hotels and sightseeing under ₹2 lakh.
```

## Running the Web Application

After implementing the FastAPI routes in `app.py`, start the server with:

```bash
uvicorn app:app --reload
```

Open the application at:

```text
http://127.0.0.1:8000
```

## Example Requests

```text
Plan a 7-day trip from Delhi to Tokyo under ₹2 lakh.
Plan a 5-day trip from Mumbai to Dubai with flights and hotels.
Plan a budget trip from Bengaluru to Bangkok.
Show live flights from DEL to NRT.
```

Explicit city or airport-code routes generally produce more reliable flight searches than country-only requests.

## Current Limitations

- AviationStack's `/v1/flights` endpoint supplies live flight-status information, not complete bookable flight offers.
- Ticket prices, future availability, round trips, and connecting itineraries may be unavailable.
- A country-level destination is currently mapped to one preferred airport.
- Tokyo may require separate searches for Narita (`NRT`) and Haneda (`HND`).
- AI-generated prices and recommendations should be treated as estimates unless a source confirms them.
- Hotel search results may not contain verified current prices.

For production flight search, consider using a flight-offers provider that supports travel dates, fares, passengers, and connecting routes. AviationStack can remain useful for checking the live status of a selected flight.

## Recommended Next Steps

- Add structured request parsing for dates, passengers, budget, origin, and destination
- Integrate a flight-offers API for prices and connecting flights
- Return structured hotel results with source URLs
- Prevent the final model from inventing unavailable data
- Complete the FastAPI endpoint and web interface
- Add route-parser and backend tests

## License

This project does not currently specify a license. Add a `LICENSE` file before distributing or accepting external contributions.
