"""Structured Google Hotels search through SerpApi."""

from __future__ import annotations

import os
from datetime import date
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()

SERPAPI_URL = "https://serpapi.com/search.json"


class HotelSearchError(RuntimeError):
    """Raised when hotel offers cannot be retrieved."""


def _normalize_property(item: dict[str, Any], currency: str) -> dict[str, Any] | None:
    name = item.get("name")
    if not name:
        return None
    nightly = item.get("rate_per_night") or {}
    total = item.get("total_rate") or {}
    prices = item.get("prices") or []
    source = prices[0].get("source") if prices else item.get("source")
    return {
        "id": item.get("property_token") or name,
        "name": name,
        "type": item.get("type") or "hotel",
        "description": item.get("description"),
        "hotel_class": item.get("hotel_class"),
        "rating": item.get("overall_rating"),
        "reviews": item.get("reviews"),
        "nightly_price": nightly.get("extracted_lowest") or item.get("extracted_price"),
        "total_price": total.get("extracted_lowest"),
        "currency": currency.upper(),
        "price_source": source,
        "link": item.get("link"),
        "thumbnail": item.get("thumbnail") or (item.get("images") or [{}])[0].get("thumbnail"),
        "amenities": (item.get("amenities") or [])[:6],
        "free_cancellation": item.get("free_cancellation"),
        "check_in_time": item.get("check_in_time"),
        "check_out_time": item.get("check_out_time"),
    }


def search_hotel_offers(
    *,
    destination: str,
    check_in_date: date,
    check_out_date: date,
    adults: int = 2,
    currency: str = "INR",
    max_results: int = 20,
) -> dict[str, Any]:
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        raise HotelSearchError("SERPAPI_API_KEY is missing from the environment.")
    destination = destination.strip()
    if len(destination) < 2:
        raise ValueError("Destination is required.")
    if check_in_date < date.today():
        raise ValueError("Check-in date cannot be in the past.")
    if check_out_date <= check_in_date:
        raise ValueError("Check-out date must be after check-in date.")
    if not 1 <= adults <= 9:
        raise ValueError("Adults must be between 1 and 9.")

    params = {
        "engine": "google_hotels",
        "api_key": api_key,
        "q": f"hotels in {destination}",
        "check_in_date": check_in_date.isoformat(),
        "check_out_date": check_out_date.isoformat(),
        "adults": adults,
        "children": 0,
        "currency": currency.upper(),
        "gl": "in",
        "hl": "en",
    }
    try:
        response = requests.get(SERPAPI_URL, params=params, timeout=45)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException:
        raise HotelSearchError("The hotel search provider could not be reached.") from None
    except ValueError:
        raise HotelSearchError("The hotel search provider returned invalid data.") from None
    if payload.get("error"):
        raise HotelSearchError(str(payload["error"]))

    hotels = []
    for item in (payload.get("properties") or []) + (payload.get("ads") or []):
        normalized = _normalize_property(item, currency)
        if normalized and normalized["id"] not in {hotel["id"] for hotel in hotels}:
            hotels.append(normalized)
    hotels = hotels[:max_results]
    nights = (check_out_date - check_in_date).days
    return {
        "source": "Google Hotels via SerpApi",
        "currency": currency.upper(),
        "search": {
            "destination": destination,
            "check_in_date": check_in_date.isoformat(),
            "check_out_date": check_out_date.isoformat(),
            "nights": nights,
            "adults": adults,
        },
        "hotels": hotels,
        "hotel_count": len(hotels),
        "disclaimer": "Hotel prices and availability may change on the booking provider's website.",
    }
