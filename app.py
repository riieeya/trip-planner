from datetime import date
from pathlib import Path
import traceback

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from backend import check_database_health, run_travel_agent
from tools.flight_offers import (
    FlightSearchError,
    search_flight_offers,
    search_return_flight_offers,
)
from tools.hotel_offers import HotelSearchError, search_hotel_offers

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="Trip Planner AI",
    description="LangGraph Multi-Agent Travel Planner with FastAPI Frontend",
    version="1.0.0",
)

app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static",
)

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


class TravelRequest(BaseModel):
    message: str
    thread_id: str | None = None
    selected_flight: dict | None = None
    selected_hotel: dict | None = None


class FlightSearchRequest(BaseModel):
    origin: str = Field(min_length=2, max_length=80)
    destination: str = Field(min_length=2, max_length=80)
    departure_date: date
    return_date: date | None = None
    adults: int = Field(default=1, ge=1, le=9)
    travel_class: int = Field(default=1, ge=1, le=4)
    currency: str = Field(default="INR", min_length=3, max_length=3)


class ReturnFlightSearchRequest(FlightSearchRequest):
    return_date: date
    departure_token: str = Field(min_length=1, max_length=10000)


class HotelSearchRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=100)
    check_in_date: date
    check_out_date: date
    adults: int = Field(default=2, ge=1, le=9)
    currency: str = Field(default="INR", min_length=3, max_length=3)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={},
    )


@app.post("/api/travel")
async def travel_planner(request_data: TravelRequest):
    try:
        user_message = request_data.message.strip()

        if not user_message:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Message cannot be empty.",
                },
            )

        result = run_travel_agent(
            user_input=user_message,
            thread_id=request_data.thread_id,
            selected_flight=request_data.selected_flight,
            selected_hotel=request_data.selected_hotel,
        )

        return JSONResponse(
            content={
                "success": True,
                "thread_id": result["thread_id"],
                "answer": result["answer"],
                "flight_results": result["flight_results"],
                "hotel_results": result["hotel_results"],
                "itinerary": result["itinerary"],
                "llm_calls": result["llm_calls"],
            }
        )
    except Exception as exc:
        print("ERROR:", exc)
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(exc)},
        )


@app.post("/api/flights/search")
async def flight_search(request_data: FlightSearchRequest):
    try:
        result = search_flight_offers(
            origin=request_data.origin,
            destination=request_data.destination,
            departure_date=request_data.departure_date,
            return_date=request_data.return_date,
            adults=request_data.adults,
            travel_class=request_data.travel_class,
            currency=request_data.currency,
        )
        return JSONResponse(content={"success": True, **result})
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": str(exc)},
        )
    except FlightSearchError as exc:
        return JSONResponse(
            status_code=502,
            content={"success": False, "error": str(exc)},
        )


@app.post("/api/flights/returns")
async def return_flight_search(request_data: ReturnFlightSearchRequest):
    try:
        result = search_return_flight_offers(
            origin=request_data.origin,
            destination=request_data.destination,
            departure_date=request_data.departure_date,
            return_date=request_data.return_date,
            departure_token=request_data.departure_token,
            adults=request_data.adults,
            travel_class=request_data.travel_class,
            currency=request_data.currency,
        )
        return JSONResponse(content={"success": True, **result})
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": str(exc)},
        )
    except FlightSearchError as exc:
        return JSONResponse(
            status_code=502,
            content={"success": False, "error": str(exc)},
        )


@app.post("/api/hotels/search")
async def hotel_search(request_data: HotelSearchRequest):
    try:
        result = search_hotel_offers(
            destination=request_data.destination,
            check_in_date=request_data.check_in_date,
            check_out_date=request_data.check_out_date,
            adults=request_data.adults,
            currency=request_data.currency,
        )
        return JSONResponse(content={"success": True, **result})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"success": False, "error": str(exc)})
    except HotelSearchError as exc:
        return JSONResponse(status_code=502, content={"success": False, "error": str(exc)})


@app.get("/health")
async def health_check():
    database_ok = check_database_health()
    return JSONResponse(
        status_code=200 if database_ok else 503,
        content={
            "status": "ok" if database_ok else "degraded",
            "database": "connected" if database_ok else "unavailable",
        },
    )


@app.get("/favicon.ico")
async def favicon():
    return JSONResponse(content={})


if __name__ == "__main__":
    import os

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "false").lower() == "true",
    )
