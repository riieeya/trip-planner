let currentThreadId = localStorage.getItem("travel_thread_id") || null;
let latestAnswerMarkdown = "";
let currentFlightOffers = [];
let currentFlightSearch = null;
let selectedFlightOffer = null;
let currentReturnOffers = [];
let selectedReturnOffer = null;
let currentHotels = [];
let currentHotelSearch = null;
let selectedHotel = null;

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function setWakeNotice(visible) {
    document.getElementById("serverWakeNotice").classList.toggle("hidden", !visible);
}

async function fetchWithWakeRetry(url, options, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetch(url, options);
            if (![503, 504].includes(response.status) || attempt === attempts) {
                setWakeNotice(false);
                return response;
            }
            lastError = new Error("The free server is still waking up.");
        } catch (error) {
            lastError = error;
            if (attempt === attempts) break;
        }
        setWakeNotice(true);
        await wait(attempt * 5000);
    }
    setWakeNotice(false);
    throw lastError || new Error("The server could not be reached. Please try again.");
}

function setPrompt(text) {
    document.getElementById("userInput").value = text;
}

function setLoading(isLoading) {
    const sendBtn = document.getElementById("sendBtn");
    document.getElementById("btnText").classList.toggle("hidden", isLoading);
    document.getElementById("btnLoader").classList.toggle("hidden", !isLoading);
    sendBtn.disabled = isLoading;
}

function showError(message) {
    const errorBox = document.getElementById("errorBox");
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
}

function hideError() {
    const errorBox = document.getElementById("errorBox");
    errorBox.classList.add("hidden");
    errorBox.textContent = "";
}

function setFlightLoading(isLoading) {
    document.getElementById("flightSearchBtn").disabled = isLoading;
    document.getElementById("flightSearchBtnText").classList.toggle("hidden", isLoading);
    document.getElementById("flightSearchLoader").classList.toggle("hidden", !isLoading);
}

function showFlightError(message) {
    const box = document.getElementById("flightErrorBox");
    box.textContent = message;
    box.classList.remove("hidden");
}

function hideFlightError() {
    const box = document.getElementById("flightErrorBox");
    box.textContent = "";
    box.classList.add("hidden");
}

function setHotelLoading(isLoading) {
    document.getElementById("hotelSearchBtn").disabled = isLoading;
    document.getElementById("hotelSearchBtnText").classList.toggle("hidden", isLoading);
    document.getElementById("hotelSearchLoader").classList.toggle("hidden", !isLoading);
}

function showHotelError(message) {
    const box = document.getElementById("hotelErrorBox");
    box.textContent = message;
    box.classList.remove("hidden");
}

function hideHotelError() {
    const box = document.getElementById("hotelErrorBox");
    box.textContent = "";
    box.classList.add("hidden");
}

function formatDuration(totalMinutes) {
    if (!Number.isFinite(totalMinutes)) return "Duration unavailable";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function formatFlightTime(value) {
    if (!value) return "Time unavailable";
    const parsed = new Date(value.replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit"
    }).format(parsed);
}

function formatPrice(price, currency) {
    if (!Number.isFinite(price)) return "Price unavailable";
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency || "INR",
        maximumFractionDigits: 0
    }).format(price);
}

function getSortedOffers(sortMode) {
    const offers = [...currentFlightOffers];
    if (sortMode === "cheapest") {
        return offers.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    }
    if (sortMode === "fastest") {
        return offers.sort((a, b) =>
            (a.total_duration_minutes ?? Infinity) - (b.total_duration_minutes ?? Infinity)
        );
    }
    return offers.sort((a, b) => {
        if (a.category !== b.category) return a.category === "best" ? -1 : 1;
        return (a.price ?? Infinity) - (b.price ?? Infinity);
    });
}

function renderFlightCards(sortMode = "best") {
    const container = document.getElementById("flightCards");
    const offers = selectedFlightOffer ? [selectedFlightOffer] : getSortedOffers(sortMode);

    if (!offers.length) {
        container.innerHTML = `<div class="empty-flights"><h3>No flights found</h3><p>Try another date or nearby airport.</p></div>`;
        return;
    }

    container.innerHTML = offers.map((offer, index) => {
        const airlineNames = offer.airlines?.join(", ") || "Airline unavailable";
        const flightNumbers = offer.flight_numbers?.join(" · ") || "Flight number unavailable";
        const stopText = offer.stops === 0 ? "Nonstop" : `${offer.stops} stop${offer.stops === 1 ? "" : "s"}`;
        const layoverText = offer.layover_airports?.length ? ` via ${offer.layover_airports.join(", ")}` : "";
        const priceLabel = currentFlightSearch?.return_date ? "Round-trip price" : "One-way price";
        const badge = selectedFlightOffer ? "Selected" : sortMode === "fastest" ? "Fastest" : sortMode === "cheapest" ? "Cheapest" : "Best option";

        const isSelected = selectedFlightOffer?.id
            ? selectedFlightOffer.id === offer.id
            : selectedFlightOffer === offer;

        return `
            <article class="flight-card ${isSelected ? "selected" : ""}">
                <div class="flight-card-airline">
                    ${offer.airline_logo ? `<img src="${offer.airline_logo}" alt="" loading="lazy">` : ""}
                    <div>
                        <p class="airline-name">${airlineNames}</p>
                        <p class="flight-number">${flightNumbers}</p>
                    </div>
                    ${index === 0 ? `<span class="result-badge">${badge}</span>` : ""}
                </div>
                <div class="flight-route">
                    <div class="route-point">
                        <strong>${offer.departure?.iata || "—"}</strong>
                        <span>${formatFlightTime(offer.departure?.time)}</span>
                    </div>
                    <div class="route-line">
                        <span>${formatDuration(offer.total_duration_minutes)}</span>
                        <div><i></i><b>✈</b><i></i></div>
                        <span>${stopText}${layoverText}</span>
                    </div>
                    <div class="route-point route-arrival">
                        <strong>${offer.arrival?.iata || "—"}</strong>
                        <span>${formatFlightTime(offer.arrival?.time)}</span>
                    </div>
                </div>
                <div class="flight-price">
                    <span>${priceLabel}</span>
                    <strong>${formatPrice(offer.price, offer.currency)}</strong>
                    <small>for ${currentFlightSearch?.adults || 1} adult${currentFlightSearch?.adults === 1 ? "" : "s"}</small>
                    <button class="select-flight-btn" type="button" data-offer-index="${currentFlightOffers.indexOf(offer)}">
                        ${isSelected ? "Change outbound" : "Select flight"}
                    </button>
                </div>
            </article>
        `;
    }).join("");

    container.querySelectorAll(".select-flight-btn").forEach(button => {
        button.addEventListener("click", async () => {
            const chosen = currentFlightOffers[Number(button.dataset.offerIndex)];
            const changingSelection = selectedFlightOffer && (
                selectedFlightOffer.id ? selectedFlightOffer.id === chosen.id : selectedFlightOffer === chosen
            );
            if (changingSelection) {
                selectedFlightOffer = null;
                selectedReturnOffer = null;
                currentReturnOffers = [];
                document.getElementById("returnFlightSection").classList.add("hidden");
                renderFlightCards(sortMode);
                updateSelectedFlightNotice();
                return;
            }
            selectedFlightOffer = chosen;
            selectedReturnOffer = null;
            renderFlightCards(sortMode);
            updateSelectedFlightNotice();
            if (currentFlightSearch?.return_date) {
                await loadReturnFlights(selectedFlightOffer);
            } else {
                document.getElementById("returnFlightSection").classList.add("hidden");
            }
        });
    });
}

function renderReturnFlightCards() {
    const container = document.getElementById("returnFlightCards");
    if (!currentReturnOffers.length) {
        container.innerHTML = `<div class="empty-flights"><h3>No return flights found</h3><p>Choose another outbound flight or search different dates.</p></div>`;
        return;
    }

    const visibleReturns = selectedReturnOffer ? [selectedReturnOffer] : currentReturnOffers;
    container.innerHTML = visibleReturns.map(offer => {
        const index = currentReturnOffers.indexOf(offer);
        const isSelected = selectedReturnOffer?.id
            ? selectedReturnOffer.id === offer.id
            : selectedReturnOffer === offer;
        const airlineNames = offer.airlines?.join(", ") || "Airline unavailable";
        const flightNumbers = offer.flight_numbers?.join(" · ") || "Flight number unavailable";
        const stopText = offer.stops === 0 ? "Nonstop" : `${offer.stops} stop${offer.stops === 1 ? "" : "s"}`;
        const layoverText = offer.layover_airports?.length ? ` via ${offer.layover_airports.join(", ")}` : "";

        return `
            <article class="flight-card ${isSelected ? "selected" : ""}">
                <div class="flight-card-airline">
                    ${offer.airline_logo ? `<img src="${offer.airline_logo}" alt="" loading="lazy">` : ""}
                    <div><p class="airline-name">${airlineNames}</p><p class="flight-number">${flightNumbers}</p></div>
                </div>
                <div class="flight-route">
                    <div class="route-point"><strong>${offer.departure?.iata || "—"}</strong><span>${formatFlightTime(offer.departure?.time)}</span></div>
                    <div class="route-line"><span>${formatDuration(offer.total_duration_minutes)}</span><div><i></i><b>✈</b><i></i></div><span>${stopText}${layoverText}</span></div>
                    <div class="route-point route-arrival"><strong>${offer.arrival?.iata || "—"}</strong><span>${formatFlightTime(offer.arrival?.time)}</span></div>
                </div>
                <div class="flight-price">
                    <span>Total round-trip price</span>
                    <strong>${formatPrice(offer.price, offer.currency)}</strong>
                    <small>for ${currentFlightSearch?.adults || 1} adult${currentFlightSearch?.adults === 1 ? "" : "s"}</small>
                    <button class="select-return-btn select-flight-btn" type="button" data-return-index="${index}">${isSelected ? "Change return" : "Select return"}</button>
                </div>
            </article>
        `;
    }).join("");

    container.querySelectorAll(".select-return-btn").forEach(button => {
        button.addEventListener("click", () => {
            const chosen = currentReturnOffers[Number(button.dataset.returnIndex)];
            const changingSelection = selectedReturnOffer && (
                selectedReturnOffer.id ? selectedReturnOffer.id === chosen.id : selectedReturnOffer === chosen
            );
            selectedReturnOffer = changingSelection ? null : chosen;
            renderReturnFlightCards();
            updateSelectedFlightNotice();
        });
    });
}

async function loadReturnFlights(outboundOffer) {
    const section = document.getElementById("returnFlightSection");
    const loader = document.getElementById("returnFlightLoader");
    const container = document.getElementById("returnFlightCards");
    section.classList.remove("hidden");
    loader.classList.remove("hidden");
    container.innerHTML = "";
    currentReturnOffers = [];

    try {
        if (!outboundOffer?.id) throw new Error("This outbound option has no return-search token. Please choose another flight.");
        const response = await fetchWithWakeRetry("/api/flights/returns", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                ...currentFlightSearch,
                travel_class: Number(document.getElementById("flightTravelClass").value),
                currency: "INR",
                departure_token: outboundOffer.id
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Return flight search failed.");
        currentReturnOffers = data.offers || [];
        document.getElementById("returnFlightTitle").textContent = `${data.search.destination} to ${data.search.origin}`;
        document.getElementById("returnFlightMeta").textContent = `${data.offer_count} return options · Select one to complete your round trip`;
        renderReturnFlightCards();
    } catch (error) {
        container.innerHTML = `<div class="empty-flights"><h3>Could not load return flights</h3><p>${error.message}</p></div>`;
        showFlightError(error.message);
    } finally {
        loader.classList.add("hidden");
    }
}

function updateSelectedFlightNotice() {
    const notice = document.getElementById("selectedFlightNotice");
    const summary = document.getElementById("flightSummaryText");
    if (!selectedFlightOffer) {
        summary.textContent = "Not selected";
        notice.textContent = "No live flight selected. The AI will not estimate or invent a fare.";
        notice.classList.remove("has-selection");
        return;
    }

    const airline = selectedFlightOffer.airlines?.join(", ") || "Selected airline";
    if (currentFlightSearch?.return_date && !selectedReturnOffer) {
        summary.textContent = "Choose return flight";
        notice.textContent = `${airline} outbound selected. Now select a return flight to complete the round trip.`;
        notice.classList.remove("has-selection");
        return;
    }

    const finalOffer = selectedReturnOffer || selectedFlightOffer;
    const price = formatPrice(finalOffer.price, finalOffer.currency);
    summary.textContent = `${currentFlightSearch?.origin} → ${currentFlightSearch?.destination} · ${price}`;
    notice.textContent = currentFlightSearch?.return_date
        ? `Round trip selected at ${price}. Both flight legs will ground your itinerary.`
        : `${airline} selected at ${price}. This live offer will ground your itinerary.`;
    notice.classList.add("has-selection");
}

async function searchFlights(event) {
    event.preventDefault();
    hideFlightError();

    const request = {
        origin: document.getElementById("flightOrigin").value.trim().toUpperCase(),
        destination: document.getElementById("flightDestination").value.trim().toUpperCase(),
        departure_date: document.getElementById("flightDepartureDate").value,
        return_date: document.getElementById("flightReturnDate").value || null,
        adults: Number(document.getElementById("flightAdults").value),
        travel_class: Number(document.getElementById("flightTravelClass").value),
        currency: "INR"
    };

    if (request.return_date && request.return_date < request.departure_date) {
        showFlightError("Return date cannot be before the departure date.");
        return;
    }

    setFlightLoading(true);
    try {
        const response = await fetchWithWakeRetry("/api/flights/search", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(request)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Flight search failed.");

        currentFlightOffers = data.offers || [];
        currentFlightSearch = data.search;
        document.getElementById("hotelDestination").value = document.getElementById("flightDestination").value.trim();
        document.getElementById("hotelCheckIn").value = data.search.departure_date || "";
        document.getElementById("hotelCheckOut").value = data.search.return_date || "";
        document.getElementById("hotelCheckOut").min = data.search.departure_date || today;
        selectedFlightOffer = null;
        currentReturnOffers = [];
        selectedReturnOffer = null;
        document.getElementById("returnFlightSection").classList.add("hidden");
        updateSelectedFlightNotice();
        document.getElementById("flightResultsTitle").textContent = `${data.search.origin} to ${data.search.destination}`;
        document.getElementById("flightResultsMeta").textContent = `${data.offer_count} options · ${data.trip_type === "round_trip" ? "Round trip" : "One way"} · ${data.currency}`;
        document.getElementById("flightDisclaimer").textContent = data.disclaimer;
        document.querySelectorAll(".sort-btn").forEach(button =>
            button.classList.toggle("active", button.dataset.sort === "best")
        );
        renderFlightCards("best");
        const section = document.getElementById("flightResultsSection");
        section.classList.remove("hidden");
        section.scrollIntoView({behavior: "smooth", block: "start"});
    } catch (error) {
        showFlightError(error.message);
    } finally {
        setFlightLoading(false);
    }
}

function getSortedHotels(mode) {
    const hotels = [...currentHotels];
    if (mode === "cheapest") return hotels.sort((a, b) => (a.nightly_price ?? Infinity) - (b.nightly_price ?? Infinity));
    if (mode === "rating") return hotels.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    return hotels.sort((a, b) => {
        const score = hotel => (hotel.rating || 0) * 20 - (hotel.nightly_price || 999999) / 1000;
        return score(b) - score(a);
    });
}

function renderHotelCards(mode = "best") {
    const container = document.getElementById("hotelCards");
    const hotels = selectedHotel ? [selectedHotel] : getSortedHotels(mode);
    if (!hotels.length) {
        container.innerHTML = `<div class="empty-flights"><h3>No hotels found</h3><p>Try another destination or different dates.</p></div>`;
        return;
    }
    container.innerHTML = hotels.map(hotel => {
        const index = currentHotels.indexOf(hotel);
        const selected = selectedHotel?.id === hotel.id;
        const rating = Number.isFinite(hotel.rating) ? `★ ${hotel.rating} (${hotel.reviews || 0} reviews)` : "Rating unavailable";
        const amenities = hotel.amenities?.slice(0, 3).join(" · ") || "Amenities unavailable";
        return `<article class="hotel-card ${selected ? "selected" : ""}">
            ${hotel.thumbnail ? `<img class="hotel-image" src="${hotel.thumbnail}" alt="" loading="lazy">` : `<div class="hotel-image"></div>`}
            <div class="hotel-card-body">
                <h3>${hotel.name}</h3><p class="hotel-rating">${rating}</p><p class="hotel-amenities">${amenities}</p>
                <div class="hotel-price-row"><div><strong>${formatPrice(hotel.nightly_price, hotel.currency)}</strong><small>per night${hotel.price_source ? ` · ${hotel.price_source}` : ""}</small></div></div>
                <button class="select-hotel-btn select-flight-btn" type="button" data-hotel-index="${index}">${selected ? "Change hotel" : "Select hotel"}</button>
            </div>
        </article>`;
    }).join("");
    container.querySelectorAll(".select-hotel-btn").forEach(button => button.addEventListener("click", () => {
        const chosen = currentHotels[Number(button.dataset.hotelIndex)];
        selectedHotel = selectedHotel?.id === chosen.id ? null : chosen;
        renderHotelCards(mode);
        updateSelectedHotelNotice();
    }));
}

function updateSelectedHotelNotice() {
    const notice = document.getElementById("selectedHotelNotice");
    const summary = document.getElementById("hotelSummaryText");
    if (!selectedHotel) {
        summary.textContent = "Not selected";
        notice.textContent = "No live hotel selected. The AI will not estimate or invent accommodation costs.";
        notice.classList.remove("has-selection");
        return;
    }
    summary.textContent = `${selectedHotel.name} · ${formatPrice(selectedHotel.nightly_price, selectedHotel.currency)}/night`;
    notice.textContent = `${selectedHotel.name} selected at ${formatPrice(selectedHotel.nightly_price, selectedHotel.currency)} per night. This sourced result will ground your itinerary.`;
    notice.classList.add("has-selection");
}

function buildFlightComparison() {
    if (!selectedFlightOffer) return {};
    const finalOffer = selectedReturnOffer || selectedFlightOffer;
    const comparisonOffers = selectedReturnOffer ? currentReturnOffers : currentFlightOffers;
    const prices = comparisonOffers.map(offer => offer.price).filter(Number.isFinite);
    const durations = comparisonOffers.map(offer => offer.total_duration_minutes).filter(Number.isFinite);
    const lowestPrice = prices.length ? Math.min(...prices) : null;
    const fastestDuration = durations.length ? Math.min(...durations) : null;
    return {
        selected_total_price: finalOffer.price,
        lowest_available_total_price: lowestPrice,
        selected_is_cheapest: Number.isFinite(finalOffer.price) && finalOffer.price === lowestPrice,
        selected_outbound_duration_minutes: selectedFlightOffer.total_duration_minutes,
        selected_return_duration_minutes: selectedReturnOffer?.total_duration_minutes || null,
        selected_leg_is_fastest: Number.isFinite(finalOffer.total_duration_minutes) && finalOffer.total_duration_minutes === fastestDuration,
        comparison_scope: selectedReturnOffer ? "return options for the selected outbound" : "displayed one-way options"
    };
}

function buildHotelComparison() {
    if (!selectedHotel) return {};
    const prices = currentHotels.map(hotel => hotel.nightly_price).filter(Number.isFinite);
    const ratings = currentHotels.map(hotel => hotel.rating).filter(Number.isFinite);
    const lowestPrice = prices.length ? Math.min(...prices) : null;
    const highestRating = ratings.length ? Math.max(...ratings) : null;
    return {
        selected_nightly_price: selectedHotel.nightly_price,
        lowest_available_nightly_price: lowestPrice,
        selected_is_cheapest: Number.isFinite(selectedHotel.nightly_price) && selectedHotel.nightly_price === lowestPrice,
        selected_rating: selectedHotel.rating,
        highest_available_rating: highestRating,
        selected_is_highest_rated: Number.isFinite(selectedHotel.rating) && selectedHotel.rating === highestRating
    };
}

async function searchHotels(event) {
    event.preventDefault();
    hideHotelError();
    const request = {
        destination: document.getElementById("hotelDestination").value.trim(),
        check_in_date: document.getElementById("hotelCheckIn").value,
        check_out_date: document.getElementById("hotelCheckOut").value,
        adults: Number(document.getElementById("hotelAdults").value),
        currency: "INR"
    };
    if (request.check_out_date <= request.check_in_date) {
        showHotelError("Check-out date must be after check-in date.");
        return;
    }
    setHotelLoading(true);
    try {
        const response = await fetchWithWakeRetry("/api/hotels/search", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request)});
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Hotel search failed.");
        currentHotels = data.hotels || [];
        currentHotelSearch = data.search;
        selectedHotel = null;
        updateSelectedHotelNotice();
        document.getElementById("hotelResultsTitle").textContent = `Hotels in ${data.search.destination}`;
        document.getElementById("hotelResultsMeta").textContent = `${data.hotel_count} options · ${data.search.nights} nights · ${data.currency}`;
        document.getElementById("hotelDisclaimer").textContent = data.disclaimer;
        document.querySelectorAll(".hotel-sort-btn").forEach(button => button.classList.toggle("active", button.dataset.hotelSort === "best"));
        renderHotelCards("best");
        const section = document.getElementById("hotelResultsSection");
        section.classList.remove("hidden");
        section.scrollIntoView({behavior: "smooth", block: "start"});
    } catch (error) {
        showHotelError(error.message);
    } finally {
        setHotelLoading(false);
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    })[character]);
}

function showResult(answer, threadId, agentTrace = [], requiresClarification = false) {
    latestAnswerMarkdown = answer;
    const resultSection = document.getElementById("resultSection");
    const resultBox = document.getElementById("resultBox");
    const tracePanel = document.getElementById("agentTrace");
    const traceList = document.getElementById("agentTraceList");
    resultBox.innerHTML = typeof marked !== "undefined" ? marked.parse(answer) : "";
    if (typeof marked === "undefined") resultBox.innerText = answer;
    document.getElementById("threadInfo").textContent = `Thread ID: ${threadId}`;
    document.getElementById("resultKicker").textContent = requiresClarification ? "One detail needed" : "Step 4 · Your trip";
    document.getElementById("resultTitle").textContent = requiresClarification ? "Help the agent complete your request" : "Your personalised travel plan";
    document.getElementById("resultActions").classList.toggle("hidden", requiresClarification);
    traceList.innerHTML = agentTrace.map(event => `
        <li class="trace-${event.status || "complete"}">
            <span aria-hidden="true"></span>
            <div><strong>${escapeHtml(event.stage || "Workflow step")}</strong><small>${escapeHtml(event.detail || "Completed")}</small></div>
        </li>
    `).join("");
    tracePanel.classList.toggle("hidden", !agentTrace.length);
    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({behavior: "smooth", block: "start"});
}

async function sendMessage() {
    hideError();
    const message = document.getElementById("userInput").value.trim();
    if (!message) {
        showError("Please enter your travel request first.");
        return;
    }
    if (currentFlightSearch?.return_date && selectedFlightOffer && !selectedReturnOffer) {
        showError("Please select a return flight before generating the round-trip itinerary.");
        document.getElementById("returnFlightSection").scrollIntoView({behavior: "smooth", block: "start"});
        return;
    }

    setLoading(true);
    try {
        const response = await fetchWithWakeRetry("/api/travel", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                message,
                thread_id: currentThreadId,
                selected_flight: selectedFlightOffer && (!currentFlightSearch?.return_date || selectedReturnOffer)
                    ? {
                        search: currentFlightSearch,
                        outbound: selectedFlightOffer,
                        return: selectedReturnOffer,
                        total_price: (selectedReturnOffer || selectedFlightOffer).price,
                        currency: (selectedReturnOffer || selectedFlightOffer).currency,
                        comparison: buildFlightComparison()
                    }
                    : null,
                selected_hotel: selectedHotel ? {hotel: selectedHotel, search: currentHotelSearch, comparison: buildHotelComparison()} : null
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Something went wrong.");
        currentThreadId = data.thread_id;
        localStorage.setItem("travel_thread_id", currentThreadId);
        showResult(data.answer, data.thread_id, data.agent_trace || [], Boolean(data.requires_clarification));
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(false);
    }
}

function copyResult() {
    const text = document.getElementById("resultBox").innerText;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const button = document.querySelector(".copy-btn");
        const oldText = button.textContent;
        button.textContent = "Copied!";
        setTimeout(() => { button.textContent = oldText; }, 1400);
    }).catch(() => showError("Could not copy result."));
}

function downloadPDF() {
    const pdfContent = document.getElementById("pdfContent");
    if (!latestAnswerMarkdown || !pdfContent) {
        showError("No travel plan available to download.");
        return;
    }
    const button = document.querySelector(".download-btn");
    const oldText = button.textContent;
    button.textContent = "Preparing PDF...";
    button.disabled = true;
    html2pdf().set({
        margin: 0.5,
        filename: "ai-travel-plan.pdf",
        image: {type: "jpeg", quality: 0.98},
        html2canvas: {scale: 2, useCORS: true, backgroundColor: "#ffffff"},
        jsPDF: {unit: "in", format: "a4", orientation: "portrait"},
        pagebreak: {mode: ["avoid-all", "css", "legacy"]}
    }).from(pdfContent).save().then(() => {
        button.textContent = oldText;
        button.disabled = false;
    }).catch(() => {
        button.textContent = oldText;
        button.disabled = false;
        showError("Could not download PDF.");
    });
}

document.getElementById("flightSearchForm").addEventListener("submit", searchFlights);
document.getElementById("hotelSearchForm").addEventListener("submit", searchHotels);
document.querySelectorAll(".sort-btn").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".sort-btn").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        renderFlightCards(button.dataset.sort);
    });
});
document.querySelectorAll(".hotel-sort-btn").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".hotel-sort-btn").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    renderHotelCards(button.dataset.hotelSort);
}));

const today = new Date().toISOString().split("T")[0];
document.getElementById("flightDepartureDate").min = today;
document.getElementById("flightReturnDate").min = today;
document.getElementById("hotelCheckIn").min = today;
document.getElementById("hotelCheckOut").min = today;
document.getElementById("flightDepartureDate").addEventListener("change", event => {
    document.getElementById("flightReturnDate").min = event.target.value || today;
});
document.getElementById("hotelCheckIn").addEventListener("change", event => {
    document.getElementById("hotelCheckOut").min = event.target.value || today;
});

document.addEventListener("keydown", event => {
    if (event.ctrlKey && event.key === "Enter") sendMessage();
});
