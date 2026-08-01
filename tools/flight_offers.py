"""Structured Google Flights offer search through SerpApi."""

from __future__ import annotations

import os
import re
from datetime import date
from typing import Any

import airportsdata
import requests
from dotenv import load_dotenv

load_dotenv()

SERPAPI_URL = "https://serpapi.com/search.json"
AIRPORTS = airportsdata.load("IATA")

PREFERRED_CITY_AIRPORTS = {
    "delhi": "DEL",
    "new delhi": "DEL",
    "mumbai": "BOM",
    "bangalore": "BLR",
    "bengaluru": "BLR",
    "kolkata": "CCU",
    "chennai": "MAA",
    "hyderabad": "HYD",
    "tokyo": "NRT",
    "osaka": "KIX",
    "dubai": "DXB",
    "singapore": "SIN",
    "bangkok": "BKK",
    "london": "LHR",
    "paris": "CDG",
    "new york": "JFK",
}

PREFERRED_COUNTRY_AIRPORTS = {
    "india": "DEL",
    "thailand": "BKK",
    "japan": "NRT",
    "united arab emirates": "DXB",
    "uae": "DXB",
    "singapore": "SIN",
    "malaysia": "KUL",
    "indonesia": "CGK",
    "vietnam": "SGN",
    "south korea": "ICN",
    "korea": "ICN",
    "china": "PEK",
    "nepal": "KTM",
    "qatar": "DOH",
    "turkey": "IST",
    "united kingdom": "LHR",
    "uk": "LHR",
    "france": "CDG",
    "germany": "FRA",
    "italy": "FCO",
    "spain": "MAD",
    "united states": "JFK",
    "usa": "JFK",
    "canada": "YYZ",
    "australia": "SYD",
    "bangladesh": "DAC",
    "sri lanka": "CMB",
}


class FlightSearchError(RuntimeError):
    """Raised when flight offers cannot be retrieved."""


def _normalize_place(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", value.lower())).strip()


def resolve_place_to_iata(value: str, field_name: str) -> str:
    raw_value = value.strip()
    direct_code = raw_value.upper()
    if len(direct_code) == 3 and direct_code.isalpha() and direct_code in AIRPORTS:
        return direct_code

    place = _normalize_place(raw_value)
    if not place:
        raise ValueError(f"{field_name} is required.")
    if place in PREFERRED_CITY_AIRPORTS:
        return PREFERRED_CITY_AIRPORTS[place]
    if place in PREFERRED_COUNTRY_AIRPORTS:
        return PREFERRED_COUNTRY_AIRPORTS[place]

    matches: list[tuple[int, str]] = []
    for iata, airport in AIRPORTS.items():
        city = _normalize_place(str(airport.get("city") or ""))
        name = _normalize_place(str(airport.get("name") or ""))
        score = 0
        if city == place:
            score = 100
        elif name == place:
            score = 95
        elif place in name and len(place) >= 4:
            score = 75
        elif place in city and len(place) >= 4:
            score = 70
        if score and "international" in name:
            score += 10
        if score:
            matches.append((score, iata))

    if not matches:
        raise ValueError(
            f"Could not find an airport for {field_name} '{raw_value}'. "
            "Try a city name or three-letter airport code."
        )
    matches.sort(reverse=True)
    return matches[0][1]


def _normalize_group(group: dict[str, Any], category: str) -> dict[str, Any] | None:
    segments = group.get("flights") or []
    if not segments:
        return None

    first = segments[0]
    last = segments[-1]
    departure = first.get("departure_airport") or {}
    arrival = last.get("arrival_airport") or {}
    layovers = group.get("layovers") or []

    return {
        "id": group.get("departure_token") or group.get("booking_token"),
        "category": category,
        "price": group.get("price"),
        "currency": group.get("currency"),
        "total_duration_minutes": group.get("total_duration"),
        "stops": max(len(segments) - 1, 0),
        "departure": {
            "airport": departure.get("name"),
            "iata": departure.get("id"),
            "time": departure.get("time"),
        },
        "arrival": {
            "airport": arrival.get("name"),
            "iata": arrival.get("id"),
            "time": arrival.get("time"),
        },
        "airlines": list(dict.fromkeys(
            segment.get("airline") for segment in segments if segment.get("airline")
        )),
        "airline_logo": group.get("airline_logo") or first.get("airline_logo"),
        "flight_numbers": [
            segment.get("flight_number")
            for segment in segments
            if segment.get("flight_number")
        ],
        "layover_airports": [
            layover.get("id") for layover in layovers if layover.get("id")
        ],
        "carbon_emissions_grams": (group.get("carbon_emissions") or {}).get(
            "this_flight"
        ),
        "booking_token": group.get("booking_token"),
    }


def _request_serpapi(params: dict[str, Any]) -> dict[str, Any]:
    try:
        response = requests.get(SERPAPI_URL, params=params, timeout=45)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException:
        # SerpApi authenticates through a query parameter. Suppress the original
        # exception because requests may include the credential-bearing URL in it.
        raise FlightSearchError(
            "The flight search provider could not be reached."
        ) from None
    except ValueError:
        raise FlightSearchError(
            "The flight search provider returned invalid data."
        ) from None

    if payload.get("error"):
        raise FlightSearchError(str(payload["error"]))
    return payload


def _extract_offers(
    payload: dict[str, Any], currency: str, max_results: int
) -> list[dict[str, Any]]:
    offers: list[dict[str, Any]] = []
    for key, category in (("best_flights", "best"), ("other_flights", "other")):
        for item in payload.get(key) or []:
            normalized = _normalize_group(item, category)
            if normalized:
                normalized["currency"] = normalized["currency"] or currency.upper()
                offers.append(normalized)
    return offers[:max_results]


def search_flight_offers(
    *,
    origin: str,
    destination: str,
    departure_date: date,
    return_date: date | None = None,
    adults: int = 1,
    travel_class: int = 1,
    currency: str = "INR",
    max_results: int = 20,
) -> dict[str, Any]:
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        raise FlightSearchError("SERPAPI_API_KEY is missing from the environment.")

    origin_code = resolve_place_to_iata(origin, "origin")
    destination_code = resolve_place_to_iata(destination, "destination")
    if origin_code == destination_code:
        raise ValueError("Origin and destination must be different.")
    if departure_date < date.today():
        raise ValueError("Departure date cannot be in the past.")
    if return_date and return_date < departure_date:
        raise ValueError("Return date cannot be before departure date.")
    if not 1 <= adults <= 9:
        raise ValueError("Adults must be between 1 and 9.")
    if travel_class not in {1, 2, 3, 4}:
        raise ValueError("Travel class must be 1, 2, 3, or 4.")

    params: dict[str, Any] = {
        "engine": "google_flights",
        "api_key": api_key,
        "departure_id": origin_code,
        "arrival_id": destination_code,
        "outbound_date": departure_date.isoformat(),
        "type": 1 if return_date else 2,
        "adults": adults,
        "travel_class": travel_class,
        "currency": currency.upper(),
        "gl": "in",
        "hl": "en",
    }
    if return_date:
        params["return_date"] = return_date.isoformat()

    payload = _request_serpapi(params)
    offers = _extract_offers(payload, currency, max_results)
    return {
        "source": "Google Flights via SerpApi",
        "market": "IN",
        "currency": currency.upper(),
        "trip_type": "round_trip" if return_date else "one_way",
        "search": {
            "origin": origin_code,
            "destination": destination_code,
            "departure_date": departure_date.isoformat(),
            "return_date": return_date.isoformat() if return_date else None,
            "adults": adults,
        },
        "offers": offers,
        "offer_count": len(offers),
        "price_insights": payload.get("price_insights"),
        "disclaimer": "Prices are current search results and may change on the booking provider's site.",
    }


def search_return_flight_offers(
    *,
    origin: str,
    destination: str,
    departure_date: date,
    return_date: date,
    departure_token: str,
    adults: int = 1,
    travel_class: int = 1,
    currency: str = "INR",
    max_results: int = 20,
) -> dict[str, Any]:
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        raise FlightSearchError("SERPAPI_API_KEY is missing from the environment.")
    if not departure_token.strip():
        raise ValueError("The selected outbound flight cannot be used to find returns.")

    origin_code = resolve_place_to_iata(origin, "origin")
    destination_code = resolve_place_to_iata(destination, "destination")
    if return_date < departure_date:
        raise ValueError("Return date cannot be before departure date.")

    params: dict[str, Any] = {
        "engine": "google_flights",
        "api_key": api_key,
        "departure_id": origin_code,
        "arrival_id": destination_code,
        "outbound_date": departure_date.isoformat(),
        "return_date": return_date.isoformat(),
        "type": 1,
        "adults": adults,
        "travel_class": travel_class,
        "currency": currency.upper(),
        "gl": "in",
        "hl": "en",
        "departure_token": departure_token,
    }
    payload = _request_serpapi(params)
    offers = _extract_offers(payload, currency, max_results)
    return {
        "source": "Google Flights via SerpApi",
        "currency": currency.upper(),
        "search": {
            "origin": origin_code,
            "destination": destination_code,
            "departure_date": departure_date.isoformat(),
            "return_date": return_date.isoformat(),
            "adults": adults,
        },
        "offers": offers,
        "offer_count": len(offers),
        "disclaimer": "Prices are current round-trip results and may change on the booking provider's site.",
    }
