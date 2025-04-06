import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Dictionary for train type names
const trainTypeNames = {
  IC: "InterCity",
  S: "Pendolino",
  P: "Passenger",
  K: "Commuter",
  L: "Commuter",
  E: "Express",
  Y: "Night Train",
  H: "Cargo",
  T: "Cargo",
  M: "Cargo",
  V: "Cargo",
};

// Dictionary for common station codes
const stationCodes = {
  HKI: "Helsinki",
  PSL: "Pasila",
  TPE: "Tampere",
  TKU: "Turku",
  OL: "Oulu",
  OLT: "Oulu tavara",
  KV: "Kouvola",
  LH: "Lahti",
  RI: "Riihimäki",
  KE: "Kerava",
  JY: "Jyväskylä",
  VS: "Vaasa",
  KOK: "Kokkola",
  TKL: "Tikkurila",
  EPO: "Espoo",
  KKN: "Kirkkonummi",
  HML: "Hämeenlinna",
  KTM: "Kontiomäki",
  KMU: "Kotka Mussalo",
  TPET: "Tampere tavara",
};

// Use the Mapbox token from environment variables
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

// Digitraffic API URL
const DIGITRAFFIC_API_URL =
  "https://rata.digitraffic.fi/api/v1/train-locations/latest";

// Main Train Tracker Component
function App() {
  const [trains, setTrains] = useState([]);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshRate, setRefreshRate] = useState(10); // Default refresh rate in seconds
  const [stations, setStations] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  // Helper function to convert train type code to readable name
  const getTrainTypeName = (typeCode) => {
    return trainTypeNames[typeCode] || typeCode || "Unknown";
  };

  // Helper function to convert station code to full name
  const getStationName = (stationCode) => {
    return stationCode
      ? stations[stationCode] || stationCodes[stationCode] || stationCode
      : "Unknown";
  };

  // Function to get station map image
  const getStationMapImage = (stationCode) => {
    const stationName = getStationName(stationCode);
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(
      stationName + ", Finland"
    )}&zoom=15&size=150x150&markers=${encodeURIComponent(
      stationName + ", Finland"
    )},ol-marker-blue`;
  };

  // Function to get more detailed train type information
  const getDetailedTrainType = (train) => {
    if (!train) return "Unknown";

    // If we have detailed train information
    if (train.details) {
      // First check if it has a category
      if (train.details.trainCategory) {
        const category = train.details.trainCategory;

        // For commuter trains, include the line ID if available
        if (category === "Commuter" && train.details.commuterLineID) {
          return `Commuter Line ${train.details.commuterLineID}`;
        }

        // For long-distance trains, include the train type
        if (category === "Long-distance" && train.trainType) {
          return `${getTrainTypeName(train.trainType)} (Long-distance)`;
        }

        // For cargo trains
        if (category === "Cargo") {
          return "Cargo Train";
        }

        return category;
      }
    }

    // If we don't have detailed information, use the basic train type
    if (train.trainType) {
      return getTrainTypeName(train.trainType);
    }

    return "Unknown";
  };

  // Function to get upcoming stations for a train
  const getTrainStopInfo = (train) => {
    if (!train.details || !train.details.timeTableRows) {
      return [];
    }

    const now = new Date();
    const stops = [];
    const timeTableRows = train.details.timeTableRows;

    // Find all stops where the train stops
    for (let i = 0; i < timeTableRows.length; i++) {
      const row = timeTableRows[i];
      if (row.trainStopping) {
        // Convert API time to Date object
        const scheduledTime = new Date(row.scheduledTime);

        // Skip if this is a departure from a station where we already counted the arrival
        if (
          row.type === "DEPARTURE" &&
          stops.length > 0 &&
          stops[stops.length - 1].station === row.stationShortCode
        ) {
          // Just update the departure time for the last stop
          stops[stops.length - 1].departureTime = scheduledTime;
          continue;
        }

        // Add the stop
        stops.push({
          station: row.stationShortCode,
          stationName: getStationName(row.stationShortCode),
          arrivalTime: row.type === "ARRIVAL" ? scheduledTime : null,
          departureTime: row.type === "DEPARTURE" ? scheduledTime : null,
          passed: scheduledTime < now,
          type: row.type,
        });
      }
    }

    return stops;
  };

  // Function to create appropriate label for train
  const createTrainLabel = (train) => {
    // If train number exists
    if (train.trainNumber) {
      // If train type also exists, display both
      if (train.trainType) {
        return `${train.trainType}${train.trainNumber}`;
      }
      // If only number exists
      return `#${train.trainNumber}`;
    }

    // If no identification information is available
    return "Train";
  };

  // Initialize map when component mounts
  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Create the map centered on Finland
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [25.7482, 62.2426], // Center of Finland
      zoom: 5,
    });

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Save map instance to ref
    mapRef.current = map;

    // Cleanup on unmount
    return () => map.remove();
  }, []);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch station data on initial load
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const response = await axios.get(
          "https://rata.digitraffic.fi/api/v1/metadata/stations",
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        // Convert station array to object with station code as key
        const stationMap = {};
        response.data.forEach((station) => {
          stationMap[station.stationShortCode] = station.stationName;
        });

        setStations(stationMap);
      } catch (err) {
        console.error("Failed to fetch station data:", err);
      }
    };

    fetchStations();
  }, []);

  // Function to fetch train locations
  const fetchTrainLocations = async () => {
    try {
      setLoading(true);
      const response = await axios.get(DIGITRAFFIC_API_URL, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      setTrains(response.data);
      setLoading(false);
      return response.data;
    } catch (err) {
      setError(`Failed to fetch train data: ${err.message}`);
      setLoading(false);
      return [];
    }
  };

  // Function to fetch additional train information
  const fetchTrainInfo = async (trainNumber) => {
    try {
      const response = await axios.get(
        `https://rata.digitraffic.fi/api/v1/trains/latest/${trainNumber}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );
      return response.data[0]; // Return the first train object
    } catch (err) {
      console.error(
        `Failed to fetch info for train ${trainNumber}: ${err.message}`
      );
      return null;
    }
  };

  // Update markers on the map
  const updateMarkers = async (trainData) => {
    const map = mapRef.current;

    if (!map || !trainData) return;

    // Remove old markers that are no longer in the data
    const currentTrainIds = new Set(
      trainData.map((train) => (train.trainNumber || "").toString())
    );
    Object.keys(markersRef.current).forEach((trainId) => {
      if (!currentTrainIds.has(trainId) && trainId !== "unknown") {
        markersRef.current[trainId].remove();
        delete markersRef.current[trainId];
      }
    });

    // Add or update markers
    for (const train of trainData) {
      // If train has no location, skip it
      const { location } = train;
      if (!location || !location.coordinates) continue;

      // GeoJSON format is [longitude, latitude]
      const [longitude, latitude] = location.coordinates;

      // Train ID for tracking the marker
      const id = train.trainNumber
        ? train.trainNumber.toString()
        : "unknown-" + Math.random().toString(36).substr(2, 9);

      // Create appropriate label for the train
      const label = createTrainLabel(train);

      // If marker already exists, update its position
      if (markersRef.current[id]) {
        markersRef.current[id].setLngLat([longitude, latitude]);
      } else {
        // Create a new marker element
        const el = document.createElement("div");
        el.className = "train-marker";
        el.textContent = label;

        // Color the marker based on train type
        if (train.trainType === "IC" || train.trainType === "S") {
          el.classList.add("intercity-train");
        } else if (train.trainType === "P") {
          el.classList.add("passenger-train");
        } else if (
          train.trainType === "K" ||
          train.trainType === "L" ||
          train.trainType === "E" ||
          train.trainType === "Y"
        ) {
          el.classList.add("commuter-train");
        } else {
          el.classList.add("cargo-train");
        }

        // Create and save the marker
        const marker = new mapboxgl.Marker(el)
          .setLngLat([longitude, latitude])
          .addTo(map);

        // Add click handler to show train details
        marker.getElement().addEventListener("click", async () => {
          if (!train.trainNumber) {
            // If train number is not available, just show location info
            setSelectedTrain({
              ...train,
              details: null,
              trainType: train.trainType || "Unknown",
            });
          } else {
            // Get detailed train info
            const trainInfo = await fetchTrainInfo(train.trainNumber);
            setSelectedTrain({ ...train, details: trainInfo });
          }
        });

        markersRef.current[id] = marker;
      }
    }
  };

  // Fetch data and update markers on initial load
  useEffect(() => {
    const initialLoad = async () => {
      const data = await fetchTrainLocations();
      updateMarkers(data);
    };

    initialLoad();
  }, []);

  // Set up automatic refresh
  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      const data = await fetchTrainLocations();
      updateMarkers(data);
    }, refreshRate * 1000);

    // Cleanup interval on component unmount or refresh rate change
    return () => clearInterval(refreshInterval);
  }, [refreshRate]);

  // Close the selected train info panel
  const closeTrainInfo = () => {
    setSelectedTrain(null);
  };

  // Update refresh rate
  const handleRefreshRateChange = (e) => {
    const newRate = parseInt(e.target.value, 10);
    setRefreshRate(newRate);
  };

  return (
    <div className="train-tracker-container">
      <header className="app-header">
        <div className="header-main">
          <h1>Finnish Train Tracker</h1>
          <div className="current-time">{currentTime.toLocaleTimeString()}</div>
        </div>
        <div className="controls">
          <label htmlFor="refresh-rate">
            Refresh every:
            <select
              id="refresh-rate"
              value={refreshRate}
              onChange={handleRefreshRateChange}
            >
              <option value="5">5 seconds</option>
              <option value="10">10 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">1 minute</option>
            </select>
          </label>
          <button onClick={fetchTrainLocations} disabled={loading}>
            {loading ? "Loading..." : "Refresh Now"}
          </button>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="map-container" ref={mapContainerRef}>
        {loading && (
          <div className="loading-overlay">Loading train data...</div>
        )}
      </div>

      {selectedTrain && (
        <div className="train-info-panel">
          <button className="close-button" onClick={closeTrainInfo}>
            ×
          </button>
          <h2>
            Train {selectedTrain.trainType || ""}
            {selectedTrain.trainNumber || ""}
          </h2>
          <div className="train-details">
            <p>
              <strong>Train Type:</strong> {getDetailedTrainType(selectedTrain)}
            </p>
            <p>
              <strong>Speed:</strong> {selectedTrain.speed || 0} km/h
            </p>
            <p>
              <strong>Location:</strong>{" "}
              {selectedTrain.location
                ? `${selectedTrain.location.coordinates[1].toFixed(
                    5
                  )}, ${selectedTrain.location.coordinates[0].toFixed(5)}`
                : "Not available"}
            </p>

            {selectedTrain.details && (
              <>
                <p>
                  <strong>Origin:</strong>{" "}
                  {getStationName(
                    selectedTrain.details.timeTableRows?.[0]?.stationShortCode
                  )}
                </p>
                <p>
                  <strong>Destination:</strong>{" "}
                  {getStationName(
                    selectedTrain.details.timeTableRows?.[
                      selectedTrain.details.timeTableRows.length - 1
                    ]?.stationShortCode
                  )}
                </p>
                <p>
                  <strong>Category:</strong>{" "}
                  {selectedTrain.details.trainCategory === "Long-distance"
                    ? "Long-distance"
                    : selectedTrain.details.trainCategory === "Commuter"
                    ? "Commuter"
                    : selectedTrain.details.trainCategory || "Unknown"}
                </p>
                {selectedTrain.details.commuterLineID && (
                  <p>
                    <strong>Commuter Line:</strong>{" "}
                    {selectedTrain.details.commuterLineID}
                  </p>
                )}

                {/* Add the stops information with images */}
                <div className="train-stops">
                  <h3>Stops:</h3>
                  {getTrainStopInfo(selectedTrain).length > 0 ? (
                    <ul className="stops-list">
                      {getTrainStopInfo(selectedTrain).map((stop, index) => (
                        <li
                          key={index}
                          className={
                            stop.passed ? "passed-stop" : "upcoming-stop"
                          }
                        >
                          <div className="station-info">
                            <div className="station-text">
                              <strong>{stop.stationName}</strong>
                              <div>
                                {stop.arrivalTime && (
                                  <span>
                                    Arrival:{" "}
                                    {stop.arrivalTime.toLocaleTimeString()}
                                  </span>
                                )}
                                {stop.departureTime && (
                                  <span>
                                    Departure:{" "}
                                    {stop.departureTime.toLocaleTimeString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <img
                              src={getStationMapImage(stop.station)}
                              alt={stop.stationName}
                              className="station-image"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.style.display = "none";
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No stop information available</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>
          Data provided by{" "}
          <a
            href="https://www.digitraffic.fi/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Digitraffic
          </a>
        </p>
        <p>Total trains visible: {trains.length}</p>
      </footer>
    </div>
  );
}

export default App;
